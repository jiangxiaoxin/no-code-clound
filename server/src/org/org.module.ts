import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Department } from '../admin/department/department.entity';
import { UserDepartment } from '../admin/department/user-department.entity';
import { Role } from '../admin/role/role.entity';
import { UserRole } from '../admin/role/user-role.entity';
import { User } from '../user/user.entity';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Department,
      UserDepartment,
      Role,
      UserRole,
    ]),
    AuthModule,
  ],
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgModule {}
