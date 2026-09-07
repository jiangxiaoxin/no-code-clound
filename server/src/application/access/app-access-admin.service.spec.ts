import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Department } from '../../admin/department/department.entity';
import { Role } from '../../admin/role/role.entity';
import { User } from '../../user/user.entity';
import { Application } from '../application.entity';
import { AppAccessAdminService } from './app-access-admin.service';
import { AppAccessScope } from './app-access-scope.entity';
import { AppAccessService } from './app-access.service';
import { AppConfigurator } from './app-configurator.entity';

describe('AppAccessAdminService', () => {
  let service: AppAccessAdminService;
  const appRepo = { findOne: jest.fn(), save: jest.fn() };
  const configuratorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const scopeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const userRepo = { find: jest.fn(), findOne: jest.fn() };
  const deptRepo = { findOne: jest.fn() };
  const roleRepo = { findOne: jest.fn() };
  const access = {
    requireConfigure: jest.fn(),
    requireOwner: jest.fn(),
    getAccess: jest.fn(),
  };
  const manager = {
    save: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown) => value),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) =>
      fn(manager),
    ),
  };

  const app = { id: 8, name: '人事', ownerId: 1 };

  beforeEach(async () => {
    jest.resetAllMocks();
    access.requireConfigure.mockResolvedValue({ ...app });
    access.requireOwner.mockResolvedValue({ ...app });
    configuratorRepo.create.mockImplementation((row) => row);
    scopeRepo.create.mockImplementation((row) => row);
    dataSource.transaction.mockImplementation(
      async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager),
    );
    manager.create.mockImplementation((_entity: unknown, value: unknown) => value);
    manager.update.mockResolvedValue({ affected: 1 });
    const module = await Test.createTestingModule({
      providers: [
        AppAccessAdminService,
        { provide: getRepositoryToken(Application), useValue: appRepo },
        {
          provide: getRepositoryToken(AppConfigurator),
          useValue: configuratorRepo,
        },
        { provide: getRepositoryToken(AppAccessScope), useValue: scopeRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Department), useValue: deptRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: AppAccessService, useValue: access },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(AppAccessAdminService);
  });

  it('名单第一行是所有者，表为空时也只有这一行', async () => {
    configuratorRepo.find.mockResolvedValue([]);
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '甲', username: 'a', status: 'active' },
    ]);
    const list = await service.listConfigurators(1, 8);
    expect(list).toEqual([
      {
        userId: 1,
        displayName: '甲',
        username: 'a',
        status: 'active',
        isOwner: true,
      },
    ]);
  });

  it('POST 所有者 id 不 insert，并提示无需添加', async () => {
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '甲', status: 'active' },
    ]);
    configuratorRepo.find.mockResolvedValue([]);
    const result = await service.addConfigurators(1, 8, [1]);
    expect(configuratorRepo.save).not.toHaveBeenCalled();
    expect(result.hints).toContain('已是所有者，无需添加');
  });

  it('POST 停用账号 400', async () => {
    userRepo.find.mockResolvedValue([
      { id: 2, displayName: '乙', status: 'disabled' },
    ]);
    await expect(service.addConfigurators(1, 8, [2])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(configuratorRepo.save).not.toHaveBeenCalled();
  });

  it('DELETE 所有者 400', async () => {
    await expect(service.removeConfigurator(1, 8, 1)).rejects.toMatchObject({
      message: '不能移除所有者',
    });
    expect(configuratorRepo.delete).not.toHaveBeenCalled();
  });

  it('POST 某人后删除该人的人员范围行', async () => {
    userRepo.find.mockResolvedValue([
      { id: 2, displayName: '乙', status: 'active' },
    ]);
    configuratorRepo.find.mockResolvedValue([]);
    await service.addConfigurators(1, 8, [2]);
    expect(manager.save).toHaveBeenCalledWith(AppConfigurator, [
      { appId: 8, userId: 2 },
    ]);
    expect(manager.delete).toHaveBeenCalledWith(AppAccessScope, {
      appId: 8,
      type: 'user',
      targetId: In([2]),
    });
  });

  it('加配置者后删范围失败时整体回滚，不留配置者行', async () => {
    userRepo.find.mockResolvedValue([
      { id: 2, displayName: '乙', status: 'active' },
    ]);
    configuratorRepo.find.mockResolvedValue([]);
    manager.delete.mockRejectedValueOnce(new Error('删范围失败'));

    await expect(service.addConfigurators(1, 8, [2])).rejects.toThrow(
      '删范围失败',
    );
    expect(configuratorRepo.save).not.toHaveBeenCalled();
  });

  it('始终可用不写范围行', async () => {
    configuratorRepo.find.mockResolvedValue([]);
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '甲', status: 'active' },
    ]);
    scopeRepo.find.mockResolvedValue([]);
    const result = await service.listAccessScopes(1, 8);
    expect(result.always.users).toEqual([
      expect.objectContaining({ id: 1, reason: 'owner' }),
    ]);
    expect(result.scopes).toEqual([]);
    expect(scopeRepo.save).not.toHaveBeenCalled();
  });

  it('停用部门的行 effective 为假且 label 含已停用', async () => {
    configuratorRepo.find.mockResolvedValue([]);
    userRepo.find.mockResolvedValue([
      { id: 1, displayName: '甲', status: 'active' },
    ]);
    scopeRepo.find.mockResolvedValue([
      { id: 11, appId: 8, type: 'department', targetId: 3 },
    ]);
    deptRepo.findOne.mockResolvedValue({
      id: 3,
      name: '研发部',
      status: 'disabled',
    });
    const result = await service.listAccessScopes(1, 8);
    expect(result.scopes[0]).toMatchObject({
      effective: false,
    });
    expect(result.scopes[0].label).toContain('已停用，当前不生效');
  });

  it('添加停用人员到范围 400', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 4,
      displayName: '丁',
      status: 'disabled',
    });
    await expect(
      service.addAccessScope(1, 8, 'user', 4),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scopeRepo.save).not.toHaveBeenCalled();
  });

  it('人员已在始终可用中则忽略并提示', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      displayName: '甲',
      status: 'active',
    });
    const result = await service.addAccessScope(1, 8, 'user', 1);
    expect(scopeRepo.save).not.toHaveBeenCalled();
    expect(result.hints).toContain('已在始终可用中，不必再加');
  });

  it('移交后名单里没有新旧所有者，范围补旧所有者、去掉新所有者人员行', async () => {
    appRepo.findOne.mockResolvedValue({ ...app });
    userRepo.findOne.mockResolvedValue({ id: 2, status: 'active' });
    manager.findOne.mockResolvedValue(null);

    await service.transferOwner(8, 1, 2);

    expect(manager.update).toHaveBeenCalledWith(
      Application,
      { id: 8, ownerId: 1 },
      { ownerId: 2 },
    );
    expect(manager.save).not.toHaveBeenCalledWith(Application, expect.anything());
    expect(manager.delete).toHaveBeenCalledWith(AppConfigurator, {
      appId: 8,
      userId: 2,
    });
    expect(manager.delete).toHaveBeenCalledWith(AppAccessScope, {
      appId: 8,
      type: 'user',
      targetId: 2,
    });
    expect(manager.save).toHaveBeenCalledWith(
      AppAccessScope,
      expect.objectContaining({ appId: 8, type: 'user', targetId: 1 }),
    );
  });

  it('并发移交：另一笔已换主人时条件更新落空，报当前所有者已变化且不改数据', async () => {
    appRepo.findOne.mockResolvedValue({ ...app });
    userRepo.findOne.mockResolvedValue({ id: 2, status: 'active' });
    manager.update.mockResolvedValue({ affected: 0 });

    await expect(service.transferOwner(8, 1, 2)).rejects.toMatchObject({
      message: '当前所有者已变化',
    });
    expect(manager.save).not.toHaveBeenCalledWith(Application, expect.anything());
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('配置者不能移交', async () => {
    access.requireOwner.mockRejectedValue(new NotFoundException('应用不存在'));
    await expect(service.transferByOwner(2, 8, 3)).rejects.toMatchObject({
      message: '应用不存在',
    });
  });
});
