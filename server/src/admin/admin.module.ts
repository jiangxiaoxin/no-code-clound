import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../user/user.entity';
import { DepartmentController } from './department/department.controller';
import { Department } from './department/department.entity';
import { DepartmentService } from './department/department.service';
import { UserDepartment } from './department/user-department.entity';
import { RoleController } from './role/role.controller';
import { RolePermission } from './role/role-permission.entity';
import { Role } from './role/role.entity';
import { RoleService } from './role/role.service';
import { UserRole } from './role/user-role.entity';
import { AdminUserController } from './user/admin-user.controller';
import { AdminUserService } from './user/admin-user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Department,
      UserDepartment,
      Role,
      UserRole,
      RolePermission,
    ]),
    AuthModule,
  ],
  controllers: [DepartmentController, RoleController, AdminUserController],
  providers: [DepartmentService, RoleService, AdminUserService],
})
export class AdminModule {}
