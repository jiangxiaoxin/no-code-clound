import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { AuthPrincipal, PERMISSIONS } from '../permissions';
import { AdminUserService } from './admin-user.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminUserDto } from './dto/list-admin-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  list(@Query() query: ListAdminUserDto) {
    return this.adminUserService.list(query);
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.USERS_CREATE)
  create(@Body() dto: CreateAdminUserDto) {
    return this.adminUserService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.USERS_UPDATE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserDto,
    @Req() req: { user: AuthPrincipal },
  ) {
    return this.adminUserService.update(
      req.user.id,
      id,
      dto,
      req.user.permissions,
    );
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.USERS_CHANGE_STATUS)
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: { user: AuthPrincipal },
  ) {
    return this.adminUserService.changeStatus(req.user.id, id, dto.status);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Permissions(PERMISSIONS.USERS_RESET_PASSWORD)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.adminUserService.resetPassword(id, dto.newPassword);
  }
}
