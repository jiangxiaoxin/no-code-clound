import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AppAccessAdminService } from './app-access-admin.service';
import { AddAccessScopeDto } from './dto/add-access-scope.dto';
import { AddConfiguratorsDto } from './dto/add-configurators.dto';
import { TransferOwnerDto } from './dto/transfer-owner.dto';

@Controller('apps')
@UseGuards(JwtAuthGuard)
export class AppAccessController {
  constructor(private readonly admin: AppAccessAdminService) {}

  @Get(':appId/configurators')
  listConfigurators(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
  ) {
    return this.admin.listConfigurators(req.user.id, appId);
  }

  @Post(':appId/configurators')
  addConfigurators(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: AddConfiguratorsDto,
  ) {
    return this.admin.addConfigurators(req.user.id, appId, dto.userIds);
  }

  @Delete(':appId/configurators/:userId')
  removeConfigurator(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.admin.removeConfigurator(req.user.id, appId, userId);
  }

  @Get(':appId/access-scopes')
  listAccessScopes(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
  ) {
    return this.admin.listAccessScopes(req.user.id, appId);
  }

  @Post(':appId/access-scopes')
  addAccessScope(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: AddAccessScopeDto,
  ) {
    return this.admin.addAccessScope(req.user.id, appId, dto.type, dto.targetId);
  }

  @Delete(':appId/access-scopes/:id')
  removeAccessScope(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.admin.removeAccessScope(req.user.id, appId, id);
  }

  @Post(':appId/transfer')
  transfer(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: TransferOwnerDto,
  ) {
    return this.admin.transferByOwner(req.user.id, appId, dto.userId);
  }
}
