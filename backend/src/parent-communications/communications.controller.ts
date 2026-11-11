import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ParentAllowed } from '../auth/parent-allowed.decorator';
import { clientIp } from '../common/request-info';
import { ConversationsService } from './conversations.service';
import { CommunicationTeacherGuard, CommunicationValidatorGuard } from './parent-communications.guards';
import {
  AdminStartConversationDto,
  ConversationsQuery,
  DecisionDto,
  EditMessageDto,
  MessageBodyDto,
  RecipientsQuery,
  ResponsibleDto,
  StartConversationDto,
  ToValidateQuery,
  VersionDto,
} from './parent-communications.dto';
import { ParentCommunicationsService } from './parent-communications.service';

/** « Communications » de l'enseignant (017) : ses signalements à l'administration, ses archives 015. */
@UseGuards(CommunicationTeacherGuard)
@Controller('communications/teacher')
export class TeacherCommunicationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get('students')
  students(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.teacherStudents(user);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.teacherConversations(user);
  }

  @Post('conversations')
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartConversationDto, @Req() req: Request) {
    return this.conversations.teacherStart(user, dto, clientIp(req));
  }

  @Get('conversations/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.conversations.teacherConversation(user, id, clientIp(req));
  }

  @Post('conversations/:id/messages')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MessageBodyDto, @Req() req: Request) {
    return this.conversations.teacherPost(user, id, dto, clientIp(req));
  }
}

/** « Messages de l'école » (017) : conversations du parent avec l'école, ses archives 015. */
@ParentAllowed()
@Controller('parent/messages')
export class ParentMessagesController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get('children')
  children(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.parentChildren(user);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.parentConversations(user);
  }

  @Post('conversations')
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartConversationDto, @Req() req: Request) {
    return this.conversations.parentStart(user, dto, clientIp(req));
  }

  @Get('conversations/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.conversations.parentConversation(user, id, clientIp(req));
  }

  @Post('conversations/:id/messages')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MessageBodyDto, @Req() req: Request) {
    return this.conversations.parentPost(user, id, dto, clientIp(req));
  }

  /** Anciens liens de notification (/messages-ecole/:id) : conversation du message. */
  @Get('by-message/:messageId')
  byMessage(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string, @Req() req: Request) {
    return this.conversations.parentConversationOfMessage(user, messageId, clientIp(req));
  }
}

/** « Communications » de l'administration (017) : ADMIN et SUPER_ADMIN actifs (boîte commune). */
@UseGuards(AdministrationGuard)
@Controller('admin/communications')
export class AdminCommunicationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly validation: ParentCommunicationsService,
  ) {}

  @Get('inbox')
  inbox(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.inbox(user);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ConversationsQuery) {
    return this.conversations.adminConversations(user, query);
  }

  @Post('conversations')
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdminStartConversationDto, @Req() req: Request) {
    return this.conversations.adminStart(user, dto, clientIp(req));
  }

  @Get('conversations/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.conversations.adminConversation(user, id, clientIp(req));
  }

  @Post('conversations/:id/messages')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MessageBodyDto, @Req() req: Request) {
    return this.conversations.adminPost(user, id, dto, clientIp(req));
  }

  @Post('conversations/:id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.conversations.close(user, id, clientIp(req));
  }

  @Post('conversations/:id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.conversations.reopen(user, id, clientIp(req));
  }

  @Put('conversations/:id/responsible')
  responsible(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResponsibleDto, @Req() req: Request) {
    return this.conversations.setResponsible(user, id, dto.adminId, clientIp(req));
  }

  @Get('recipients')
  recipients(@Query() query: RecipientsQuery) {
    return this.conversations.recipients(query.studentId);
  }

  @Get('send-mode')
  sendMode(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.sendModeOf(user);
  }

  // « À valider » : messages de l'administration aux parents (permission de validation).

  @Get('to-validate')
  @UseGuards(CommunicationValidatorGuard)
  toValidate(@CurrentUser() user: AuthenticatedUser, @Query() query: ToValidateQuery) {
    return this.validation.toValidate(user, query);
  }

  @Get('messages/:id')
  @UseGuards(CommunicationValidatorGuard)
  message(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.validation.messageDetail(user, id);
  }

  @Post('messages/:id/decision')
  @HttpCode(200)
  @UseGuards(CommunicationValidatorGuard)
  decide(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: DecisionDto, @Req() req: Request) {
    return this.validation.decide(id, dto, { actor, ip: clientIp(req) });
  }

  // Correction par l'auteur d'un message retourné (tout membre de l'administration, pour ses messages).

  @Patch('messages/:id')
  edit(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: EditMessageDto, @Req() req: Request) {
    return this.validation.edit(id, dto, { actor, ip: clientIp(req) });
  }

  @Post('messages/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: VersionDto, @Req() req: Request) {
    return this.validation.submit(id, dto.version, { actor, ip: clientIp(req) });
  }

  @Post('messages/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: VersionDto, @Req() req: Request) {
    return this.validation.cancel(id, dto.version, { actor, ip: clientIp(req) });
  }
}
