import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Application } from '../../application/application.entity';
import { AppAccessAdminService } from '../../application/access/app-access-admin.service';
import { User } from '../../user/user.entity';
import { AuthPrincipal } from '../permissions';
import { AdminOwnedAppService } from './admin-owned-app.service';

function principal(roleCodes: string[]): AuthPrincipal {
  return {
    id: 9,
    username: 'admin',
    email: 'a@a.com',
    displayName: '管',
    status: 'active',
    departmentIds: [],
    departmentName: null,
    roleCodes,
    permissions: ['admin.access'],
  };
}

describe('AdminOwnedAppService', () => {
  let service: AdminOwnedAppService;
  const userRepo = { findOne: jest.fn() };
  const appRepo = { find: jest.fn(), findOne: jest.fn() };
  const accessAdmin = { transferOwner: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminOwnedAppService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Application), useValue: appRepo },
        { provide: AppAccessAdminService, useValue: accessAdmin },
      ],
    }).compile();
    service = module.get(AdminOwnedAppService);
  });

  it('启用中的所有者列表为空', async () => {
    userRepo.findOne.mockResolvedValue({ id: 3, status: 'active' });
    await expect(
      service.listOwnedApps(principal(['system_admin']), 3),
    ).resolves.toEqual([]);
    expect(appRepo.find).not.toHaveBeenCalled();
  });

  it('非 system_admin 拒绝', async () => {
    await expect(
      service.listOwnedApps(principal(['dept_admin']), 3),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('停用所有者 + 系统管理员能交，且 transferOwner 被调用一次', async () => {
    userRepo.findOne.mockResolvedValue({ id: 3, status: 'disabled' });
    appRepo.findOne.mockResolvedValue({ id: 8, name: '人事', ownerId: 3 });
    await service.transferOwnedApp(principal(['system_admin']), 3, 8, 9);
    expect(accessAdmin.transferOwner).toHaveBeenCalledTimes(1);
    expect(accessAdmin.transferOwner).toHaveBeenCalledWith(8, 3, 9);
  });

  it('停用所有者列出应用名', async () => {
    userRepo.findOne.mockResolvedValue({ id: 3, status: 'disabled' });
    appRepo.find.mockResolvedValue([{ id: 8, name: '人事' }]);
    await expect(
      service.listOwnedApps(principal(['system_admin']), 3),
    ).resolves.toEqual([{ id: 8, name: '人事' }]);
  });
});
