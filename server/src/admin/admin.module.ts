import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ApplicationModule } from '../application/application.module';
import { Application } from '../application/application.entity';
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
import { AdminOwnedAppService } from './user/admin-owned-app.service';
import { AdminUserController } from './user/admin-user.controller';
import { AdminUserService } from './user/admin-user.service';

@Module({
  imports: [
    ApplicationModule,
    TypeOrmModule.forFeature([
      User,
      Application,
      Department,
      UserDepartment,
      Role,
      UserRole,
      RolePermission,
    ]),
    AuthModule,
  ],
  controllers: [DepartmentController, RoleController, AdminUserController],
  providers: [
    DepartmentService,
    RoleService,
    AdminUserService,
    AdminOwnedAppService,
  ],
})
export class AdminModule {}
