import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../auth/request-info';
import type { RequestContext } from '../requests/requests.service';
import { CoverageActionsService } from './coverage-actions.service';
import {
  CoverageActionDto,
  CreateCoverageDto,
  ListCoverageQuery,
  OwnAvailabilityDto,
  ResolveQrDto,
  SetAvailabilityDto,
} from './coverage.dto';
import { CoverageService } from './coverage.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Couvertures de classe. Toutes les règles d'accès sont vérifiées côté serveur
 * (coverage/domain/coverage-policy.ts) ; les transitions passent par la machine à états.
 */
@Controller('coverage')
export class CoverageController {
  constructor(
    private readonly coverage: CoverageService,
    private readonly actions: CoverageActionsService,
  ) {}

  /** Formulaire de création rapide (responsables) : catégories, classes, groupes et disponibles par groupe. */
  @Get('form-options')
  formOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.coverage.formOptions(user);
  }

  /** Diffusion d'une demande de couverture ; 201 à la création, 200 pour un renvoi du même clientId. */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoverageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, detail, notifiedCount } = await this.coverage.create(user, dto, contextOf(req));
    res.status(created ? 201 : 200);
    return { ...detail, notifiedCount };
  }

  /** Liste des couvertures gérées (responsables, super administrateur). */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCoverageQuery, @Req() req: Request) {
    return this.coverage.list(user, query, contextOf(req));
  }

  /** Employé : demandes à prendre de ses groupes. */
  @Get('open')
  open(@CurrentUser() user: AuthenticatedUser) {
    return this.coverage.open(user);
  }

  /** Employé : sa ou ses gardes en cours. */
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.mine(user, contextOf(req));
  }

  /** Employé : historique personnel. */
  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.coverage.history(user);
  }

  @Get('availability')
  availability(@CurrentUser() user: AuthenticatedUser) {
    return this.coverage.myAvailability(user);
  }

  /** Employé : se déclarer disponible ou indisponible. */
  @Patch('availability')
  setOwnAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: OwnAvailabilityDto, @Req() req: Request) {
    return this.coverage.setOwnAvailability(user, dto, contextOf(req));
  }

  /** Responsables : équipe et disponibilités. */
  @Get('team')
  team(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.coverage.team(user, contextOf(req));
  }

  /** Responsables : disponibilité d'un employé (y compris « Absent »). */
  @Patch('team/:userId/availability')
  setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: SetAvailabilityDto,
    @Req() req: Request,
  ) {
    return this.coverage.setAvailability(user, userId, dto, contextOf(req));
  }

  /** Page du QR code : affiche la classe et la garde concernée, sans rien enregistrer. */
  @Post('presence/resolve')
  @HttpCode(200)
  resolveQr(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResolveQrDto) {
    return this.coverage.resolveQr(user, dto.token);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.coverage.detail(user, id, contextOf(req));
  }

  /** Responsables : employés affectables, avec leur disponibilité. */
  @Get(':id/candidates')
  candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.coverage.candidates(user, id, contextOf(req));
  }

  /** Transition de statut validée par la machine à états ; renvoie la couverture à jour. */
  @Post(':id/actions')
  @HttpCode(200)
  async act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CoverageActionDto,
    @Req() req: Request,
  ) {
    const ctx = contextOf(req);
    await this.actions.perform(user, id, dto, ctx);
    return this.coverage.detail(user, id, ctx);
  }
}
