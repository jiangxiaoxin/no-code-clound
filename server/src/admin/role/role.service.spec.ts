import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PERMISSIONS } from '../permissions';
import { RolePermission } from './role-permission.entity';
import { Role } from './role.entity';
import { RoleService } from './role.service';
import { UserRole } from './user-role.entity';

describe('RoleService', () => {
  let service: RoleService;
  const roleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const rolePermissionRepo = {
    find: jest.fn(),
  };
  const userRoleRepo = {
    count: jest.fn(),
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
    dataSource.transaction.mockImplementation(
      async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager),
    );
    manager.create.mockImplementation((_entity: unknown, value: unknown) => value);
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) => {
      if (Array.isArray(value)) {
        return value;
      }
      const row = value as { id?: number };
      return { id: row.id ?? 3, builtIn: false, status: 'active', ...row };
    });
    const module = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        {
          provide: getRepositoryToken(RolePermission),
          useValue: rolePermissionRepo,
        },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(RoleService);
  });

  it('rejects unknown permission codes', async () => {
    roleRepo.findOne.mockResolvedValue(null);
    await expect(
      service.create({
        name: '人员管理员',
        code: 'user_admin',
        permissionCodes: ['not.a.permission'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid role codes', async () => {
    await expect(
      service.create({
        name: '人员管理员',
        code: 'User-Admin',
        permissionCodes: [PERMISSIONS.USERS_READ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate name or code', async () => {
    roleRepo.findOne.mockResolvedValueOnce({ id: 1, name: '人员管理员' });
    await expect(
      service.create({
        name: '人员管理员',
        code: 'user_admin',
        permissionCodes: [PERMISSIONS.USERS_READ],
      }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
    });
  });

  it('replaces permissions in a transaction', async () => {
    roleRepo.findOne.mockResolvedValue({
      id: 3,
      name: '人员管理员',
      code: 'user_admin',
      description: '',
      status: 'active',
      builtIn: false,
    });

    await service.update(
      3,
      { permissionCodes: [PERMISSIONS.USERS_READ, PERMISSIONS.ADMIN_ACCESS] },
      [PERMISSIONS.ROLES_ASSIGN_PERMISSIONS],
    );

    expect(manager.delete).toHaveBeenCalledWith(RolePermission, { roleId: 3 });
    expect(manager.save).toHaveBeenCalled();
  });

  it('forbids updating permissions without assign permission', async () => {
    roleRepo.findOne.mockResolvedValue({
      id: 3,
      name: '人员管理员',
      code: 'user_admin',
      builtIn: false,
      status: 'active',
    });

    await expect(
      service.update(3, { permissionCodes: [PERMISSIONS.USERS_READ] }, []),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('protects built-in system_admin from disable or delete', async () => {
    const builtIn = {
      id: 1,
      name: '系统管理员',
      code: 'system_admin',
      builtIn: true,
      status: 'active',
      description: '',
    };
    roleRepo.findOne.mockResolvedValue(builtIn);

    await expect(
      service.update(1, { status: 'disabled' }, [
        PERMISSIONS.ROLES_ASSIGN_PERMISSIONS,
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.delete(1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects delete when members exist', async () => {
    roleRepo.findOne.mockResolvedValue({
      id: 3,
      builtIn: false,
      code: 'user_admin',
    });
    userRoleRepo.count.mockResolvedValue(2);

    await expect(service.delete(3)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects assigning disabled roles', async () => {
    roleRepo.find.mockResolvedValue([{ id: 3, status: 'disabled' }]);
    await expect(service.requireAssignable([3])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns permission groups by module', () => {
    const groups = service.permissionGroups();
    expect(groups.map((group) => group.module)).toEqual([
      '管理后台',
      '人员管理',
      '部门管理',
      '角色管理',
    ]);
  });
});
