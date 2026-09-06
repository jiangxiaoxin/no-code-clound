import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Department } from '../../admin/department/department.entity';
import { Role } from '../../admin/role/role.entity';
import { User } from '../../user/user.entity';
import { Application } from '../application.entity';
import { AppAccessScope, AppAccessScopeType } from './app-access-scope.entity';
import { AppAccessService } from './app-access.service';
import { AppConfigurator } from './app-configurator.entity';

export type ConfiguratorRow = {
  userId: number;
  displayName: string;
  username: string;
  status: 'active' | 'disabled';
  isOwner: boolean;
};

export type AlwaysUser = {
  id: number;
  displayName: string;
  status: 'active' | 'disabled';
  reason: 'owner' | 'configurator';
};

export type ScopeRow = {
  id: number;
  type: AppAccessScopeType;
  targetId: number;
  label: string;
  effective: boolean;
  badge: string;
};

@Injectable()
export class AppAccessAdminService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(AppConfigurator)
    private readonly configuratorRepo: Repository<AppConfigurator>,
    @InjectRepository(AppAccessScope)
    private readonly scopeRepo: Repository<AppAccessScope>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly access: AppAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async listConfigurators(
    actorId: number,
    appId: number,
  ): Promise<ConfiguratorRow[]> {
    const app = await this.access.requireConfigure(actorId, appId);
    const rows = await this.configuratorRepo.find({ where: { appId } });
    const userIds = [app.ownerId, ...rows.map((row) => row.userId)];
    const users = await this.userRepo.find({ where: { id: In(userIds) } });
    const byId = new Map(users.map((user) => [user.id, user]));
    const owner = byId.get(app.ownerId);
    const list: ConfiguratorRow[] = [
      {
        userId: app.ownerId,
        displayName: owner?.displayName || `用户#${app.ownerId}`,
        username: owner?.username || '',
        status: owner?.status ?? 'disabled',
        isOwner: true,
      },
    ];
    for (const row of rows) {
      if (row.userId === app.ownerId) continue;
      const user = byId.get(row.userId);
      list.push({
        userId: row.userId,
        displayName: user?.displayName || `用户#${row.userId}`,
        username: user?.username || '',
        status: user?.status ?? 'disabled',
        isOwner: false,
      });
    }
    return list;
  }

  async addConfigurators(
    actorId: number,
    appId: number,
    userIds: number[],
  ): Promise<{ hints: string[] }> {
    const app = await this.access.requireConfigure(actorId, appId);
    const hints: string[] = [];
    const uniqueIds = [...new Set(userIds.filter((id) => Number.isInteger(id)))];
    if (!uniqueIds.length) return { hints };

    const users = await this.userRepo.find({ where: { id: In(uniqueIds) } });
    if (users.some((user) => user.status !== 'active')) {
      throw new BadRequestException('不能添加停用账号');
    }
    if (users.length !== uniqueIds.length) {
      throw new BadRequestException('人员不存在');
    }

    const existing = await this.configuratorRepo.find({ where: { appId } });
    const existingIds = new Set(existing.map((row) => row.userId));
    const toInsert: number[] = [];
    for (const userId of uniqueIds) {
      if (userId === app.ownerId) {
        hints.push('已是所有者，无需添加');
        continue;
      }
      if (existingIds.has(userId)) continue;
      toInsert.push(userId);
    }
    if (toInsert.length) {
      await this.configuratorRepo.save(
        toInsert.map((userId) =>
          this.configuratorRepo.create({ appId, userId }),
        ),
      );
      await this.scopeRepo.delete({
        appId,
        type: 'user',
        targetId: In(toInsert),
      });
    }
    return { hints };
  }

  async removeConfigurator(
    actorId: number,
    appId: number,
    userId: number,
  ): Promise<{ canUse: boolean }> {
    const app = await this.access.requireConfigure(actorId, appId);
    if (userId === app.ownerId) {
      throw new BadRequestException('不能移除所有者');
    }
    await this.configuratorRepo.delete({ appId, userId });
    const next = await this.access.getAccess(actorId, appId);
    return { canUse: next.canUse };
  }

  async listAccessScopes(
    actorId: number,
    appId: number,
  ): Promise<{ always: { users: AlwaysUser[] }; scopes: ScopeRow[] }> {
    const app = await this.access.requireConfigure(actorId, appId);
    const configRows = await this.configuratorRepo.find({ where: { appId } });
    const alwaysIds = [app.ownerId, ...configRows.map((row) => row.userId)];
    const alwaysUsers = alwaysIds.length
      ? await this.userRepo.find({ where: { id: In(alwaysIds) } })
      : [];
    const alwaysById = new Map(alwaysUsers.map((user) => [user.id, user]));
    const always: AlwaysUser[] = [
      {
        id: app.ownerId,
        displayName: alwaysById.get(app.ownerId)?.displayName || `用户#${app.ownerId}`,
        status: alwaysById.get(app.ownerId)?.status ?? 'disabled',
        reason: 'owner',
      },
    ];
    for (const row of configRows) {
      if (row.userId === app.ownerId) continue;
      const user = alwaysById.get(row.userId);
      always.push({
        id: row.userId,
        displayName: user?.displayName || `用户#${row.userId}`,
        status: user?.status ?? 'disabled',
        reason: 'configurator',
      });
    }

    const rows = await this.scopeRepo.find({
      where: { appId },
      order: { id: 'ASC' },
    });
    const scopes = await Promise.all(
      rows.map((row) => this.toScopeRow(row)),
    );
    return { always: { users: always }, scopes };
  }

  async addAccessScope(
    actorId: number,
    appId: number,
    type: AppAccessScopeType,
    targetId: number,
  ): Promise<{ hints: string[] }> {
    const app = await this.access.requireConfigure(actorId, appId);
    const hints: string[] = [];

    if (type === 'user') {
      const user = await this.userRepo.findOne({ where: { id: targetId } });
      if (!user) throw new BadRequestException('人员不存在');
      if (user.status !== 'active') {
        throw new BadRequestException('不能添加停用账号');
      }
      if (await this.isAlwaysAvailable(app, targetId)) {
        hints.push('已在始终可用中，不必再加');
        return { hints };
      }
    } else if (type === 'department') {
      const dept = await this.deptRepo.findOne({ where: { id: targetId } });
      if (!dept) throw new BadRequestException('部门不存在');
    } else if (type === 'role') {
      const role = await this.roleRepo.findOne({ where: { id: targetId } });
      if (!role) throw new BadRequestException('角色不存在');
    }

    const existing = await this.scopeRepo.findOne({
      where: { appId, type, targetId },
    });
    if (!existing) {
      await this.scopeRepo.save(
        this.scopeRepo.create({ appId, type, targetId }),
      );
    }
    return { hints };
  }

  async removeAccessScope(
    actorId: number,
    appId: number,
    id: number,
  ): Promise<void> {
    await this.access.requireConfigure(actorId, appId);
    const row = await this.scopeRepo.findOne({ where: { id, appId } });
    if (!row) throw new NotFoundException('范围不存在');
    await this.scopeRepo.delete({ id, appId });
  }

  async transferByOwner(
    actorId: number,
    appId: number,
    toUserId: number,
  ): Promise<void> {
    await this.access.requireOwner(actorId, appId);
    await this.transferOwner(appId, actorId, toUserId);
  }

  async transferOwner(
    appId: number,
    fromUserId: number,
    toUserId: number,
  ): Promise<void> {
    if (fromUserId === toUserId) {
      throw new BadRequestException('不能移交给自己');
    }
    const toUser = await this.userRepo.findOne({ where: { id: toUserId } });
    if (!toUser || toUser.status !== 'active') {
      throw new BadRequestException('只能移交给启用中的人');
    }
    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException('应用不存在');
    if (app.ownerId !== fromUserId) {
      throw new BadRequestException('当前所有者已变化');
    }

    await this.dataSource.transaction(async (manager) => {
      app.ownerId = toUserId;
      await manager.save(Application, app);
      await manager.delete(AppConfigurator, { appId, userId: toUserId });
      await manager.delete(AppAccessScope, {
        appId,
        type: 'user',
        targetId: toUserId,
      });
      const oldOwnerScope = await manager.findOne(AppAccessScope, {
        where: { appId, type: 'user', targetId: fromUserId },
      });
      if (!oldOwnerScope) {
        await manager.save(
          AppAccessScope,
          manager.create(AppAccessScope, {
            appId,
            type: 'user',
            targetId: fromUserId,
          }),
        );
      }
    });
  }

  async deleteForApp(appId: number): Promise<void> {
    await this.configuratorRepo.delete({ appId });
    await this.scopeRepo.delete({ appId });
  }

  private async isAlwaysAvailable(
    app: Application,
    userId: number,
  ): Promise<boolean> {
    if (app.ownerId === userId) return true;
    const row = await this.configuratorRepo.findOne({
      where: { appId: app.id, userId },
    });
    return Boolean(row);
  }

  private async toScopeRow(row: AppAccessScope): Promise<ScopeRow> {
    if (row.type === 'user') {
      const user = await this.userRepo.findOne({ where: { id: row.targetId } });
      return this.decorateScope(
        row,
        user?.displayName || '人员',
        user ? user.status === 'active' : false,
        !user,
      );
    }
    if (row.type === 'department') {
      const dept = await this.deptRepo.findOne({ where: { id: row.targetId } });
      return this.decorateScope(
        row,
        dept?.name || '部门',
        dept ? dept.status === 'active' : false,
        !dept,
      );
    }
    const role = await this.roleRepo.findOne({ where: { id: row.targetId } });
    return this.decorateScope(
      row,
      role?.name || '角色',
      role ? role.status === 'active' : false,
      !role,
    );
  }

  private decorateScope(
    row: AppAccessScope,
    name: string,
    effective: boolean,
    missing: boolean,
  ): ScopeRow {
    const kind =
      row.type === 'user' ? '人员' : row.type === 'department' ? '部门' : '角色';
    let badge = '';
    let label = name;
    if (missing) {
      badge = `${kind}（id:${row.targetId}，已删除，当前不生效）`;
      label = badge;
    } else if (!effective) {
      badge = `${name}（已停用，当前不生效）`;
      label = badge;
    }
    return {
      id: row.id,
      type: row.type,
      targetId: row.targetId,
      label,
      effective,
      badge,
    };
  }
}
