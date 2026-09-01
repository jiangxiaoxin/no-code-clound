import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../admin/department/department.entity';
import { UserDepartment } from '../admin/department/user-department.entity';
import { Role } from '../admin/role/role.entity';
import { UserRole } from '../admin/role/user-role.entity';
import { User } from '../user/user.entity';

export type OrgDepartmentNode = {
  id: number;
  name: string;
  parentId: number | null;
  children: OrgDepartmentNode[];
};

export type OrgRoleItem = {
  id: number;
  name: string;
  code: string;
};

export type OrgUserItem = {
  id: number;
  displayName: string;
  departmentId: number | null;
  roleIds: number[];
  status: 'active' | 'disabled';
};

export type OrgUserPage = {
  items: OrgUserItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type OrgUserQuery = {
  keyword?: string;
  departmentId?: number;
  roleId?: number;
  ids?: number[];
  page?: number;
  pageSize?: number;
  memberScope?: 'all' | 'custom' | 'dept_field';
  scopeDepartmentIds?: number[];
  scopeRoleIds?: number[];
  scopeUserIds?: number[];
};

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
  ) {}

  async listDepartments(): Promise<OrgDepartmentNode[]> {
    const rows = await this.departmentRepo.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const nodes = new Map<number, OrgDepartmentNode>();
    for (const row of rows) {
      if (row.status !== 'active') continue;
      nodes.set(row.id, {
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        children: [],
      });
    }
    const roots: OrgDepartmentNode[] = [];
    for (const node of nodes.values()) {
      const parent =
        node.parentId == null ? null : nodes.get(node.parentId) || null;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async listRoles(): Promise<OrgRoleItem[]> {
    const rows = await this.roleRepo.find({
      order: { id: 'ASC' },
    });
    return rows
      .filter((row) => row.status === 'active')
      .map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
      }));
  }

  async listUsers(
    query: OrgUserQuery,
  ): Promise<OrgUserItem[] | OrgUserPage> {
    const all = await this.collectUsers(query);
    const idFilter = uniquePositiveIds(query.ids);
    const filtered = idFilter.length
      ? all.filter((item) => idFilter.includes(item.id))
      : all;
    if (idFilter.length) {
      return filtered;
    }
    if (query.page == null && query.pageSize == null) {
      return filtered;
    }
    const page = Math.max(1, query.page || 1);
    const pageSize = clampPageSize(query.pageSize);
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  private async collectUsers(query: OrgUserQuery): Promise<OrgUserItem[]> {
    const users = await this.userRepo.find({
      select: { id: true, displayName: true, username: true, status: true },
      order: { id: 'ASC' },
    });
    const [links, roleLinks, departments] = await Promise.all([
      this.userDepartmentRepo.find(),
      this.userRoleRepo.find(),
      this.departmentRepo.find(),
    ]);
    const deptByUser = new Map<number, number>();
    for (const link of links) {
      deptByUser.set(link.userId, link.departmentId);
    }
    const rolesByUser = new Map<number, number[]>();
    for (const link of roleLinks) {
      const list = rolesByUser.get(link.userId) || [];
      list.push(link.roleId);
      rolesByUser.set(link.userId, list);
    }
    const allowedDeptIds = query.departmentId
      ? this.descendantDepartmentIds(query.departmentId, departments)
      : null;
    const customScope =
      query.memberScope === 'custom'
        ? this.customScopeSets(query, departments)
        : null;
    if (customScope && customScope.empty) {
      return [];
    }
    const lookupByIds = uniquePositiveIds(query.ids).length > 0;
    const keyword = query.keyword?.trim().toLowerCase() || '';
    const roleId = query.roleId;
    const out: OrgUserItem[] = [];
    for (const user of users) {
      if (!lookupByIds && user.status === 'disabled') continue;
      if (
        keyword &&
        !user.displayName.toLowerCase().includes(keyword) &&
        !user.username.toLowerCase().includes(keyword)
      ) {
        continue;
      }
      const departmentId = deptByUser.get(user.id) ?? null;
      if (allowedDeptIds && !allowedDeptIds.has(departmentId ?? -1)) {
        continue;
      }
      const roleIds = rolesByUser.get(user.id) || [];
      if (roleId && !roleIds.includes(roleId)) {
        continue;
      }
      if (
        customScope &&
        !customScope.departmentIds.has(departmentId ?? -1) &&
        !roleIds.some((id) => customScope.roleIds.has(id)) &&
        !customScope.userIds.has(user.id)
      ) {
        continue;
      }
      out.push({
        id: user.id,
        displayName: user.displayName,
        departmentId,
        roleIds,
        status: user.status,
      });
    }
    return out;
  }

  private customScopeSets(
    query: OrgUserQuery,
    departments: Department[],
  ): {
    empty: boolean;
    departmentIds: Set<number>;
    roleIds: Set<number>;
    userIds: Set<number>;
  } {
    const departmentIds = new Set<number>();
    for (const id of uniquePositiveIds(query.scopeDepartmentIds)) {
      for (const childId of this.descendantDepartmentIds(id, departments)) {
        departmentIds.add(childId);
      }
    }
    const roleIds = new Set(uniquePositiveIds(query.scopeRoleIds));
    const userIds = new Set(uniquePositiveIds(query.scopeUserIds));
    return {
      empty: !departmentIds.size && !roleIds.size && !userIds.size,
      departmentIds,
      roleIds,
      userIds,
    };
  }

  private descendantDepartmentIds(
    rootId: number,
    departments: Department[],
  ): Set<number> {
    const children = new Map<number | null, number[]>();
    for (const row of departments) {
      const key = row.parentId;
      const list = children.get(key) || [];
      list.push(row.id);
      children.set(key, list);
    }
    const ids = new Set<number>();
    const walk = (id: number) => {
      if (ids.has(id)) return;
      ids.add(id);
      for (const childId of children.get(id) || []) {
        walk(childId);
      }
    }
    walk(rootId);
    return ids;
  }
}

function uniquePositiveIds(raw?: number[]) {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw || []) {
    if (!Number.isInteger(item) || item <= 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function clampPageSize(value?: number) {
  if (!Number.isInteger(value) || !value || value < 1) return 20;
  return Math.min(value, 100);
}
