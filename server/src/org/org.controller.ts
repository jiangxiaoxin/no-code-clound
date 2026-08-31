import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListOrgUsersDto } from './list-org-users.dto';
import { OrgService } from './org.service';

@Controller('org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('departments')
  listDepartments() {
    return this.orgService.listDepartments();
  }

  @Get('roles')
  listRoles() {
    return this.orgService.listRoles();
  }

  @Get('users')
  listUsers(@Query() query: ListOrgUsersDto) {
    return this.orgService.listUsers(query);
  }
}
