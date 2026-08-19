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
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { NameDto } from './dto/name.dto';

@Controller('apps')
@UseGuards(JwtAuthGuard)
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  list(@Req() req: { user: { id: number } }) {
    return this.applicationService.list(req.user.id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Req() req: { user: { id: number } },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationService.create(req.user.id, dto);
  }

  @Get(':id')
  getOne(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.getOne(req.user.id, id);
  }

  @Get(':id/directory')
  directory(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.directory(req.user.id, id);
  }

  @Post(':id/groups')
  @HttpCode(201)
  createGroup(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.createGroup(req.user.id, id, dto);
  }

  @Patch(':id/groups/:groupId')
  renameGroup(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.renameGroup(req.user.id, id, groupId, dto);
  }

  @Delete(':id/groups/:groupId')
  deleteGroup(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.applicationService.deleteGroup(req.user.id, id, groupId);
  }

  @Post(':id/forms')
  @HttpCode(201)
  createForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFormDto,
  ) {
    return this.applicationService.createForm(req.user.id, id, dto);
  }

  @Patch(':id/forms/:formId')
  renameForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.renameForm(req.user.id, id, formId, dto);
  }

  @Delete(':id/forms/:formId')
  deleteForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    return this.applicationService.deleteForm(req.user.id, id, formId);
  }
}
