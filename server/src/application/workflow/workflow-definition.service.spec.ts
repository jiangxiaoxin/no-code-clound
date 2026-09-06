import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppAccessService } from '../access/app-access.service';
import { AppForm } from '../app-form.entity';
import { Role } from '../../admin/role/role.entity';
import { User } from '../../user/user.entity';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowDefinition } from './workflow-definition.entity';
import { WorkflowInstance } from './workflow-instance.entity';

const leaveGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
    { key: 'br1', type: 'branch', title: '按请假类型', x: 0, y: 1 },
    {
      key: 'n1',
      type: 'approve',
      title: '部门审批',
      x: 0,
      y: 2,
      approver: { userIds: [], roleIds: [2], memberFieldKeys: [] },
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    {
      key: 'n2',
      type: 'approve',
      title: '人事备案',
      x: 0,
      y: 3,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
      signMode: 'all',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    { key: 'end', type: 'end', title: '结束', x: 0, y: 4 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'br1' },
    {
      key: 'e2',
      from: 'br1',
      to: 'n1',
      sort: 1,
      when: { logic: 'all', items: [{ key: 'field_leave_type', op: 'eq', value: '事假' }] },
    },
    { key: 'e3', from: 'br1', to: 'n2', sort: 2, isDefault: true },
    { key: 'e4', from: 'n1', to: 'n2' },
    { key: 'e5', from: 'n2', to: 'end' },
  ],
};

const form = {
  id: 12,
  applicationId: 8,
  name: '请假单',
  formKind: 'workflow',
  fields: [{ key: 'field_leave_type', type: 'select', title: '请假类型' }],
};

describe('WorkflowDefinitionService', () => {
  let service: WorkflowDefinitionService;
  const defRepo = {
    findOne: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => ({ id: row.id ?? 1, ...row })),
  };
  const formRepo = { findOne: jest.fn() };
  const instanceRepo = { count: jest.fn() };
  const userRepo = { find: jest.fn() };
  const roleRepo = { find: jest.fn() };
  const access = {
    requireConfigure: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    defRepo.create.mockImplementation((row) => row);
    defRepo.save.mockImplementation(async (row) => ({ id: row.id ?? 1, ...row }));
    access.requireConfigure.mockResolvedValue({ id: 8, ownerId: 3 });
    formRepo.findOne.mockResolvedValue({ ...form });
    instanceRepo.count.mockResolvedValue(0);
    userRepo.find.mockResolvedValue([{ id: 9, status: 'active' }]);
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    const module = await Test.createTestingModule({
      providers: [
        WorkflowDefinitionService,
        { provide: getRepositoryToken(WorkflowDefinition), useValue: defRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: AppAccessService, useValue: access },
      ],
    }).compile();
    service = module.get(WorkflowDefinitionService);
  });

  it('发布缺审批人时拒绝且不启用', async () => {
    const emptyApprove = {
      ...leaveGraph,
      nodes: leaveGraph.nodes.map((node) =>
        node.key === 'n1'
          ? {
              ...node,
              approver: { userIds: [], roleIds: [], memberFieldKeys: [] },
            }
          : node,
      ),
    };
    const row = {
      id: 1,
      formId: 12,
      appId: 8,
      draftGraph: emptyApprove,
      publishedGraph: null,
      publishedVersion: 0,
      enabled: false,
    };
    defRepo.findOne.mockResolvedValue({ ...row });

    await expect(service.publish(3, 8, 12)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(defRepo.save).not.toHaveBeenCalled();
  });

  it('发布成功后启用且版本为 1', async () => {
    const row = {
      id: 1,
      formId: 12,
      appId: 8,
      draftGraph: leaveGraph,
      publishedGraph: null,
      publishedVersion: 0,
      enabled: false,
    };
    defRepo.findOne.mockResolvedValue({ ...row });

    const saved = await service.publish(3, 8, 12);
    expect(saved.enabled).toBe(true);
    expect(saved.publishedVersion).toBe(1);
    expect(defRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        publishedVersion: 1,
        publishedGraph: leaveGraph,
      }),
    );
  });

  it('只保存草稿不发布', async () => {
    defRepo.findOne.mockResolvedValue(null);
    await service.saveDraft(3, 8, 12, leaveGraph);
    expect(defRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        draftGraph: leaveGraph,
        publishedVersion: 0,
        enabled: false,
      }),
    );
    defRepo.findOne.mockResolvedValue({
      publishedVersion: 0,
      enabled: false,
      publishedGraph: null,
    });
    await expect(service.getRuntime(12)).resolves.toEqual({
      published: false,
      enabled: false,
      graph: null,
      version: 0,
    });
  });

  it('从未发布时不能打开启用开关', async () => {
    defRepo.findOne.mockResolvedValue({
      id: 1,
      publishedVersion: 0,
      enabled: false,
      publishedGraph: null,
    });
    await expect(service.setEnabled(3, 8, 12, true)).rejects.toMatchObject({
      message: '请先发布流程',
    });
  });
});
