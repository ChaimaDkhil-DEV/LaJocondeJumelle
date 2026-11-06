import { Module } from '@nestjs/common';
import { MealServiceGuard } from './meal-service.guard';
import { StudentMealController } from './student-meal.controller';
import { StudentMealService } from './student-meal.service';
import { StudentsController } from './students.controller';
import { StudentsImportService } from './students-import.service';
import { StudentsService } from './students.service';

/** Niveaux scolaires, élèves et service de restauration. */
@Module({
  controllers: [StudentsController, StudentMealController],
  providers: [StudentsService, StudentsImportService, StudentMealService, MealServiceGuard],
})
export class StudentsModule {}
