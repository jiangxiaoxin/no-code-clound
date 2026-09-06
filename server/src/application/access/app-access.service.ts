import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Department } from '../../admin/department/department.entity';
import { UserDepartment } from '../../admin/department/user-department.entity';
import { Role } from '../../admin/role/role.entity';
import { UserRole } from '../../admin/role/user-role.entity';
import { User } from '../../user/user.entity';
import { Application } from '../application.entity';
import { AppAccessScope } from './app-access-scope.entity';
import { AppConfigurator } from './app-configurator.entity';

export type AppAccess = {
  app: Application;
  canUse: boolean;
  canConfigure: boolean;
  isOwner: boolean;
};

export type AccessibleAppItem = {
  id: number;
  name: string;
  icon: string;
  isOwner: boolean;
  canConfigure: boolean;
};

@Injectable()
export class AppAccessService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(AppConfigurator)
    private readonly configuratorRepo: Repository<AppConfigurator>,
    @InjectRepository(AppAccessScope)
    private readonly scopeRepo: Repository<AppAccessScope>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserDepartment)
    private readonly userDeptRepo: Repository<UserDepartment>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  async getAccess(userId: number, appId: number): Promise<AppAccess> {
    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException('应用不存在');
    const isOwner = app.ownerId === userId;
    if (isOwner) return { app, isOwner, canConfigure: true, canUse: true };

    const configurator = await this.configuratorRepo.findOne({
      where: { appId, userId },
    });
    if (configurator) {
      return { app, isOwner: false, canConfigure: true, canUse: true };
    }

    const scopes = await this.scopeRepo.find({ where: { appId } });
    const canUse = scopes.length > 0 && (await this.scopeHit(userId, scopes));
    return { app, isOwner: false, canConfigure: false, canUse };
  }

  async listAccessible(userId: number): Promise<AccessibleAppItem[]> {
    const configurators = await this.configuratorRepo.find({
      where: { userId },
    });
    const configureIds = new Set(configurators.map((row) => row.appId));

    const userScopes = await this.scopeRepo.find({
      where: { type: 'user', targetId: userId },
    });
    const scopeIds = new Set(userScopes.map((row) => row.appId));

    const link = await this.userDeptRepo.findOne({ where: { userId } });
    if (link) {
      const dept = await this.deptRepo.findOne({
        where: { id: link.departmentId },
      });
      if (dept?.status === 'active') {
        const deptScopes = await this.scopeRepo.find({
          where: { type: 'department', targetId: link.departmentId },
        });
        for (const row of deptScopes) scopeIds.add(row.appId);
      }
    }

    const roleLinks = await this.userRoleRepo.find({ where: { userId } });
    const roleIds = roleLinks.map((row) => row.roleId);
    if (roleIds.length) {
      const activeRoles = await this.roleRepo.find({
        where: { id: In(roleIds), status: 'active' },
      });
      const activeRoleIds = activeRoles.map((row) => row.id);
      if (activeRoleIds.length) {
        const roleScopes = await this.scopeRepo.find({
          where: { type: 'role', targetId: In(activeRoleIds) },
        });
        for (const row of roleScopes) scopeIds.add(row.appId);
      }
    }

    const owned = await this.appRepo.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
    const ids = new Set<number>([
      ...owned.map((row) => row.id),
      ...configureIds,
      ...scopeIds,
    ]);
    if (!ids.size) return [];

    const apps = await this.appRepo.find({
      where: { id: In([...ids]) },
      order: { createdAt: 'DESC' },
    });
    return apps.map((app) => {
      const isOwner = app.ownerId === userId;
      return {
        id: app.id,
        name: app.name,
        icon: app.icon,
        isOwner,
        canConfigure: isOwner || configureIds.has(app.id),
      };
    });
  }

  /** 范围行保留但目标停用 / 删除时不命中（权限规格 §7.2、§12.1） */
  private async scopeHit(
    userId: number,
    scopes: AppAccessScope[],
  ): Promise<boolean> {
    if (scopes.some((s) => s.type === 'user' && s.targetId === userId)) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user?.status === 'active') return true;
    }
    const deptScopes = scopes.filter((s) => s.type === 'department');
    if (deptScopes.length) {
      const link = await this.userDeptRepo.findOne({ where: { userId } });
      if (link && deptScopes.some((s) => s.targetId === link.departmentId)) {
        const dept = await this.deptRepo.findOne({
          where: { id: link.departmentId },
        });
        if (dept?.status === 'active') return true;
      }
    }
    const roleScopes = scopes.filter((s) => s.type === 'role');
    if (roleScopes.length) {
      const links = await this.userRoleRepo.find({ where: { userId } });
      const roleIds = links
        .map((l) => l.roleId)
        .filter((id) => roleScopes.some((s) => s.targetId === id));
      if (roleIds.length) {
        const active = await this.roleRepo.count({
          where: { id: In(roleIds), status: 'active' },
        });
        if (active > 0) return true;
      }
    }
    return false;
  }

  async requireUse(userId: number, appId: number) {
    const access = await this.getAccess(userId, appId);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    return access.app;
  }

  async requireConfigure(userId: number, appId: number) {
    const access = await this.getAccess(userId, appId);
    if (!access.canConfigure) throw new NotFoundException('应用不存在');
    return access.app;
  }

  async requireOwner(userId: number, appId: number) {
    const access = await this.getAccess(userId, appId);
    if (!access.isOwner) throw new NotFoundException('应用不存在');
    return access.app;
  }
}
