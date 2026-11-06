import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { MealServiceGuard } from './meal-service.guard';
import { StudentMealService } from './student-meal.service';
import { ChangeMealServiceDto } from './students.dto';

/** Service de restauration des élèves : hors de /admin, car ouvert au rôle ADMIN (surveillante générale). */
@Controller('meal-services')
@UseGuards(MealServiceGuard)
export class StudentMealController {
  constructor(private readonly meals: StudentMealService) {}

  @Get('students')
  list() {
    return this.meals.list();
  }

  @Patch('students/:id')
  change(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: ChangeMealServiceDto, @Req() req: Request) {
    return this.meals.change(id, dto, { actor, ip: clientIp(req) });
  }

  @Get('students/:id/history')
  history(@Param('id') id: string) {
    return this.meals.history(id);
  }
}
