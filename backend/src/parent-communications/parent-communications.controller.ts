import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ParentAllowed } from '../auth/parent-allowed.decorator';
import { clientIp } from '../common/request-info';
import { GuardiansService } from './guardians.service';
import {
  CommunicationTeacherGuard,
  CommunicationValidatorGuard,
} from './parent-communications.guards';
import {
  CreateCommunicationDto,
  DecisionDto,
  DiscussionsQuery,
  GuardianAccountDto,
  GuardianDto,
  ListCommunicationsQuery,
  ParentMessageDto,
  ParentResubmitDto,
  TeacherClassesDto,
  UpdateCommunicationDto,
  UpdateGuardianDto,
  VersionDto,
} from './parent-communications.dto';
import { ParentCommunicationsService } from './parent-communications.service';

/** « Communication avec les parents » : espace de l'enseignant (membre du groupe Enseignants). */
@UseGuards(CommunicationTeacherGuard)
@Controller('parent-communications')
export class TeacherCommunicationsController {
  constructor(private readonly communications: ParentCommunicationsService) {}

  @Get('students')
  students(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.teacherStudents(user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.listMine(user);
  }

  /** Déclarées avant `:id` : « conversations » n'est pas un identifiant. */
  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.teacherConversations(user);
  }

  /** Conversation d'un message (lien d'une notification). */
  @Get('messages/:id/conversation')
  messageConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.communications.teacherMessageConversation(user, id);
  }

  @Get('conversations/:studentId/:guardianId')
  conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Param('guardianId') guardianId: string,
    @Req() req: Request,
  ) {
    return this.communications.teacherConversation(user, studentId, guardianId, clientIp(req));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.communications.getMine(user, id);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateCommunicationDto,
    @Req() req: Request,
  ) {
    return this.communications.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommunicationDto,
    @Req() req: Request,
  ) {
    return this.communications.update(id, dto, { actor, ip: clientIp(req) });
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.communications.submit(id, dto.version, { actor, ip: clientIp(req) });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.communications.cancel(id, dto.version, { actor, ip: clientIp(req) });
  }
}

/** « Communications à valider » : permission PARENT_COMMUNICATION_VALIDATE (garde, puis service). */
@UseGuards(CommunicationValidatorGuard)
@Controller('admin/parent-communications')
export class ValidationCommunicationsController {
  constructor(private readonly communications: ParentCommunicationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCommunicationsQuery) {
    return this.communications.listForValidation(user, query);
  }

  /** Déclarée avant `:id` : « discussions » n'est pas un identifiant. */
  @Get('discussions')
  discussions(@CurrentUser() user: AuthenticatedUser, @Query() query: DiscussionsQuery) {
    return this.communications.listDiscussions(user, query);
  }

  @Get(':id/discussion')
  discussion(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.communications.getDiscussion(user, id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.communications.getForValidation(user, id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @Req() req: Request,
  ) {
    return this.communications.decide(id, dto, { actor, ip: clientIp(req) });
  }
}

/** « Messages de l'école » : espace du parent (rôle PARENT). */
@ParentAllowed()
@Controller('parent/messages')
export class ParentMessagesController {
  constructor(private readonly communications: ParentCommunicationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.parentList(user);
  }

  /** Enfants du parent et enseignants affectés à leur classe. Routes déclarées avant `:id`. */
  @Get('children')
  children(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.parentChildren(user);
  }

  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.communications.parentConversations(user);
  }

  @Get('conversations/:teacherId/:studentId')
  conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
    @Param('studentId') studentId: string,
    @Req() req: Request,
  ) {
    return this.communications.parentConversation(user, teacherId, studentId, clientIp(req));
  }

  /** Démarre la conversation (premier message) ou la poursuit : le message part à la validation. */
  @Post('conversations/:teacherId/:studentId')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
    @Param('studentId') studentId: string,
    @Body() dto: ParentMessageDto,
    @Req() req: Request,
  ) {
    return this.communications.parentSend(user, teacherId, studentId, dto, clientIp(req));
  }

  @Post(':id/resubmit')
  @HttpCode(200)
  resubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ParentResubmitDto,
    @Req() req: Request,
  ) {
    return this.communications.parentResubmit(user, id, dto, clientIp(req));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.communications.parentCancel(user, id, dto.version, clientIp(req));
  }

  /** Conversation d'un message (lien d'une notification). */
  @Get(':id/conversation')
  messageConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.communications.parentMessageConversation(user, id);
  }

  @Get(':id')
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.communications.parentRead(user, id, clientIp(req));
  }
}

/** Représentants légaux et classes des enseignants : admin et super administrateur (comme les élèves). */
@Controller('admin')
@UseGuards(AdministrationGuard)
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get('guardians')
  list() {
    return this.guardians.list();
  }

  @Post('guardians')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: GuardianDto, @Req() req: Request) {
    return this.guardians.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch('guardians/:id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGuardianDto,
    @Req() req: Request,
  ) {
    return this.guardians.update(id, dto, { actor, ip: clientIp(req) });
  }

  @Post('guardians/:id/account')
  createAccount(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuardianAccountDto,
    @Req() req: Request,
  ) {
    return this.guardians.createAccount(id, dto, { actor, ip: clientIp(req) });
  }

  @Get('teacher-classes')
  teacherClasses() {
    return this.guardians.teacherClasses();
  }

  @Put('teacher-classes/:teacherId')
  setTeacherClasses(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
    @Body() dto: TeacherClassesDto,
    @Req() req: Request,
  ) {
    return this.guardians.setTeacherClasses(teacherId, dto, { actor, ip: clientIp(req) });
  }
}
