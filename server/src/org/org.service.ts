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
};

export type OrgUserQuery = {
  keyword?: string;
  departmentId?: number;
  roleId?: number;
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

  async listUsers(query: OrgUserQuery): Promise<OrgUserItem[]> {
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
    const keyword = query.keyword?.trim().toLowerCase() || '';
    const roleId = query.roleId;
    const out: OrgUserItem[] = [];
    for (const user of users) {
      if (user.status === 'disabled') continue;
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
      out.push({
        id: user.id,
        displayName: user.displayName,
        departmentId,
        roleIds,
      });
    }
    return out;
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
