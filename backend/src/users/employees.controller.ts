import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdministrationGuard } from '../audit/administration.guard';
import { UsersService, type EmployeeListItem } from './users.service';

/** Liste des employés en lecture seule : admin et super administrateur (011, FR-004, FR-005). */
@Controller('admin/employees')
@UseGuards(AdministrationGuard)
export class EmployeesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<EmployeeListItem[]> {
    return this.users.listEmployees();
  }
}
