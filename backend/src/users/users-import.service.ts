import { Injectable } from '@nestjs/common';
import { Prisma, type Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { toCsv } from '../common/csv';
import { normalizeText } from '../common/csv-parse';
import {
  buildReport,
  fileRefused,
  indexByName,
  mapPool,
  readImportFile,
  resolveName,
  splitList,
  validateWithDto,
  type ColumnsSpec,
  type ImportCsvDto,
  type ImportReport,
  type ProcessedRow,
} from '../common/csv-import';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto } from './users.dto';
import { temporaryPassword, type AdminContext } from './users.service';

/** Colonnes du fichier de comptes ; le premier titre de chaque liste est celui du modèle téléchargeable. */
const COLUMNS: ColumnsSpec<'identifiant' | 'nom_affiche' | 'fonction' | 'role' | 'groupes' | 'etage' | 'categories'> = {
  identifiant: { aliases: ['identifiant', 'login', 'utilisateur', 'username'], required: true },
  nom_affiche: { aliases: ['nom_affiche', 'nom', 'nom_complet', 'nom_et_prenom', 'nom_prenom', 'prenom_nom'], required: true },
  fonction: { aliases: ['fonction', 'poste', 'titre'] },
  role: { aliases: ['role', 'profil'] },
  groupes: { aliases: ['groupes', 'groupe'] },
  etage: { aliases: ['etage'] },
  categories: { aliases: ['categories', 'categorie', 'destinataire_de'] },
};

/** Au plus autant de comptes par fichier : le hachage des mots de passe provisoires est volontairement lent. */
export const MAX_ACCOUNTS_PER_IMPORT = 500;
/** Hachages argon2 simultanés : borné pour ne pas saturer la mémoire du serveur. */
const HASH_CONCURRENCY = 4;

const ROLE_LABELS: Record<string, string> = { EMPLOYEE: 'Employé', ADMIN: 'Admin' };

/** Rôles acceptables dans un fichier. Le super administrateur ne s'attribue jamais par import. */
function parseRole(value: string, errors: string[]): Role {
  switch (normalizeText(value)) {
    case '':
    case 'employe':
    case 'employee':
      return 'EMPLOYEE';
    case 'admin':
    case 'administrateur':
      return 'ADMIN';
    case 'super administrateur':
    case 'super admin':
    case 'super_admin':
    case 'superadmin':
      errors.push('Le rôle super administrateur ne peut pas être attribué par un import : créez ce compte à la main.');
      return 'EMPLOYEE';
    default:
      errors.push(`Rôle inconnu : « ${value} ». Valeurs possibles : employé, admin.`);
      return 'EMPLOYEE';
  }
}

export interface ImportedAccount {
  username: string;
  displayName: string;
  temporaryPassword: string;
}

export interface AccountsImportReport extends ImportReport {
  /** Présents seulement à la création, et jamais redonnés : les mots de passe provisoires ne sont pas conservés en clair. */
  accounts?: ImportedAccount[];
  /** Les mêmes mots de passe au format CSV (séparateur « ; », BOM), à remettre aux personnes concernées. */
  passwordsCsv?: string;
}

interface PreparedAccount {
  id: string;
  username: string;
  displayName: string;
  jobTitle: string | null;
  role: Role;
  floorId: string | null;
  groupIds: string[];
  categoryIds: string[];
}

/**
 * Import de comptes depuis un fichier CSV. Tout ou rien : le fichier est d'abord vérifié en entier (aperçu), et
 * rien n'est créé tant qu'une ligne est en erreur. Les règles sont celles du formulaire « Nouveau compte ».
 */
@Injectable()
export class UsersImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async run(dto: ImportCsvDto, ctx: AdminContext): Promise<AccountsImportReport> {
    const read = readImportFile(dto.csv, COLUMNS, MAX_ACCOUNTS_PER_IMPORT);
    if (read.fileErrors.length > 0) return fileRefused(dto.dryRun, read.fileErrors);

    const [groups, floors, categories, existing] = await Promise.all([
      this.prisma.employeeGroup.findMany({ where: { active: true }, select: { id: true, name: true } }),
      this.prisma.floor.findMany({ where: { active: true }, select: { id: true, name: true } }),
      this.prisma.category.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({
        where: { username: { in: read.rows.map((r) => r.values.identifiant.trim().toLowerCase()).filter((u) => u !== '') } },
        select: { username: true },
      }),
    ]);
    const groupIndex = indexByName(groups, (g) => g.name);
    const floorIndex = indexByName(floors, (f) => f.name);
    const categoryIndex = indexByName(categories, (c) => c.name);
    const taken = new Set(existing.map((u) => u.username));
    const seen = new Map<string, number>();

    const processed: ProcessedRow[] = [];
    const prepared: PreparedAccount[] = [];
    for (const row of read.rows) {
      const { values } = row;
      const errors = [...row.errors];
      const role = parseRole(values.role, errors);
      const groupIds: string[] = [];
      for (const name of splitList(values.groupes)) {
        const group = resolveName(groupIndex, name, 'Groupe', errors);
        if (group) groupIds.push(group.id);
      }
      const categoryIds: string[] = [];
      for (const name of splitList(values.categories)) {
        const category = resolveName(categoryIndex, name, 'Catégorie', errors, true);
        if (category) categoryIds.push(category.id);
      }
      const floor = values.etage === '' ? null : resolveName(floorIndex, values.etage, 'Étage', errors);

      // Mêmes règles que le formulaire : on passe par la classe de validation du compte.
      const checked = validateWithDto(CreateUserDto, {
        username: values.identifiant,
        displayName: values.nom_affiche,
        jobTitle: values.fonction,
        role,
        recipientCategoryIds: categoryIds,
        ...(floor ? { floorId: floor.id } : {}),
      });
      errors.push(...checked.errors);

      const username = checked.value?.username;
      if (username) {
        const first = seen.get(username);
        if (first !== undefined) errors.push(`Identifiant en double dans le fichier (déjà ligne ${first}).`);
        else seen.set(username, row.line);
        if (taken.has(username)) errors.push('Cet identifiant est déjà utilisé.');
      }

      const label = values.identifiant === '' ? `Ligne ${row.line}` : `${values.nom_affiche || '(sans nom)'} (${values.identifiant})`;
      const detail = [ROLE_LABELS[role], values.groupes && `groupes : ${splitList(values.groupes).join(', ')}`, floor && floor.name]
        .filter(Boolean)
        .join(' · ');
      processed.push({ line: row.line, label, detail, errors });
      if (errors.length === 0 && checked.value) {
        prepared.push({
          id: randomUUID(),
          username: checked.value.username,
          displayName: checked.value.displayName,
          jobTitle: checked.value.jobTitle ?? null,
          role,
          floorId: floor?.id ?? null,
          groupIds,
          categoryIds,
        });
      }
    }

    if (dto.dryRun || prepared.length !== processed.length) return buildReport(dto.dryRun, processed, false);
    return this.create(dto, ctx, processed, prepared);
  }

  /** Crée tous les comptes dans une seule transaction : une erreur n'en laisse aucun. */
  private async create(dto: ImportCsvDto, ctx: AdminContext, processed: ProcessedRow[], prepared: PreparedAccount[]): Promise<AccountsImportReport> {
    const passwords = prepared.map(() => temporaryPassword());
    // Hachage hors transaction : lent par conception, il ne doit pas garder une transaction ouverte.
    const hashes = await mapPool(passwords, HASH_CONCURRENCY, (password) => this.auth.hashPassword(password));
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.user.createMany({
            data: prepared.map((account, i) => ({
              id: account.id,
              username: account.username,
              displayName: account.displayName,
              jobTitle: account.jobTitle,
              role: account.role,
              passwordHash: hashes[i],
              mustChangePassword: true,
              floorId: account.floorId,
            })),
          });
          await tx.employeeGroupMember.createMany({
            data: prepared.flatMap((account) => account.groupIds.map((groupId) => ({ groupId, userId: account.id }))),
          });
          await tx.categoryRecipient.createMany({
            data: prepared.flatMap((account) => account.categoryIds.map((categoryId) => ({ categoryId, userId: account.id }))),
          });
          for (const account of prepared) {
            await this.audit.log(
              'USER_CREATED',
              {
                actorId: ctx.actor.id,
                ip: ctx.ip,
                targetType: 'User',
                targetId: account.id,
                details: {
                  source: 'import',
                  groupIds: account.groupIds,
                  after: {
                    username: account.username,
                    displayName: account.displayName,
                    jobTitle: account.jobTitle,
                    role: account.role,
                    recipientCategoryIds: [...account.categoryIds].sort(),
                  },
                },
              },
              tx,
            );
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ...fileRefused(dto.dryRun, ['Un identifiant a été créé entre-temps par une autre personne : relancez la vérification du fichier.']) };
      }
      throw error;
    }

    const accounts = prepared.map((account, i) => ({ username: account.username, displayName: account.displayName, temporaryPassword: passwords[i] }));
    return {
      ...buildReport(dto.dryRun, processed, true),
      accounts,
      passwordsCsv: toCsv(
        ['Identifiant', 'Nom', 'Mot de passe provisoire'],
        accounts.map((a) => [a.username, a.displayName, a.temporaryPassword]),
      ),
    };
  }
}
