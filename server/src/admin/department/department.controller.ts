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
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../permissions';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('admin/departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  @Permissions(PERMISSIONS.DEPARTMENTS_READ)
  tree() {
    return this.departmentService.tree();
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.DEPARTMENTS_CREATE)
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.DEPARTMENTS_UPDATE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.DEPARTMENTS_DELETE)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.delete(id);
  }
}
