import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { UserDepartment } from '../../admin/department/user-department.entity';
import { Department } from '../../admin/department/department.entity';
import { Role } from '../../admin/role/role.entity';
import { UserRole } from '../../admin/role/user-role.entity';
import { User } from '../../user/user.entity';
import { WorkflowApproverService } from './workflow.approver';

function idsOf(where: { id?: { _value?: number[] } | number }): number[] {
  const op = where?.id;
  if (op && typeof op === 'object' && Array.isArray(op._value)) return op._value;
  if (typeof op === 'number') return [op];
  return [];
}

describe('WorkflowApproverService', () => {
  let service: WorkflowApproverService;
  const userRepo = { find: jest.fn() };
  const roleRepo = { find: jest.fn() };
  const userRoleRepo = { find: jest.fn() };
  const userDepartmentRepo = { find: jest.fn(), findOne: jest.fn() };
  const departmentRepo = { findOne: jest.fn() };

  const users: Record<number, { id: number; status: string }> = {
    5: { id: 5, status: 'active' },
    9: { id: 9, status: 'active' },
    10: { id: 10, status: 'active' },
    21: { id: 21, status: 'active' },
    22: { id: 22, status: 'active' },
    23: { id: 23, status: 'disabled' },
    24: { id: 24, status: 'active' },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    userRepo.find.mockImplementation(async (opts: { where?: { id?: unknown; status?: string } }) => {
      const wanted = idsOf(opts.where as { id?: { _value?: number[] } | number });
      return wanted
        .map((id) => users[id])
        .filter((user) => user && (!opts.where?.status || user.status === opts.where.status));
    });
    const module = await Test.createTestingModule({
      providers: [
        WorkflowApproverService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(UserDepartment), useValue: userDepartmentRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
      ],
    }).compile();
    service = module.get(WorkflowApproverService);
  });

  it('指定人员过滤停用', async () => {
    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: { userIds: [21, 23], roleIds: [], memberFieldKeys: [] },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([21]);
    expect(result.emptyReason).toBeUndefined();
  });

  it('角色与发起人同部门取交集', async () => {
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    userRoleRepo.find.mockResolvedValue([
      { userId: 21, roleId: 2 },
      { userId: 22, roleId: 2 },
      { userId: 24, roleId: 2 },
    ]);
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
    userDepartmentRepo.find.mockImplementation(async (opts: { where?: { departmentId?: number } }) => {
      const rows = [
        { userId: 21, departmentId: 3 },
        { userId: 22, departmentId: 3 },
        { userId: 24, departmentId: 8 },
      ];
      return rows.filter((row) =>
        opts.where?.departmentId == null || row.departmentId === opts.where.departmentId,
      );
    });

    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: { userIds: [], roleIds: [2], memberFieldKeys: [], sameDeptAsInitiator: true },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds.sort((a, b) => a - b)).toEqual([21, 22]);
    expect(userRoleRepo.find).toHaveBeenCalledWith({ where: { roleId: In([2]) } });
  });

  it('取消同部门勾选取全公司', async () => {
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    userRoleRepo.find.mockResolvedValue([
      { userId: 21, roleId: 2 },
      { userId: 24, roleId: 2 },
    ]);

    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: { userIds: [], roleIds: [2], memberFieldKeys: [], sameDeptAsInitiator: false },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds.sort((a, b) => a - b)).toEqual([21, 24]);
    expect(userDepartmentRepo.findOne).not.toHaveBeenCalled();
  });

  it('人员字段多选收集启用账号', async () => {
    const result = await service.resolve({
      nodeTitle: '人事备案',
      approver: { userIds: [], roleIds: [], memberFieldKeys: ['field_helpers'] },
      initiatorId: 5,
      recordData: { field_helpers: [9, 10, 23] },
    });
    expect(result.userIds.sort((a, b) => a - b)).toEqual([9, 10]);
  });

  it('同一人角色加指定只出现一次', async () => {
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    userRoleRepo.find.mockResolvedValue([{ userId: 21, roleId: 2 }]);
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
    userDepartmentRepo.find.mockResolvedValue([{ userId: 21, departmentId: 3 }]);

    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: { userIds: [21], roleIds: [2], memberFieldKeys: [] },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([21]);
  });

  it('发起人无部门不失败且按角色全公司派', async () => {
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    userRoleRepo.find.mockResolvedValue([
      { userId: 21, roleId: 2 },
      { userId: 24, roleId: 2 },
    ]);
    userDepartmentRepo.findOne.mockResolvedValue(null);

    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: { userIds: [], roleIds: [2], memberFieldKeys: [] },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds.sort((a, b) => a - b)).toEqual([21, 24]);
    expect(result.unrestrictedByMissingDept).toBe(true);
  });

  it('同部门交集为空时带部门文案', async () => {
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    userRoleRepo.find.mockResolvedValue([{ userId: 24, roleId: 2 }]);
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
    userDepartmentRepo.find.mockImplementation(async (opts: { where?: { departmentId?: number } }) => {
      const rows = [{ userId: 24, departmentId: 8 }];
      return rows.filter((row) =>
        opts.where?.departmentId == null || row.departmentId === opts.where.departmentId,
      );
    });

    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: { userIds: [], roleIds: [2], memberFieldKeys: [] },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([]);
    expect(result.emptyReason).toBe(
      '节点「部门审批」在发起人所在部门没有可用的审批人',
    );
  });

  it('三种来源都空', async () => {
    const result = await service.resolve({
      nodeTitle: '人事备案',
      approver: { userIds: [], roleIds: [], memberFieldKeys: [] },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.emptyReason).toBe('节点「人事备案」没有可用的审批人');
  });

  it('只勾部门负责人时派给启用中的那个人', async () => {
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 1 });
    departmentRepo.findOne.mockResolvedValue({ id: 1, leaderUserId: 21 });
    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: {
        userIds: [],
        roleIds: [],
        memberFieldKeys: [],
        deptLeaderOfInitiator: true,
      },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([21]);
    expect(result.emptyReason).toBeUndefined();
  });

  it('负责人已停用且没有其他来源', async () => {
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 1 });
    departmentRepo.findOne.mockResolvedValue({ id: 1, leaderUserId: 23 });
    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: {
        userIds: [],
        roleIds: [],
        memberFieldKeys: [],
        deptLeaderOfInitiator: true,
      },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([]);
    expect(result.emptyReason).toBe(
      '节点「部门审批」没有可用的发起人部门负责人',
    );
    expect(result.unrestrictedByMissingDept).toBeUndefined();
  });

  it('发起人没有部门且只勾负责人', async () => {
    userDepartmentRepo.findOne.mockResolvedValue(null);
    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: {
        userIds: [],
        roleIds: [],
        memberFieldKeys: [],
        deptLeaderOfInitiator: true,
      },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([]);
    expect(result.emptyReason).toBe(
      '节点「部门审批」没有可用的发起人部门负责人',
    );
    expect(result.unrestrictedByMissingDept).toBeUndefined();
    expect(departmentRepo.findOne).not.toHaveBeenCalled();
  });

  it('负责人停用但仍有指定人员', async () => {
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 1 });
    departmentRepo.findOne.mockResolvedValue({ id: 1, leaderUserId: 23 });
    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: {
        userIds: [9],
        roleIds: [],
        memberFieldKeys: [],
        deptLeaderOfInitiator: true,
      },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([9]);
    expect(result.emptyReason).toBeUndefined();
  });

  it('指定人员和负责人是同一人只出现一次', async () => {
    userDepartmentRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 1 });
    departmentRepo.findOne.mockResolvedValue({ id: 1, leaderUserId: 21 });
    const result = await service.resolve({
      nodeTitle: '部门审批',
      approver: {
        userIds: [21],
        roleIds: [],
        memberFieldKeys: [],
        deptLeaderOfInitiator: true,
      },
      initiatorId: 5,
      recordData: {},
    });
    expect(result.userIds).toEqual([21]);
  });
});
