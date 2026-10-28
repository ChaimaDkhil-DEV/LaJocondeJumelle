import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AdminContext } from '../users/users.service';
import type { CreateGuidelineDto, UpdateGuidelineDto } from './guidelines.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nombre de consignes transmises au fournisseur, et longueur de l'extrait affiché (research R5). */
const SEARCH_LIMIT = 5;
const EXCERPT_LENGTH = 200;

export interface AdminGuideline {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  categoryName: string | null;
  active: boolean;
  updatedAt: Date;
  updatedBy: { id: string; displayName: string };
}

export interface FoundGuideline {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  excerpt: string;
}

const GUIDELINE_INCLUDE = {
  category: { select: { name: true } },
  updatedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.GuidelineInclude;

type GuidelineRow = Prisma.GuidelineGetPayload<{ include: typeof GUIDELINE_INCLUDE }>;

const GUIDELINE_FIELDS = ['title', 'body', 'categoryId', 'active'] as const;
type GuidelineField = (typeof GUIDELINE_FIELDS)[number];

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

function toAdminGuideline(row: GuidelineRow): AdminGuideline {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    active: row.active,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function excerpt(body: string): string {
  if (body.length <= EXCERPT_LENGTH) return body;
  const cut = body.slice(0, EXCERPT_LENGTH - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > EXCERPT_LENGTH / 2 ? cut.slice(0, space) : cut}…`;
}

/**
 * Consignes de l'établissement (spec 009, US3) : gérées par le super administrateur, auditées
 * par leur titre seulement, et recherchées dans les seules catégories autorisées (FR-016).
 */
@Injectable()
export class GuidelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminGuideline[]> {
    const rows = await this.prisma.guideline.findMany({ include: GUIDELINE_INCLUDE });
    return rows.map(toAdminGuideline).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }

  async create(dto: CreateGuidelineDto, ctx: AdminContext): Promise<AdminGuideline> {
    await this.checkCategory(dto.categoryId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guideline.create({
        data: { title: dto.title, body: dto.body, categoryId: dto.categoryId, active: dto.active ?? true, updatedById: ctx.actor.id },
        include: GUIDELINE_INCLUDE,
      });
      await this.logChange(tx, ctx, created.id, { action: 'CREATED', title: created.title, categoryId: created.categoryId });
      return created;
    });
    return toAdminGuideline(row);
  }

  async update(id: string, dto: UpdateGuidelineDto, ctx: AdminContext): Promise<AdminGuideline> {
    const current = await this.find(id);
    if (dto.categoryId !== undefined) await this.checkCategory(dto.categoryId);
    const changed = GUIDELINE_FIELDS.filter((f) => dto[f] !== undefined && dto[f] !== current[f]);
    if (changed.length === 0) return toAdminGuideline(current);

    const data = Object.fromEntries(changed.map((f) => [f, dto[f]])) as Pick<Prisma.GuidelineUncheckedUpdateInput, GuidelineField>;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.guideline.update({
        where: { id },
        data: { ...data, updatedById: ctx.actor.id },
        include: GUIDELINE_INCLUDE,
      });
      await this.logChange(tx, ctx, id, {
        action: 'UPDATED',
        title: updated.title,
        fields: changed,
        ...(changed.includes('categoryId') ? { categoryId: updated.categoryId } : {}),
        ...(changed.includes('active') ? { after: { active: updated.active } } : {}),
      });
      return updated;
    });
    return toAdminGuideline(row);
  }

  async remove(id: string, ctx: AdminContext): Promise<void> {
    const current = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.guideline.delete({ where: { id } });
      await this.logChange(tx, ctx, id, { action: 'DELETED', title: current.title });
    });
  }

  /**
   * Consignes actives les plus proches du texte, générales ou des catégories autorisées (research R5).
   * Chaque mot du texte devient un lexème cité (`quote_literal`) : aucun opérateur tsquery n'est
   * interprété, quel que soit le texte saisi. À pertinence égale, la consigne propre à une
   * catégorie passe avant les consignes générales.
   */
  async search(text: string, allowedCategoryIds: string[]): Promise<FoundGuideline[]> {
    if (!text.trim()) return [];
    const rows = await this.prisma.$queryRaw<Array<{ id: string; title: string; body: string; categoryId: string | null }>>`
      WITH q AS (
        SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) AS query
        FROM unnest(to_tsvector('french', ${text}))
      )
      SELECT g."id", g."title", g."body", g."categoryId"
      FROM "Guideline" g, q
      WHERE q.query IS NOT NULL
        AND g."active" = true
        AND (g."categoryId" IS NULL OR g."categoryId" = ANY(${allowedCategoryIds}::uuid[]))
        AND ts_rank(to_tsvector('french', g."title" || ' ' || g."body"), q.query) > 0
      ORDER BY ts_rank(to_tsvector('french', g."title" || ' ' || g."body"), q.query) DESC,
        (g."categoryId" IS NOT NULL) DESC,
        g."title"
      LIMIT ${SEARCH_LIMIT}
    `;
    return rows.map((row) => ({ ...row, excerpt: excerpt(row.body) }));
  }

  /** Portée : générale, ou une catégorie de demande de travail existante. */
  private async checkCategory(categoryId: string | null): Promise<void> {
    if (categoryId === null) return;
    const category = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { kind: true } });
    if (!category || category.kind !== 'WORK') {
      throw invalid('categoryId', 'Choisissez une catégorie de demande de travail.');
    }
  }

  private async find(id: string): Promise<GuidelineRow> {
    const row = UUID.test(id) ? await this.prisma.guideline.findUnique({ where: { id }, include: GUIDELINE_INCLUDE }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  private logChange(tx: Prisma.TransactionClient, ctx: AdminContext, id: string, details: Record<string, unknown>): Promise<void> {
    return this.audit.log(
      'GUIDELINE_CHANGED',
      { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Guideline', targetId: id, details: { ...details, guidelineId: id } },
      tx,
    );
  }
}
