import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../common/request-info';
import type { Page } from '../common/pagination';
import type { RequestContext } from '../requests/requests.service';
import { CreateMessageDto, ListMessagesQuery } from './messages.dto';
import type { MessageResponse } from './messages.mapper';
import { MessagesService } from './messages.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/** Pas de route de modification ni de suppression : un message envoyé est définitif (FR-012). */
@Controller('requests/:id/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Messages du plus récent au plus ancien, paginés par curseur. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListMessagesQuery,
    @Req() req: Request,
  ): Promise<Page<MessageResponse>> {
    return this.messages.list(user, id, query, contextOf(req));
  }

  /** 201 à la création ; 200 si le même clientId a déjà été reçu. */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponse> {
    const { created, message } = await this.messages.create(user, id, dto, contextOf(req));
    res.status(created ? 201 : 200);
    return message;
  }
}
