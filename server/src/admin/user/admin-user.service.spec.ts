import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User } from '../../user/user.entity';
import { Department } from '../department/department.entity';
import { DepartmentService } from '../department/department.service';
import { UserDepartment } from '../department/user-department.entity';
import { PERMISSIONS } from '../permissions';
import { Role } from '../role/role.entity';
import { RoleService } from '../role/role.service';
import { UserRole } from '../role/user-role.entity';
import { AdminUserService } from './admin-user.service';

describe('AdminUserService', () => {
  let service: AdminUserService;
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  const userRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
  const departmentRepo = {
    find: jest.fn(),
  };
  const userDepartmentRepo = {
    find: jest.fn(),
  };
  const userRoleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const roleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const departmentService = {
    requireAssignable: jest.fn(),
  };
  const roleService = {
    requireAssignable: jest.fn(),
  };
  const manager = {
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) =>
      fn(manager),
    ),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    userRepo.createQueryBuilder.mockReturnValue(qb);
    qb.andWhere.mockReturnThis();
    qb.innerJoin.mockReturnThis();
    qb.orderBy.mockReturnThis();
    qb.skip.mockReturnThis();
    qb.take.mockReturnThis();
    manager.create.mockImplementation((_entity: unknown, value: unknown) => value);
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) => {
      if (Array.isArray(value)) {
        return value;
      }
      const row = value as { id?: number };
      return { id: row.id ?? 8, status: 'active', createdAt: new Date(), ...row };
    });
    dataSource.transaction.mockImplementation(
      async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager),
    );
    userDepartmentRepo.find.mockResolvedValue([]);
    userRoleRepo.find.mockResolvedValue([]);
    departmentRepo.find.mockResolvedValue([]);
    roleRepo.find.mockResolvedValue([]);
    departmentService.requireAssignable.mockResolvedValue([]);
    roleService.requireAssignable.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        AdminUserService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        {
          provide: getRepositoryToken(UserDepartment),
          useValue: userDepartmentRepo,
        },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: DepartmentService, useValue: departmentService },
        { provide: RoleService, useValue: roleService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(AdminUserService);
  });

  it('lists users with keyword, department, role and status filters', async () => {
    qb.getManyAndCount.mockResolvedValue([
      [
        {
          id: 1,
          username: 'alice',
          displayName: '张三',
          email: 'alice@example.com',
          status: 'active',
          createdAt: new Date('2026-08-22T08:00:00.000Z'),
        },
      ],
      1,
    ]);

    const result = await service.list({
      page: 2,
      pageSize: 10,
      keyword: 'alice',
      departmentId: 3,
      roleId: 4,
      status: 'active',
    });

    expect(qb.andWhere).toHaveBeenCalled();
    expect(qb.innerJoin).toHaveBeenCalledTimes(2);
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.items[0]).not.toHaveProperty('password');
  });

  it('hashes password and saves multiple departments and roles', async () => {
    userRepo.findOne.mockResolvedValue(null);
    departmentService.requireAssignable.mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);
    roleService.requireAssignable.mockResolvedValue([{ id: 3 }, { id: 4 }]);

    const result = await service.create({
      username: 'alice',
      displayName: '张三',
      email: 'alice@example.com',
      password: 'secret1',
      departmentIds: [1, 2, 2],
      roleIds: [3, 4, 3],
    });

    expect(result).not.toHaveProperty('password');
    const savedUser = manager.save.mock.calls[0][1] as { password: string };
    expect(savedUser.password).not.toBe('secret1');
    expect(await bcrypt.compare('secret1', savedUser.password)).toBe(true);
    expect(departmentService.requireAssignable).toHaveBeenCalledWith([1, 2]);
    expect(roleService.requireAssignable).toHaveBeenCalledWith([3, 4]);
  });

  it('rejects duplicate username or email', async () => {
    userRepo.findOne.mockResolvedValueOnce({ id: 2, username: 'alice' });
    await expect(
      service.create({
        username: 'alice',
        displayName: '张三',
        email: 'alice@example.com',
        password: 'secret1',
        departmentIds: [],
        roleIds: [],
      }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: '用户名已存在',
    });
  });

  it('rejects assigning disabled departments', async () => {
    userRepo.findOne.mockResolvedValue(null);
    departmentService.requireAssignable.mockRejectedValue(
      new BadRequestException('不能分配已停用的部门'),
    );

    await expect(
      service.create({
        username: 'alice',
        displayName: '张三',
        email: 'alice@example.com',
        password: 'secret1',
        departmentIds: [9],
        roleIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow the current user to disable themselves', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      status: 'active',
    });

    await expect(service.changeStatus(1, 1, 'disabled')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not allow removing own system_admin role', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      username: 'admin',
      displayName: '管理员',
      email: 'admin@example.com',
      status: 'active',
    });
    roleRepo.findOne.mockResolvedValue({ id: 9, code: 'system_admin' });

    await expect(
      service.update(
        1,
        1,
        { roleIds: [2] },
        [PERMISSIONS.USERS_ASSIGN_ROLES],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps at least one active system admin', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 2,
      status: 'active',
    });
    roleRepo.findOne.mockResolvedValue({ id: 9, code: 'system_admin' });
    userRoleRepo.find.mockResolvedValue([{ userId: 2, roleId: 9 }]);
    userRoleRepo.findOne.mockResolvedValue({ userId: 2, roleId: 9 });
    userRepo.count.mockResolvedValue(1);

    await expect(service.changeStatus(1, 2, 'disabled')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rolls back when relation replace fails mid-transaction', async () => {
    userRepo.findOne.mockResolvedValue(null);
    manager.save.mockRejectedValueOnce(new Error('db fail'));

    await expect(
      service.create({
        username: 'alice',
        displayName: '张三',
        email: 'alice@example.com',
        password: 'secret1',
        departmentIds: [1],
        roleIds: [2],
      }),
    ).rejects.toThrow('db fail');
  });

  it('rehashes reset password', async () => {
    const user = {
      id: 2,
      username: 'alice',
      password: 'old',
    };
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockImplementation(async (value: typeof user) => value);

    await service.resetPassword(2, 'newpass');
    expect(user.password).not.toBe('newpass');
    expect(await bcrypt.compare('newpass', user.password)).toBe(true);
  });

  it('rejects missing user on reset password', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.resetPassword(99, 'newpass')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
