import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, In, Not, Repository } from 'typeorm';
import { User } from '../../user/user.entity';
import { Department } from '../department/department.entity';
import { DepartmentService } from '../department/department.service';
import { UserDepartment } from '../department/user-department.entity';
import { PERMISSIONS } from '../permissions';
import { Role } from '../role/role.entity';
import { RoleService } from '../role/role.service';
import { UserRole } from '../role/user-role.entity';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminUserDto } from './dto/list-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

export type AdminUserItem = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  status: 'active' | 'disabled';
  departments: { id: number; name: string }[];
  roles: { id: number; name: string; code: string }[];
  createdAt: Date;
};

@Injectable()
export class AdminUserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly departmentService: DepartmentService,
    private readonly roleService: RoleService,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: ListAdminUserDto): Promise<{
    items: AdminUserItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.userRepo.createQueryBuilder('u');

    if (query.keyword) {
      const keyword = `%${query.keyword}%`;
      qb.andWhere(
        '(u.username LIKE :keyword OR u.displayName LIKE :keyword OR u.email LIKE :keyword)',
        { keyword },
      );
    }
    if (query.status) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    if (query.departmentId) {
      qb.innerJoin(
        UserDepartment,
        'ud',
        'ud.userId = u.id AND ud.departmentId = :departmentId',
        { departmentId: query.departmentId },
      );
    }
    if (query.roleId) {
      qb.innerJoin(
        UserRole,
        'ur',
        'ur.userId = u.id AND ur.roleId = :roleId',
        { roleId: query.roleId },
      );
    }

    const [users, total] = await qb
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: await this.attachRelations(users),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateAdminUserDto): Promise<AdminUserItem> {
    const username = dto.username.trim();
    const displayName = dto.displayName.trim();
    const email = dto.email.trim().toLowerCase();
    await this.assertUsernameUnique(username);
    await this.assertEmailUnique(email);
    const departmentIds = [...new Set(dto.departmentIds)];
    const roleIds = [...new Set(dto.roleIds)];
    await this.departmentService.requireAssignable(departmentIds);
    await this.roleService.requireAssignable(roleIds);

    const password = await bcrypt.hash(dto.password, 10);
    const saved = await this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        User,
        manager.create(User, {
          username,
          displayName,
          email,
          password,
          status: 'active',
        }),
      );
      await this.replaceRelations(manager, user.id, departmentIds, roleIds);
      return user;
    });
    return this.toItem(saved);
  }

  async update(
    actorId: number,
    userId: number,
    dto: UpdateAdminUserDto,
    actorPermissions: string[] = [],
  ): Promise<AdminUserItem> {
    const user = await this.requireOne(userId);
    if (
      dto.departmentIds &&
      !actorPermissions.includes(PERMISSIONS.USERS_ASSIGN_DEPARTMENTS)
    ) {
      throw new ForbiddenException();
    }
    if (
      dto.roleIds &&
      !actorPermissions.includes(PERMISSIONS.USERS_ASSIGN_ROLES)
    ) {
      throw new ForbiddenException();
    }

    const username =
      dto.username === undefined ? user.username : dto.username.trim();
    const displayName =
      dto.displayName === undefined ? user.displayName : dto.displayName.trim();
    const email =
      dto.email === undefined ? user.email : dto.email.trim().toLowerCase();
    if (username !== user.username) {
      await this.assertUsernameUnique(username, userId);
    }
    if (email !== user.email) {
      await this.assertEmailUnique(email, userId);
    }

    const departmentIds =
      dto.departmentIds === undefined
        ? undefined
        : [...new Set(dto.departmentIds)];
    const roleIds =
      dto.roleIds === undefined ? undefined : [...new Set(dto.roleIds)];
    if (departmentIds) {
      const current = await this.userDepartmentRepo.find({
        where: { userId },
      });
      await this.departmentService.requireAssignable(
        departmentIds.filter(
          (id) => !current.some((link) => link.departmentId === id),
        ),
      );
    }
    if (roleIds) {
      const current = await this.userRoleRepo.find({ where: { userId } });
      await this.roleService.requireAssignable(
        roleIds.filter((id) => !current.some((link) => link.roleId === id)),
      );
      await this.assertSystemAdminSafe(actorId, userId, roleIds, user.status);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      user.username = username;
      user.displayName = displayName;
      user.email = email;
      await manager.save(User, user);
      await this.replaceRelations(manager, userId, departmentIds, roleIds);
      return user;
    });
    return this.toItem(saved);
  }

  async changeStatus(
    actorId: number,
    userId: number,
    status: 'active' | 'disabled',
  ): Promise<void> {
    const user = await this.requireOne(userId);
    if (actorId === userId && status === 'disabled') {
      throw new BadRequestException('不能停用当前登录账号');
    }
    if (status === 'disabled') {
      await this.assertNotLastSystemAdmin(userId);
    }
    user.status = status;
    await this.userRepo.save(user);
  }

  async resetPassword(userId: number, newPassword: string): Promise<void> {
    if (newPassword.length < 6 || newPassword.length > 72) {
      throw new BadRequestException('密码须为 6–72 位');
    }
    const user = await this.requireOne(userId);
    user.password = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
  }

  private async replaceRelations(
    manager: {
      delete: (entity: unknown, where: object) => Promise<unknown>;
      create: (entity: unknown, value: object) => object;
      save: (entity: unknown, value: object | object[]) => Promise<unknown>;
    },
    userId: number,
    departmentIds?: number[],
    roleIds?: number[],
  ): Promise<void> {
    if (departmentIds) {
      await manager.delete(UserDepartment, { userId });
      if (departmentIds.length) {
        await manager.save(
          UserDepartment,
          departmentIds.map((departmentId) =>
            manager.create(UserDepartment, { userId, departmentId }),
          ),
        );
      }
    }
    if (roleIds) {
      await manager.delete(UserRole, { userId });
      if (roleIds.length) {
        await manager.save(
          UserRole,
          roleIds.map((roleId) => manager.create(UserRole, { userId, roleId })),
        );
      }
    }
  }

  private async assertSystemAdminSafe(
    actorId: number,
    userId: number,
    nextRoleIds: number[],
    userStatus: 'active' | 'disabled',
  ): Promise<void> {
    const systemAdmin = await this.roleRepo.findOne({
      where: { code: 'system_admin' },
    });
    if (!systemAdmin) {
      return;
    }
    const keepsSystemAdmin = nextRoleIds.includes(systemAdmin.id);
    if (actorId === userId && !keepsSystemAdmin) {
      throw new BadRequestException('不能移除自己的系统管理员角色');
    }
    if (userStatus === 'active' && !keepsSystemAdmin) {
      await this.assertNotLastSystemAdmin(userId);
    }
  }

  private async assertNotLastSystemAdmin(userId: number): Promise<void> {
    const count = await this.countActiveSystemAdmins();
    const isAdmin = await this.userHasSystemAdmin(userId);
    if (isAdmin && count <= 1) {
      throw new ConflictException('系统至少保留一个启用的系统管理员');
    }
  }

  private async countActiveSystemAdmins(): Promise<number> {
    const systemAdmin = await this.roleRepo.findOne({
      where: { code: 'system_admin' },
    });
    if (!systemAdmin) {
      return 0;
    }
    const links = await this.userRoleRepo.find({
      where: { roleId: systemAdmin.id },
    });
    if (links.length === 0) {
      return 0;
    }
    return this.userRepo.count({
      where: { id: In(links.map((link) => link.userId)), status: 'active' },
    });
  }

  private async userHasSystemAdmin(userId: number): Promise<boolean> {
    const systemAdmin = await this.roleRepo.findOne({
      where: { code: 'system_admin' },
    });
    if (!systemAdmin) {
      return false;
    }
    const link = await this.userRoleRepo.findOne({
      where: { userId, roleId: systemAdmin.id },
    });
    return Boolean(link);
  }

  private async assertUsernameUnique(
    username: string,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.userRepo.findOne({
      where: { username, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }
  }

  private async assertEmailUnique(
    email: string,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.userRepo.findOne({
      where: { email, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (existing) {
      throw new ConflictException('邮箱已存在');
    }
  }

  private async requireOne(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('人员不存在');
    }
    return user;
  }

  private async attachRelations(users: User[]): Promise<AdminUserItem[]> {
    return Promise.all(users.map((user) => this.toItem(user)));
  }

  private async toItem(user: User): Promise<AdminUserItem> {
    const [deptLinks, roleLinks] = await Promise.all([
      this.userDepartmentRepo.find({ where: { userId: user.id } }),
      this.userRoleRepo.find({ where: { userId: user.id } }),
    ]);
    const departmentIds = deptLinks.map((link) => link.departmentId);
    const roleIds = roleLinks.map((link) => link.roleId);
    const [departments, roles] = await Promise.all([
      departmentIds.length
        ? this.departmentRepo.find({
            where: { id: In(departmentIds) },
          })
        : Promise.resolve([]),
      roleIds.length
        ? this.roleRepo.find({ where: { id: In(roleIds) } })
        : Promise.resolve([]),
    ]);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      departments: departments
        .map((department) => ({ id: department.id, name: department.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh')),
      roles: roles
        .map((role) => ({ id: role.id, name: role.name, code: role.code }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh')),
      createdAt: user.createdAt,
    };
  }
}
