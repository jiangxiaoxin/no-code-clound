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
import { WorkflowVersion } from './workflow-version.entity';
import { WorkflowGraph } from './workflow.types';

const form = {
  id: 12,
  applicationId: 8,
  name: '请假单',
  formKind: 'workflow',
  fields: [
    { key: 'field_leave_type', type: 'select', title: '请假类型' },
    { key: 'field_reason', type: 'textarea', title: '事由' },
  ],
};

const startGraph = {
  nodes: [{ key: 'start', type: 'start', title: '开始', x: 240, y: 40 }],
  edges: [],
};

// 自动生成 V1 时，开始节点带「流程终止后可修改后重新提交」的默认开启状态
const autoV1Graph = {
  nodes: [
    {
      allowResubmitAfterTerminated: true,
      key: 'start',
      type: 'start',
      title: '开始',
      x: 240,
      y: 40,
    },
  ],
  edges: [],
};

const leaveGraph: WorkflowGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 240, y: 40 },
    { key: 'br1', type: 'branch', title: '按请假类型', x: 240, y: 140 },
    {
      key: 'n1',
      type: 'approve',
      title: '部门审批',
      x: 80,
      y: 280,
      approver: {
        userIds: [],
        roleIds: [2],
        memberFieldKeys: [],
        sameDeptAsInitiator: true,
      },
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: {
        field_leave_type: 'readonly',
        field_reason: 'editable',
      },
    },
    {
      key: 'n2',
      type: 'approve',
      title: '人事备案',
      x: 240,
      y: 420,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
      signMode: 'all',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    { key: 'end', type: 'end', title: '结束', x: 240, y: 540 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'br1' },
    {
      key: 'e2',
      from: 'br1',
      to: 'n1',
      title: '事假',
      sort: 1,
      isDefault: false,
      when: {
        logic: 'all',
        items: [{ key: 'field_leave_type', op: 'eq', value: '事假' }],
      },
    },
    {
      key: 'e3',
      from: 'br1',
      to: 'n2',
      title: '其他情况',
      sort: 2,
      isDefault: true,
    },
    { key: 'e4', from: 'n1', to: 'n2' },
    { key: 'e5', from: 'n2', to: 'end' },
  ],
};

const noApproverGraph: WorkflowGraph = {
  ...leaveGraph,
  nodes: leaveGraph.nodes.map((node) =>
    node.type === 'approve'
      ? {
          ...node,
          approver: { userIds: [], roleIds: [], memberFieldKeys: [] },
        }
      : node,
  ),
};

describe('WorkflowDefinitionService', () => {
  let service: WorkflowDefinitionService;
  const defRepo = {
    findOne: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => ({ id: row.id ?? 1, ...row })),
  };
  const versionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => ({ id: row.id ?? 10, ...row })),
    update: jest.fn(),
    delete: jest.fn(),
    // enableVersion 用 manager.transaction 包住「先全关再开一行」
    manager: {
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) =>
        cb(versionRepo),
      ),
    },
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
    versionRepo.create.mockImplementation((row) => row);
    versionRepo.save.mockImplementation(async (row) => ({ id: row.id ?? 10, ...row }));
    access.requireConfigure.mockResolvedValue({ id: 8, ownerId: 3 });
    formRepo.findOne.mockResolvedValue({ ...form });
    instanceRepo.count.mockResolvedValue(2);
    userRepo.find.mockResolvedValue([{ id: 9, status: 'active' }]);
    roleRepo.find.mockResolvedValue([{ id: 2, status: 'active' }]);
    const module = await Test.createTestingModule({
      providers: [
        WorkflowDefinitionService,
        { provide: getRepositoryToken(WorkflowDefinition), useValue: defRepo },
        { provide: getRepositoryToken(WorkflowVersion), useValue: versionRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: AppAccessService, useValue: access },
      ],
    }).compile();
    service = module.get(WorkflowDefinitionService);
  });

  it('没有版本时生成 V1 开始节点', async () => {
    defRepo.findOne.mockResolvedValue(null);
    versionRepo.find.mockResolvedValue([]);
    const detail = await service.get(3, 8, 12);
    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        formId: 12,
        version: 1,
        enabled: false,
        graph: autoV1Graph,
      }),
    );
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0].title).toBe('流程版本 (V1)');
    expect(detail.runningCount).toBe(2);
    expect(detail.hasBeenEnabled).toBe(false);
  });

  it('getRuntime 读启用中的版本', async () => {
    defRepo.findOne.mockResolvedValue({ id: 1, formId: 12, hasBeenEnabled: true });
    versionRepo.findOne.mockResolvedValue({
      id: 4,
      version: 2,
      enabled: true,
      graph: startGraph,
    });
    await expect(service.getRuntime(12)).resolves.toEqual({
      hasBeenEnabled: true,
      enabled: true,
      graph: startGraph,
      version: 2,
    });
  });

  it('曾经启用当前全关时 getRuntime.enabled 为假', async () => {
    defRepo.findOne.mockResolvedValue({ id: 1, formId: 12, hasBeenEnabled: true });
    versionRepo.findOne.mockResolvedValue(null);
    await expect(service.getRuntime(12)).resolves.toEqual({
      hasBeenEnabled: true,
      enabled: false,
      graph: null,
      version: 0,
    });
  });

  it('从未启用时 getRuntime.hasBeenEnabled 为假', async () => {
    defRepo.findOne.mockResolvedValue({ id: 1, formId: 12, hasBeenEnabled: false });
    versionRepo.findOne.mockResolvedValue(null);
    await expect(service.getRuntime(12)).resolves.toEqual({
      hasBeenEnabled: false,
      enabled: false,
      graph: null,
      version: 0,
    });
  });

  it('启用缺审批人时拒绝且不改 enabled', async () => {
    defRepo.findOne.mockResolvedValue({ id: 1, formId: 12, hasBeenEnabled: false });
    versionRepo.findOne.mockResolvedValue({
      id: 10,
      formId: 12,
      version: 1,
      enabled: false,
      graph: noApproverGraph,
    });
    await expect(service.enableVersion(3, 8, 12, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(versionRepo.update).not.toHaveBeenCalled();
    expect(versionRepo.save).not.toHaveBeenCalled();
  });

  it('启用成功后只有这一版 enabled，hasBeenEnabled 为真', async () => {
    defRepo.findOne.mockResolvedValue({
      id: 1,
      appId: 8,
      formId: 12,
      hasBeenEnabled: false,
    });
    versionRepo.findOne.mockResolvedValue({
      id: 10,
      formId: 12,
      version: 1,
      enabled: false,
      graph: leaveGraph,
    });
    // resetAllMocks 会清掉 manager.transaction 的默认实现，这里手动恢复
    versionRepo.manager.transaction.mockImplementation(
      async (cb: (manager: unknown) => Promise<void>) => cb(versionRepo),
    );
    await service.enableVersion(3, 8, 12, 10);
    expect(versionRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(versionRepo.update).toHaveBeenCalledWith(
      WorkflowVersion,
      { formId: 12 },
      { enabled: false },
    );
    expect(versionRepo.update).toHaveBeenCalledWith(
      WorkflowVersion,
      { id: 10 },
      { enabled: true },
    );
    expect(defRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ hasBeenEnabled: true }),
    );
  });

  it('不能保存启用中的版本', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: 10,
      formId: 12,
      enabled: true,
      graph: leaveGraph,
    });
    await expect(
      service.saveVersion(3, 8, 12, 10, leaveGraph),
    ).rejects.toThrow('启用中的版本不能修改');
  });

  it('不能删除启用中的版本', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: 10,
      formId: 12,
      enabled: true,
      graph: leaveGraph,
    });
    await expect(service.deleteVersion(3, 8, 12, 10)).rejects.toThrow(
      '启用中的版本不能删除',
    );
    expect(versionRepo.delete).not.toHaveBeenCalled();
  });

  it('复制当前版得到 version+1 且未启用', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: 10,
      appId: 8,
      formId: 12,
      version: 2,
      enabled: true,
      graph: leaveGraph,
    });
    versionRepo.find.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    await service.copyVersion(3, 8, 12, 10);
    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        formId: 12,
        version: 3,
        enabled: false,
        graph: leaveGraph,
      }),
    );
  });

  it('删光后自动补 V1', async () => {
    defRepo.findOne.mockResolvedValue({
      id: 1,
      appId: 8,
      formId: 12,
      hasBeenEnabled: false,
    });
    versionRepo.findOne.mockResolvedValue({
      id: 10,
      appId: 8,
      formId: 12,
      version: 1,
      enabled: false,
      graph: leaveGraph,
    });
    versionRepo.find.mockResolvedValue([]);
    await service.deleteVersion(3, 8, 12, 10);
    expect(versionRepo.delete).toHaveBeenCalled();
    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        formId: 12,
        version: 1,
        enabled: false,
        graph: autoV1Graph,
      }),
    );
  });
});
