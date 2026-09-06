import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Department } from '../../admin/department/department.entity';
import { UserDepartment } from '../../admin/department/user-department.entity';
import { Role } from '../../admin/role/role.entity';
import { UserRole } from '../../admin/role/user-role.entity';
import { User } from '../../user/user.entity';
import { Application } from '../application.entity';
import { AppAccessScope } from './app-access-scope.entity';
import { AppAccessService } from './app-access.service';
import { AppConfigurator } from './app-configurator.entity';

describe('AppAccessService', () => {
  let service: AppAccessService;
  const appRepo = { findOne: jest.fn(), find: jest.fn() };
  const configuratorRepo = { findOne: jest.fn(), find: jest.fn() };
  const scopeRepo = { find: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const userDeptRepo = { findOne: jest.fn() };
  const deptRepo = { findOne: jest.fn() };
  const userRoleRepo = { find: jest.fn() };
  const roleRepo = { find: jest.fn(), count: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AppAccessService,
        { provide: getRepositoryToken(Application), useValue: appRepo },
        {
          provide: getRepositoryToken(AppConfigurator),
          useValue: configuratorRepo,
        },
        { provide: getRepositoryToken(AppAccessScope), useValue: scopeRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserDepartment), useValue: userDeptRepo },
        { provide: getRepositoryToken(Department), useValue: deptRepo },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
      ],
    }).compile();
    service = module.get(AppAccessService);
  });

  it('所有者能使用也能配置', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 3, name: '人事' });
    await expect(service.getAccess(3, 8)).resolves.toMatchObject({
      canUse: true,
      canConfigure: true,
      isOwner: true,
    });
    expect(configuratorRepo.findOne).not.toHaveBeenCalled();
  });

  it('其他人当作应用不存在', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 3, name: '人事' });
    configuratorRepo.findOne.mockResolvedValue(null);
    scopeRepo.find.mockResolvedValue([]);
    await expect(service.requireUse(9, 8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.requireConfigure(9, 8)).rejects.toMatchObject({
      message: '应用不存在',
    });
    await expect(service.requireOwner(9, 8)).rejects.toMatchObject({
      message: '应用不存在',
    });
  });

  it('应用不存在时三个入口都提示应用不存在', async () => {
    appRepo.findOne.mockResolvedValue(null);
    await expect(service.getAccess(3, 8)).rejects.toMatchObject({
      message: '应用不存在',
    });
  });

  it('配置名单上的人能配置也能使用', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
    configuratorRepo.findOne.mockResolvedValue({ appId: 8, userId: 2 });
    const access = await service.getAccess(2, 8);
    expect(access).toMatchObject({
      canConfigure: true,
      canUse: true,
      isOwner: false,
    });
  });

  it('部门范围内启用账号能使用不能配置', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
    configuratorRepo.findOne.mockResolvedValue(null);
    userDeptRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
    deptRepo.findOne.mockResolvedValue({ id: 3, status: 'active' });
    scopeRepo.find.mockResolvedValue([{ type: 'department', targetId: 3 }]);
    const access = await service.getAccess(5, 8);
    expect(access).toMatchObject({ canUse: true, canConfigure: false });
  });

  it('部门已停用则范围不命中', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
    configuratorRepo.findOne.mockResolvedValue(null);
    userDeptRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
    deptRepo.findOne.mockResolvedValue({ id: 3, status: 'disabled' });
    scopeRepo.find.mockResolvedValue([{ type: 'department', targetId: 3 }]);
    await expect(service.requireUse(5, 8)).rejects.toMatchObject({
      message: '应用不存在',
    });
  });

  it('角色已停用即使 user_role 还在也不命中', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
    configuratorRepo.findOne.mockResolvedValue(null);
    scopeRepo.find.mockResolvedValue([{ type: 'role', targetId: 9 }]);
    userRoleRepo.find.mockResolvedValue([{ userId: 5, roleId: 9 }]);
    roleRepo.count.mockResolvedValue(0);
    await expect(service.requireUse(5, 8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('人员范围命中启用账号能使用不能配置', async () => {
    appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
    configuratorRepo.findOne.mockResolvedValue(null);
    scopeRepo.find.mockResolvedValue([{ type: 'user', targetId: 5 }]);
    userRepo.findOne.mockResolvedValue({ id: 5, status: 'active' });
    const access = await service.getAccess(5, 8);
    expect(access).toMatchObject({ canUse: true, canConfigure: false });
  });

  it('listAccessible 按所有者、名单、范围去重并带权限标记', async () => {
    configuratorRepo.find.mockResolvedValue([{ appId: 9, userId: 5 }]);
    userDeptRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
    deptRepo.findOne.mockResolvedValue({ id: 3, status: 'active' });
    userRoleRepo.find.mockResolvedValue([]);
    scopeRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ appId: 8, type: 'department', targetId: 3 }]);
    appRepo.find.mockResolvedValue([
      { id: 8, name: '人事', icon: '#aaa', ownerId: 1, createdAt: new Date() },
      { id: 9, name: '仓库', icon: '#bbb', ownerId: 2, createdAt: new Date() },
    ]);

    const result = await service.listAccessible(5);

    expect(scopeRepo.find).toHaveBeenCalledWith({
      where: { type: 'user', targetId: 5 },
    });
    expect(scopeRepo.find).toHaveBeenCalledWith({
      where: { type: 'department', targetId: 3 },
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 8,
          name: '人事',
          isOwner: false,
          canConfigure: false,
        }),
        expect.objectContaining({
          id: 9,
          name: '仓库',
          isOwner: false,
          canConfigure: true,
        }),
      ]),
    );
  });
});
