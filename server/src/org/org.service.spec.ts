import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Department } from '../admin/department/department.entity';
import { UserDepartment } from '../admin/department/user-department.entity';
import { Role } from '../admin/role/role.entity';
import { UserRole } from '../admin/role/user-role.entity';
import { User } from '../user/user.entity';
import { OrgService } from './org.service';

describe('OrgService', () => {
  let service: OrgService;
  const userRepo = { find: jest.fn() };
  const departmentRepo = { find: jest.fn() };
  const userDepartmentRepo = { find: jest.fn() };
  const roleRepo = { find: jest.fn() };
  const userRoleRepo = { find: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: getRepositoryToken(UserDepartment), useValue: userDepartmentRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
      ],
    }).compile();
    service = module.get(OrgService);
  });

  it('lists only active departments as a tree without disabled nodes', async () => {
    departmentRepo.find.mockResolvedValue([
      { id: 1, name: '公司', parentId: null, status: 'active', sortOrder: 0 },
      { id: 2, name: '停用组', parentId: 1, status: 'disabled', sortOrder: 1 },
      { id: 3, name: '研发', parentId: 1, status: 'active', sortOrder: 2 },
    ]);
    const tree = await service.listDepartments();
    expect(tree).toEqual([
      {
        id: 1,
        name: '公司',
        parentId: null,
        children: [{ id: 3, name: '研发', parentId: 1, children: [] }],
      },
    ]);
  });

  it('lists only active roles without extra fields', async () => {
    roleRepo.find.mockResolvedValue([
      { id: 1, name: '管理员', code: 'admin', status: 'active' },
      { id: 2, name: '旧角色', code: 'old', status: 'disabled' },
    ]);
    await expect(service.listRoles()).resolves.toEqual([
      { id: 1, name: '管理员', code: 'admin' },
    ]);
  });

  it('lists active users without password or email', async () => {
    userRepo.find.mockResolvedValue([
      {
        id: 1,
        displayName: '甲',
        username: 'a',
        status: 'active',
        password: 'secret',
        email: 'a@x.com',
      },
      { id: 2, displayName: '乙', username: 'b', status: 'disabled' },
    ]);
    userDepartmentRepo.find.mockResolvedValue([{ userId: 1, departmentId: 10 }]);
    userRoleRepo.find.mockResolvedValue([{ userId: 1, roleId: 7 }]);
    departmentRepo.find.mockResolvedValue([]);
    const users = await service.listUsers({});
    expect(users).toEqual([
      {
        id: 1,
        displayName: '甲',
        departmentId: 10,
        roleIds: [7],
        status: 'active',
      },
    ]);
    expect(users[0]).not.toHaveProperty('password');
    expect(users[0]).not.toHaveProperty('email');
  });

  it('filters users by keyword, department descendants, and role', async () => {
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '张三', username: 'zhang', status: 'active' },
      { id: 2, displayName: '李四', username: 'li', status: 'active' },
      { id: 3, displayName: '王五', username: 'wang', status: 'active' },
    ]);
    userDepartmentRepo.find.mockResolvedValue([
      { userId: 1, departmentId: 11 },
      { userId: 2, departmentId: 10 },
      { userId: 3, departmentId: 12 },
    ]);
    userRoleRepo.find.mockResolvedValue([
      { userId: 1, roleId: 8 },
      { userId: 2, roleId: 9 },
    ]);
    departmentRepo.find.mockResolvedValue([
      { id: 10, parentId: null, status: 'active' },
      { id: 11, parentId: 10, status: 'active' },
      { id: 12, parentId: null, status: 'active' },
    ]);

    const byName = await service.listUsers({ keyword: '张' });
    expect(byName.map((item) => item.id)).toEqual([1]);

    const byDept = await service.listUsers({ departmentId: 10 });
    expect(byDept.map((item) => item.id).sort()).toEqual([1, 2]);

    const byRole = await service.listUsers({ roleId: 8 });
    expect(byRole.map((item) => item.id)).toEqual([1]);
  });

  it('pages users instead of returning the full list', async () => {
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '甲', username: 'a', status: 'active' },
      { id: 2, displayName: '乙', username: 'b', status: 'active' },
      { id: 3, displayName: '丙', username: 'c', status: 'active' },
      { id: 4, displayName: '丁', username: 'd', status: 'disabled' },
    ]);
    userDepartmentRepo.find.mockResolvedValue([]);
    userRoleRepo.find.mockResolvedValue([]);
    departmentRepo.find.mockResolvedValue([]);

    await expect(service.listUsers({ page: 1, pageSize: 2 })).resolves.toEqual({
      items: [
        {
          id: 1,
          displayName: '甲',
          departmentId: null,
          roleIds: [],
          status: 'active',
        },
        {
          id: 2,
          displayName: '乙',
          departmentId: null,
          roleIds: [],
          status: 'active',
        },
      ],
      total: 3,
      page: 1,
      pageSize: 2,
    });
    await expect(service.listUsers({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [
        {
          id: 3,
          displayName: '丙',
          departmentId: null,
          roleIds: [],
          status: 'active',
        },
      ],
      total: 3,
      page: 2,
      pageSize: 2,
    });
  });

  it('filters users by ids without paging', async () => {
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '甲', username: 'a', status: 'active' },
      { id: 2, displayName: '乙', username: 'b', status: 'disabled' },
      { id: 3, displayName: '丙', username: 'c', status: 'active' },
      { id: 5, displayName: '戊', username: 'e', status: 'active' },
    ]);
    userDepartmentRepo.find.mockResolvedValue([]);
    userRoleRepo.find.mockResolvedValue([]);
    departmentRepo.find.mockResolvedValue([]);

    const users = await service.listUsers({ ids: [3, 2, 1, 1] });
    expect(users).toEqual([
      {
        id: 1,
        displayName: '甲',
        departmentId: null,
        roleIds: [],
        status: 'active',
      },
      {
        id: 2,
        displayName: '乙',
        departmentId: null,
        roleIds: [],
        status: 'disabled',
      },
      {
        id: 3,
        displayName: '丙',
        departmentId: null,
        roleIds: [],
        status: 'active',
      },
    ]);
  });

  it('applies custom scope union and can intersect a department browse', async () => {
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '张三', username: 'zhang', status: 'active' },
      { id: 2, displayName: '李四', username: 'li', status: 'active' },
      { id: 3, displayName: '王五', username: 'wang', status: 'active' },
    ]);
    userDepartmentRepo.find.mockResolvedValue([
      { userId: 1, departmentId: 11 },
      { userId: 2, departmentId: 10 },
      { userId: 3, departmentId: 12 },
    ]);
    userRoleRepo.find.mockResolvedValue([
      { userId: 1, roleId: 8 },
      { userId: 2, roleId: 9 },
    ]);
    departmentRepo.find.mockResolvedValue([
      { id: 10, parentId: null, status: 'active' },
      { id: 11, parentId: 10, status: 'active' },
      { id: 12, parentId: null, status: 'active' },
    ]);

    const union = await service.listUsers({
      memberScope: 'custom',
      scopeRoleIds: [8],
      scopeUserIds: [3],
      page: 1,
      pageSize: 10,
    });
    expect(union).toEqual({
      items: [
        {
          id: 1,
          displayName: '张三',
          departmentId: 11,
          roleIds: [8],
          status: 'active',
        },
        {
          id: 3,
          displayName: '王五',
          departmentId: 12,
          roleIds: [],
          status: 'active',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    });

    const inDept = await service.listUsers({
      memberScope: 'custom',
      scopeRoleIds: [8],
      departmentId: 10,
      page: 1,
      pageSize: 10,
    });
    expect(inDept.items.map((item) => item.id)).toEqual([1]);
    expect(inDept.total).toBe(1);
  });
});
