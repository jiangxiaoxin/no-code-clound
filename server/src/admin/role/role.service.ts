import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Like, Not, Repository } from 'typeorm';
import { PERMISSION_GROUPS, PERMISSIONS, isKnownPermission } from '../permissions';
import { RolePermission } from './role-permission.entity';
import { Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { ListRoleDto } from './dto/list-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

export type RoleItem = {
  id: number;
  name: string;
  code: string;
  description: string;
  status: 'active' | 'disabled';
  builtIn: boolean;
  permissionCodes: string[];
  memberCount: number;
};

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    private readonly dataSource: DataSource,
  ) {}

  permissionGroups() {
    return PERMISSION_GROUPS;
  }

  async list(query: ListRoleDto): Promise<RoleItem[]> {
    const where: Record<string, unknown>[] = [];
    const status = query.status;
    const keyword = query.keyword?.trim();
    if (keyword) {
      where.push(
        { name: Like(`%${keyword}%`), ...(status ? { status } : {}) },
        { code: Like(`%${keyword}%`), ...(status ? { status } : {}) },
      );
    } else if (status) {
      where.push({ status });
    }

    const roles = await this.roleRepo.find({
      where: where.length ? where : undefined,
      order: { createdAt: 'ASC' },
    });
    return Promise.all(roles.map((role) => this.toItem(role)));
  }

  async create(dto: CreateRoleDto): Promise<RoleItem> {
    const name = dto.name.trim();
    const code = dto.code.trim();
    this.assertCode(code);
    const permissionCodes = this.normalizePermissions(dto.permissionCodes);
    await this.assertNameUnique(name);
    await this.assertCodeUnique(code);

    const saved = await this.dataSource.transaction(async (manager) => {
      const role = await manager.save(
        Role,
        manager.create(Role, {
          name,
          code,
          description: dto.description?.trim() ?? '',
          status: 'active',
          builtIn: false,
        }),
      );
      if (permissionCodes.length) {
        await manager.save(
          RolePermission,
          permissionCodes.map((permission) =>
            manager.create(RolePermission, { roleId: role.id, permission }),
          ),
        );
      }
      return role;
    });
    return this.toItem(saved, permissionCodes, 0);
  }

  async update(
    id: number,
    dto: UpdateRoleDto,
    actorPermissions: string[] = [],
  ): Promise<RoleItem> {
    const role = await this.requireOne(id);
    if (dto.permissionCodes && !actorPermissions.includes(PERMISSIONS.ROLES_ASSIGN_PERMISSIONS)) {
      throw new ForbiddenException();
    }
    if (role.builtIn && dto.status === 'disabled') {
      throw new BadRequestException('内置角色不能停用');
    }

    const name = dto.name === undefined ? role.name : dto.name.trim();
    if (name !== role.name) {
      await this.assertNameUnique(name, id);
    }

    const permissionCodes =
      dto.permissionCodes === undefined
        ? undefined
        : this.normalizePermissions(dto.permissionCodes);

    const saved = await this.dataSource.transaction(async (manager) => {
      role.name = name;
      if (dto.description !== undefined) {
        role.description = dto.description.trim();
      }
      if (dto.status !== undefined) {
        role.status = dto.status;
      }
      await manager.save(Role, role);
      if (permissionCodes) {
        await manager.delete(RolePermission, { roleId: id });
        if (permissionCodes.length) {
          await manager.save(
            RolePermission,
            permissionCodes.map((permission) =>
              manager.create(RolePermission, { roleId: id, permission }),
            ),
          );
        }
      }
      return role;
    });
    return this.toItem(saved, permissionCodes);
  }

  async delete(id: number): Promise<void> {
    const role = await this.requireOne(id);
    if (role.builtIn) {
      throw new BadRequestException('内置角色不能删除');
    }
    const memberCount = await this.userRoleRepo.count({ where: { roleId: id } });
    if (memberCount > 0) {
      throw new ConflictException('角色仍有关联人员，无法删除');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId: id });
      await manager.delete(Role, { id });
    });
  }

  async requireAssignable(ids: number[]): Promise<Role[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return [];
    }
    const roles = await this.roleRepo.find({ where: { id: In(uniqueIds) } });
    if (roles.length !== uniqueIds.length) {
      throw new NotFoundException('角色不存在');
    }
    if (roles.some((role) => role.status === 'disabled')) {
      throw new BadRequestException('不能分配已停用的角色');
    }
    return roles;
  }

  private assertCode(code: string): void {
    if (!/^[a-z0-9_]{2,64}$/.test(code)) {
      throw new BadRequestException(
        '角色代码须为 2–64 位小写字母、数字或下划线',
      );
    }
  }

  private normalizePermissions(codes: string[]): string[] {
    const unique = [...new Set(codes)];
    if (unique.some((code) => !isKnownPermission(code))) {
      throw new BadRequestException('权限代码不存在');
    }
    return unique.sort();
  }

  private async assertNameUnique(name: string, excludeId?: number): Promise<void> {
    const existing = await this.roleRepo.findOne({
      where: { name, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (existing) {
      throw new ConflictException('角色名称已存在');
    }
  }

  private async assertCodeUnique(code: string, excludeId?: number): Promise<void> {
    const existing = await this.roleRepo.findOne({
      where: { code, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (existing) {
      throw new ConflictException('角色代码已存在');
    }
  }

  private async requireOne(id: number): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    return role;
  }

  private async toItem(
    role: Role,
    permissionCodes?: string[],
    memberCount?: number,
  ): Promise<RoleItem> {
    const codes =
      permissionCodes ??
      (
        await this.rolePermissionRepo.find({ where: { roleId: role.id } })
      ).map((row) => row.permission);
    const members =
      memberCount ?? (await this.userRoleRepo.count({ where: { roleId: role.id } }));
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      status: role.status,
      builtIn: role.builtIn,
      permissionCodes: [...new Set(codes)].sort(),
      memberCount: members,
    };
  }
}
