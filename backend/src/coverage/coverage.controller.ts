import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../common/request-info';
import type { RequestContext } from '../requests/requests.service';
import { CoverageActionsService } from './coverage-actions.service';
import { CoverageDeclarationsService } from './coverage-declarations.service';
import { CoverageStatsService } from './coverage-stats.service';
import {
  CoverageActionDto,
  CoverageStatsQuery,
  CreateCoverageDto,
  EmptyClassDto,
  ListCoverageQuery,
  ListMergeProposalsQuery,
  MergeDecisionDto,
  OwnAvailabilityDto,
  ResolveQrDto,
  SetAvailabilityDto,
  SlotCandidatesQuery,
  TeacherRequestDto,
  UpdateTeacherRequestDto,
} from './coverage.dto';
import { CoverageService } from './coverage.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Affectations des surveillants (004). Toutes les règles d'accès sont vérifiées côté serveur
 * (coverage/domain/coverage-policy.ts) ; les transitions passent par la machine à états.
 */
@Controller('coverage')
export class CoverageController {
  constructor(
    private readonly coverage: CoverageService,
    private readonly actions: CoverageActionsService,
    private readonly declarations: CoverageDeclarationsService,
    private readonly statsService: CoverageStatsService,
  ) {}

  /** Admins et super administrateur : statistiques (FR-022) ; aucun export. */
  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser, @Query() query: CoverageStatsQuery, @Req() req: Request) {
    return this.statsService.stats(user, query, contextOf(req));
  }

  /** Formulaire d'affectation directe (admins) : classes et enseignants. */
  @Get('form-options')
  formOptions(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.formOptions(user, contextOf(req));
  }

  /** Affectation directe ; 201 à la création, 200 pour un renvoi du même clientId. */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoverageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, detail } = await this.coverage.create(user, dto, contextOf(req));
    res.status(created ? 201 : 200);
    return detail;
  }

  /** Surveillant : déclarer une classe vide ; 201 pour une nouvelle déclaration, 200 pour un renvoi du même clientId. */
  @Post('empty-class')
  async declareEmptyClass(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmptyClassDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, result } = await this.declarations.declareEmptyClass(user, dto, contextOf(req));
    res.status(created ? 201 : 200);
    return result;
  }

  /** Enseignants (choix facultatif à la déclaration d'une classe vide, FR-015a). */
  @Get('teachers')
  teachers(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.declarations.teachers(user, contextOf(req));
  }

  /** Admins : surveillants proposables pour un créneau (formulaire d'affectation directe). */
  @Get('candidates')
  slotCandidates(@CurrentUser() user: AuthenticatedUser, @Query() query: SlotCandidatesQuery, @Req() req: Request) {
    return this.coverage.slotCandidates(user, query, contextOf(req));
  }

  /** Admins : propositions de rattachement (doublons possibles). */
  @Get('merge-proposals')
  mergeProposals(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMergeProposalsQuery, @Req() req: Request) {
    return this.declarations.mergeProposals(user, query, contextOf(req));
  }

  @Post('merge-proposals/:id/decision')
  @HttpCode(200)
  decideMerge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MergeDecisionDto, @Req() req: Request) {
    return this.declarations.decideMerge(user, id, dto, contextOf(req));
  }

  /** Enseignant : signaler un retard ou une absence ; 201 à la création, 200 pour un renvoi du même clientId. */
  @Post('teacher-requests')
  async createTeacherRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TeacherRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, detail } = await this.coverage.createTeacherRequest(user, dto, contextOf(req));
    res.status(created ? 201 : 200);
    return detail;
  }

  /** Enseignant : ses signalements. */
  @Get('my-requests')
  myRequests(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.myRequests(user, contextOf(req));
  }

  /** Toutes les classes actives (formulaires de l'enseignant et du surveillant). */
  @Get('classes')
  classes(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.classes(user, contextOf(req));
  }

  /** Enseignant auteur : modifier sa demande tant qu'elle est « en attente » (FR-008g). */
  @Patch(':id/teacher-request')
  updateTeacherRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherRequestDto,
    @Req() req: Request,
  ) {
    return this.coverage.updateTeacherRequest(user, id, dto, contextOf(req));
  }

  /** Liste des affectations (admins, super administrateur). */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCoverageQuery, @Req() req: Request) {
    return this.coverage.list(user, query, contextOf(req));
  }

  /** Surveillant : ses affectations et renforts en cours. */
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.mine(user, contextOf(req));
  }

  /** Surveillant : historique personnel. */
  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.history(user, contextOf(req));
  }

  @Get('availability')
  availability(@CurrentUser() user: AuthenticatedUser) {
    return this.coverage.myAvailability(user);
  }

  /** Surveillant : se déclarer disponible ou indisponible. */
  @Patch('availability')
  setOwnAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: OwnAvailabilityDto, @Req() req: Request) {
    return this.coverage.setOwnAvailability(user, dto, contextOf(req));
  }

  /** Admins : surveillants et disponibilités. */
  @Get('team')
  team(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.team(user, contextOf(req));
  }

  /** Admins : disponibilité d'un surveillant (y compris « Absent »). */
  @Patch('team/:userId/availability')
  setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: SetAvailabilityDto,
    @Req() req: Request,
  ) {
    return this.coverage.setAvailability(user, userId, dto, contextOf(req));
  }

  /** Page du QR code : affiche la classe et l'affectation concernée, sans rien enregistrer. */
  @Post('presence/resolve')
  @HttpCode(200)
  resolveQr(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResolveQrDto, @Req() req: Request) {
    return this.coverage.resolveQr(user, dto.token, contextOf(req));
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.coverage.detail(user, id, contextOf(req));
  }

  /** Admins : surveillants proposables, étage de la classe d'abord, avec leur disponibilité. */
  @Get(':id/candidates')
  candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.coverage.candidates(user, id, contextOf(req));
  }

  /** Transition de statut validée par la machine à états ; renvoie l'affectation à jour. */
  @Post(':id/actions')
  @HttpCode(200)
  async act(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CoverageActionDto, @Req() req: Request) {
    const ctx = contextOf(req);
    await this.actions.perform(user, id, dto, ctx);
    return this.coverage.detail(user, id, ctx);
  }
}
