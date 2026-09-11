import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { Department } from '../admin/department/department.entity';
import { UserDepartment } from '../admin/department/user-department.entity';
import { Role } from '../admin/role/role.entity';
import { User } from '../user/user.entity';
import { AppAccessService } from './access/app-access.service';
import { AppFormConfig } from './app-form-config.entity';
import { FormDataAccessService } from './form-data-access.service';
import { WorkflowInstance } from './workflow/workflow-instance.entity';
import { WorkflowTask } from './workflow/workflow-task.entity';

describe('FormDataAccessService', () => {
  let service: FormDataAccessService;
  const formConfigRepo = { findOne: jest.fn(), find: jest.fn() };
  const userDeptRepo = { findOne: jest.fn(), find: jest.fn() };
  const deptRepo = { findOne: jest.fn() };
  const roleRepo = { findOne: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const instanceRepo = { find: jest.fn() };
  const taskRepo = { find: jest.fn() };
  const access = { targetsHit: jest.fn() };

  const usage = {
    app: { id: 8 },
    canUse: true,
    canConfigure: false,
    isOwner: false,
  };
  const owner = {
    ...usage,
    canConfigure: true,
    isOwner: true,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    formConfigRepo.findOne.mockResolvedValue(null);
    formConfigRepo.find.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        FormDataAccessService,
        { provide: getRepositoryToken(AppFormConfig), useValue: formConfigRepo },
        { provide: getRepositoryToken(UserDepartment), useValue: userDeptRepo },
        { provide: getRepositoryToken(Department), useValue: deptRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(WorkflowTask), useValue: taskRepo },
        { provide: AppAccessService, useValue: access },
      ],
    }).compile();
    service = module.get(FormDataAccessService);
  });

  it('配置者始终能看所有表', async () => {
    formConfigRepo.findOne.mockResolvedValue({
      config: { formViewers: [{ type: 'role', targetId: 2 }] },
    });
    await expect(service.canViewForm(1, owner, 12)).resolves.toBe(true);
    expect(access.targetsHit).not.toHaveBeenCalled();
  });

  it('空名单时使用人能看见表', async () => {
    await expect(service.canViewForm(9, usage, 12)).resolves.toBe(true);
  });

  it('有名单且没命中则当作表单不存在', async () => {
    formConfigRepo.findOne.mockResolvedValue({
      config: { formViewers: [{ type: 'role', targetId: 2 }] },
    });
    access.targetsHit.mockResolvedValue(false);
    await expect(service.assertCanViewForm(9, usage, 12)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('使用人默认只能看自己创建的普通表行', async () => {
    const filter = await service.rowMongoFilter(9, usage, 12, 'normal');
    expect(filter).toEqual({ createdBy: 9 });
  });

  it('所有者查行不加过滤', async () => {
    await expect(service.rowMongoFilter(1, owner, 12, 'normal')).resolves.toBe(
      null,
    );
  });

  it('与自己相关包含派过给我的流程单', async () => {
    taskRepo.find.mockResolvedValue([{ instanceId: 33 }]);
    instanceRepo.find.mockResolvedValue([
      { recordId: '64b64c4c4c4c4c4c4c4c4c4c' },
    ]);
    const filter = await service.rowMongoFilter(9, usage, 12, 'workflow');
    expect(filter).toEqual({
      $or: [
        { createdBy: 9 },
        { _id: { $in: [new ObjectId('64b64c4c4c4c4c4c4c4c4c4c')] } },
      ],
    });
  });

  it('仅本人创建不看参与过的单', async () => {
    formConfigRepo.findOne.mockResolvedValue({
      config: { rowScope: 'created' },
    });
    const filter = await service.rowMongoFilter(9, usage, 12, 'workflow');
    expect(filter).toEqual({ createdBy: 9 });
    expect(taskRepo.find).not.toHaveBeenCalled();
  });

  it('本部门看同事创建的行；没部门时退回与自己相关', async () => {
    formConfigRepo.findOne.mockResolvedValue({
      config: { rowScope: 'dept' },
    });
    userDeptRepo.findOne.mockResolvedValue({ userId: 9, departmentId: 4 });
    userDeptRepo.find.mockResolvedValue([
      { userId: 9, departmentId: 4 },
      { userId: 10, departmentId: 4 },
    ]);
    await expect(service.rowMongoFilter(9, usage, 12, 'normal')).resolves.toEqual(
      { createdBy: { $in: [9, 10] } },
    );

    userDeptRepo.findOne.mockResolvedValue(null);
    await expect(service.rowMongoFilter(9, usage, 12, 'normal')).resolves.toEqual(
      { createdBy: 9 },
    );
  });

  it('看不到的行当记录不存在', async () => {
    await expect(
      service.assertCanViewRecord(
        9,
        usage,
        12,
        { _id: new ObjectId('64b64c4c4c4c4c4c4c4c4c4c'), createdBy: 8 },
        'normal',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
