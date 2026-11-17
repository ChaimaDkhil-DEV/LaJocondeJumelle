import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Page } from '../common/pagination';
import { clientIp, requestPath } from '../common/request-info';
import type { RequestContext } from '../requests/requests.service';
import { RejectTransferDto, TransfersQuery } from './transfers.dto';
import type { TransferView } from './transfers.mapper';
import { TransfersService } from './transfers.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Propositions de transfert de l'utilisateur connecté (018, contracts/api.md) : reçues, envoyées,
 * historique, réponses. Aucune route n'accepte l'identifiant d'un autre administrateur : le destinataire
 * et l'auteur sont toujours lus dans la session.
 */
@Controller('admin/transfers')
@UseGuards(AdministrationGuard)
export class AdminTransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get('received')
  received(@CurrentUser() user: AuthenticatedUser, @Query() query: TransfersQuery): Promise<Page<TransferView>> {
    return this.transfers.list(user, 'received', query);
  }

  @Get('sent')
  sent(@CurrentUser() user: AuthenticatedUser, @Query() query: TransfersQuery): Promise<Page<TransferView>> {
    return this.transfers.list(user, 'sent', query);
  }

  /** Propositions de l'utilisateur qui ne sont plus en attente. Avant `:id`. */
  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: TransfersQuery): Promise<Page<TransferView>> {
    return this.transfers.history(user, query);
  }

  @Get(':id')
  one(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<TransferView> {
    return this.transfers.one(user, id, contextOf(req));
  }

  /** Le destinataire accepte : le responsable de la demande change. */
  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<TransferView> {
    return this.transfers.accept(user, id, contextOf(req));
  }

  /** Le destinataire refuse, motif facultatif : rien ne change de mains. */
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @Req() req: Request,
  ): Promise<TransferView> {
    return this.transfers.reject(user, id, dto.responseReason, contextOf(req));
  }

  /** L'auteur retire sa proposition tant qu'elle est en attente. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<TransferView> {
    return this.transfers.cancel(user, id, contextOf(req));
  }
}
