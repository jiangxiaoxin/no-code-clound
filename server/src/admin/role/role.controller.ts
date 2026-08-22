import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthPrincipal, PERMISSIONS } from '../permissions';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { ListRoleDto } from './dto/list-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get('permissions')
  @Permissions(PERMISSIONS.ROLES_READ)
  permissionGroups() {
    return this.roleService.permissionGroups();
  }

  @Get('roles')
  @Permissions(PERMISSIONS.ROLES_READ)
  list(@Query() query: ListRoleDto) {
    return this.roleService.list(query);
  }

  @Post('roles')
  @HttpCode(201)
  @Permissions(PERMISSIONS.ROLES_CREATE)
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Patch('roles/:id')
  @Permissions(PERMISSIONS.ROLES_UPDATE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @Req() req: { user: AuthPrincipal },
  ) {
    return this.roleService.update(id, dto, req.user.permissions);
  }

  @Delete('roles/:id')
  @Permissions(PERMISSIONS.ROLES_DELETE)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.delete(id);
  }
}
