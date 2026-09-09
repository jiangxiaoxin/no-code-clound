// 复现 docs/reviews/2026-09-08-workflow-form-code-review.md 登记的问题。
// 每条用例表达的是「正确行为」：当前失败（红）代表对应 bug 仍在，修复后应全部转绿。
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppForm } from '../app-form.entity';
import { FormRecordPersistService } from '../form-record/form-record.persist';
import { FormRecordStore } from '../form-record/form-record.store';
import { User } from '../../user/user.entity';
import { WorkflowApproverService } from './workflow.approver';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowRenderService } from './workflow-render.service';
import { WorkflowTask } from './workflow-task.entity';
import { WorkflowGraph } from './workflow.types';

const graph: WorkflowGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
    {
      key: 'n1',
      type: 'approve',
      title: '部门审批',
      x: 0,
      y: 1,
      approver: { userIds: [21], roleIds: [], memberFieldKeys: [] },
      signMode: 'any',
      commentRequiredOnApprove: false,
      allowTransfer: true,
      allowAddSign: true,
      fieldAccess: { field_reason: 'editable' },
    },
    { key: 'end', type: 'end', title: '结束', x: 0, y: 2 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'n1' },
    { key: 'e2', from: 'n1', to: 'end' },
  ],
};

// 第二版流程：发布后加了一个新的审批节点
const graphV2: WorkflowGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
    {
      key: 'n3',
      type: 'approve',
      title: '总监审批',
      x: 0,
      y: 1,
      approver: { userIds: [31], roleIds: [], memberFieldKeys: [] },
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    { key: 'end', type: 'end', title: '结束', x: 0, y: 2 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'n3' },
    { key: 'e2', from: 'n3', to: 'end' },
  ],
};

const form = {
  id: 12,
  applicationId: 8,
  name: '请假单',
  formKind: 'workflow',
  fields: [
    { key: 'field_reason', type: 'textarea', title: '事由', required: true },
  ],
} as AppForm;

const recordId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function runningInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    appId: 8,
    formId: 12,
    recordId,
    initiatorId: 5,
    status: 'running',
    currentNodeKey: 'n1',
    graph,
    round: 1,
    hasApproved: false,
    visitedNodeKeys: ['start', 'n1'],
    notes: [],
    definitionVersion: 1,
    retryStep: null,
    errorReason: null,
    ...overrides,
  };
}

function pendingTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    instanceId: 1,
    nodeKey: 'n1',
    round: 1,
    assigneeId: 21,
    status: 'pending',
    ...overrides,
  };
}

describe('评审问题复现：workflow.engine 转交/加签/必填（2026-09-08 轮）', () => {
  let engine: WorkflowEngine;
  const instanceRepo = {
    findOne: jest.fn(),
    create: jest.fn((row) => ({ id: 1, ...row })),
    save: jest.fn(async (row) => ({ id: row.id ?? 1, ...row })),
    update: jest.fn(async () => ({ affected: 1 })),
    delete: jest.fn(),
  };
  const taskRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    count: jest.fn(),
    delete: jest.fn(),
  };
  const persist = { persist: jest.fn() };
  const approver = { resolve: jest.fn() };
  const definition = { getRuntime: jest.fn() };
  const store = { findById: jest.fn(), setWorkflowMeta: jest.fn() };
  const formRepo = { findOne: jest.fn() };
  const userRepo = { find: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    instanceRepo.update.mockResolvedValue({ affected: 1 });
    taskRepo.update.mockResolvedValue({ affected: 1 });
    taskRepo.find.mockResolvedValue([]);
    taskRepo.count.mockResolvedValue(0);
    store.findById.mockResolvedValue({ data: {} });
    formRepo.findOne.mockResolvedValue(form);
    persist.persist.mockResolvedValue({});
    approver.resolve.mockResolvedValue({ userIds: [21] });
    userRepo.find.mockResolvedValue([{ id: 22, status: 'active', displayName: '李四' }]);
    const module = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(WorkflowTask), useValue: taskRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: FormRecordPersistService, useValue: persist },
        { provide: WorkflowApproverService, useValue: approver },
        { provide: WorkflowDefinitionService, useValue: definition },
        { provide: FormRecordStore, useValue: store },
      ],
    }).compile();
    engine = module.get(WorkflowEngine);
  });

  it('【转交】已在本节点处理过的人不能被转交，待办也不能被吃掉', async () => {
    instanceRepo.findOne.mockResolvedValue(runningInstance());
    taskRepo.findOne.mockResolvedValue(pendingTask());
    taskRepo.find.mockResolvedValue([
      { id: 5, instanceId: 1, nodeKey: 'n1', round: 1, assigneeId: 22, status: 'done' },
    ]);
    await expect(
      engine.transfer({ taskId: 11, actorId: 21, assigneeId: 22, comment: '' }),
    ).rejects.toThrow('该用户已在本节点处理过，不能转交');
    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it('【加签】已在本节点处理过的人不能被加签', async () => {
    instanceRepo.findOne.mockResolvedValue(runningInstance());
    taskRepo.findOne.mockResolvedValue(pendingTask());
    taskRepo.find.mockResolvedValue([
      { id: 5, instanceId: 1, nodeKey: 'n1', round: 1, assigneeId: 22, status: 'done' },
    ]);
    await expect(
      engine.addSign({ taskId: 11, actorId: 21, assigneeIds: [22], comment: '' }),
    ).rejects.toThrow('所选人员已在本节点处理过，不能加签');
    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it('【必填】审批通过时把可编辑必填字段留空：报错且不消费待办', async () => {
    instanceRepo.findOne.mockResolvedValue(runningInstance());
    taskRepo.findOne.mockResolvedValue(pendingTask());
    await expect(
      engine.completeTask({
        taskId: 11,
        actorId: 21,
        action: 'approve',
        comment: '',
        dataPatch: {},
      }),
    ).rejects.toThrow('请填写事由');
    // 待办还在、单据状态没动，补完字段还能再点通过
    expect(taskRepo.update).not.toHaveBeenCalled();
    expect(instanceRepo.update).not.toHaveBeenCalled();
  });

  it('【必填】合并已有值后填了必填字段就能正常通过并走完流程', async () => {
    instanceRepo.findOne.mockResolvedValue(runningInstance());
    taskRepo.findOne.mockResolvedValue(pendingTask());
    store.findById.mockResolvedValue({ data: { field_reason: '事由来自草稿' } });
    const result = await engine.completeTask({
      taskId: 11,
      actorId: 21,
      action: 'approve',
      comment: '',
      dataPatch: {},
    });
    expect(result.waitingOthers).toBe(false);
    expect(store.setWorkflowMeta).toHaveBeenCalledWith(
      12,
      recordId,
      expect.objectContaining({ workflowStatus: 'approved' }),
    );
  });

  it('【僵尸待办】旧轮次残留的待办不能通过 completeTask 处理', async () => {
    instanceRepo.findOne.mockResolvedValue(runningInstance({ round: 2 }));
    taskRepo.findOne.mockResolvedValue(pendingTask({ round: 1 }));
    await expect(
      engine.completeTask({
        taskId: 11,
        actorId: 21,
        action: 'approve',
        comment: '',
        dataPatch: {},
      }),
    ).rejects.toThrow('这条待办已处理');
    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it('【草稿换图】草稿第一次提交要钉当前启用版本的图，不能沿用存草稿那天的旧图', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'draft', round: 0, currentNodeKey: null, visitedNodeKeys: [] }),
    );
    definition.getRuntime.mockResolvedValue({
      hasBeenEnabled: true,
      enabled: true,
      graph: graphV2,
      version: 2,
    });
    approver.resolve.mockResolvedValue({ userIds: [31] });
    userRepo.find.mockResolvedValue([{ id: 31, status: 'active', displayName: '王五' }]);
    const started = await engine.submit({ form, recordId, actorId: 5 });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ graph: graphV2, definitionVersion: 2 }),
    );
    expect(started.graph).toEqual(graphV2);
    expect(started.definitionVersion).toBe(2);
  });

  it('【旧图钉住】被驳回的单子再次提交仍走当初那一版流程', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'rejected', round: 2, currentNodeKey: null }),
    );
    await engine.submit({ form, recordId, actorId: 5 });
    expect(definition.getRuntime).not.toHaveBeenCalled();
    const startedCall = instanceRepo.update.mock.calls.find(
      ([, patch]) => (patch as Record<string, unknown>).round === 3,
    );
    expect(startedCall).toBeTruthy();
    expect(startedCall![1]).not.toHaveProperty('graph');
  });
});

describe('评审问题复现：workflow.render 旧图在开始节点可编辑（2026-09-08 轮）', () => {
  let service: WorkflowRenderService;
  const instanceRepo = { findOne: jest.fn() };
  const taskRepo = { find: jest.fn(), findOne: jest.fn() };
  const formRepo = { findOne: jest.fn() };
  const store = { findById: jest.fn(), query: jest.fn() };

  // 旧版本图：开始节点没配 fieldAccess（该功能上线前保存的图）
  const legacyGraph: WorkflowGraph = {
    nodes: [{ key: 'start', type: 'start', title: '开始', x: 0, y: 0 }],
    edges: [],
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      appId: 8,
      formId: 12,
      recordId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      initiatorId: 5,
      status: 'running',
      currentNodeKey: 'start',
      graph: legacyGraph,
      round: 1,
    });
    taskRepo.find.mockResolvedValue([]);
    formRepo.findOne.mockResolvedValue({
      id: 12,
      applicationId: 8,
      formKind: 'workflow',
      fields: [{ key: 'field_reason', type: 'textarea', title: '事由' }],
    });
    const module = await Test.createTestingModule({
      providers: [
        WorkflowRenderService,
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(WorkflowTask), useValue: taskRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: FormRecordStore, useValue: store },
      ],
    }).compile();
    service = module.get(WorkflowRenderService);
  });

  it('【旧图】开始节点没配字段权限时，发起人等待办期间可改任意字段', async () => {
    await expect(service.assertWritable(1, 5, 'field_reason')).resolves.toBeUndefined();
  });
});
