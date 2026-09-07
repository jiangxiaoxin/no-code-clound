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
import { WorkflowTask } from './workflow-task.entity';
import { WorkflowGraph } from './workflow.types';

const leaveGraph: WorkflowGraph = {
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
      fieldAccess: { field_reason: 'editable', field_days: 'readonly' },
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
      fieldAccess: { field_reason: 'editable' },
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
  fields: [{ key: 'field_reason', type: 'textarea', title: '事由' }],
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
    graph: leaveGraph,
    round: 1,
    hasApproved: false,
    visitedNodeKeys: ['br1', 'n1'],
    notes: [],
    definitionVersion: 1,
    retryStep: null,
    errorReason: null,
    ...overrides,
  };
}

describe('WorkflowEngine', () => {
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
    instanceRepo.create.mockImplementation((row) => ({ id: 1, ...row }));
    instanceRepo.save.mockImplementation(async (row) => ({ id: row.id ?? 1, ...row }));
    instanceRepo.update.mockResolvedValue({ affected: 1 });
    taskRepo.update.mockResolvedValue({ affected: 1 });
    definition.getRuntime.mockResolvedValue({
      published: true,
      enabled: true,
      graph: leaveGraph,
      version: 1,
    });
    store.findById.mockResolvedValue({
      data: { field_leave_type: '事假' },
    });
    formRepo.findOne.mockResolvedValue(form);
    persist.persist.mockResolvedValue({});
    approver.resolve.mockResolvedValue({ userIds: [21, 22] });
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

  it('事假：提交后派给同部门经理，或签一人通过后另一人取消', async () => {
    instanceRepo.findOne.mockResolvedValueOnce(null);
    await engine.submit({ form, recordId, actorId: 5 });
    expect(taskRepo.insert).toHaveBeenCalledTimes(1);

    taskRepo.findOne.mockResolvedValue({
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance());
    taskRepo.update.mockResolvedValueOnce({ affected: 1 });
    approver.resolve.mockResolvedValueOnce({ userIds: [9, 10] });
    await engine.completeTask({
      taskId: 1,
      actorId: 21,
      action: 'approve',
      comment: '',
      dataPatch: {},
    });
    expect(taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ nodeKey: 'n1', status: 'pending' }),
      expect.objectContaining({ status: 'cancelled', cancelReason: '或签其他人已通过' }),
    );
    expect(store.setWorkflowMeta).toHaveBeenCalledWith(
      12,
      recordId,
      expect.objectContaining({ workflowStatus: 'running' }),
    );
  });

  it('病假：直接到人事备案，不经部门审批', async () => {
    instanceRepo.findOne.mockResolvedValue(null);
    store.findById.mockResolvedValue({ data: { field_leave_type: '病假' } });
    approver.resolve.mockResolvedValue({ userIds: [9] });
    await engine.submit({ form, recordId, actorId: 5 });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        currentNodeKey: 'n2',
        visitedNodeKeys: expect.not.arrayContaining(['n1']),
      }),
    );
  });

  it('会签：张三通过后仍等李四', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 3,
      instanceId: 1,
      nodeKey: 'n2',
      assigneeId: 9,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ currentNodeKey: 'n2', visitedNodeKeys: ['br1', 'n2'] }),
    );
    taskRepo.count.mockResolvedValue(1);
    const result = await engine.completeTask({
      taskId: 3,
      actorId: 9,
      action: 'approve',
      comment: '',
      dataPatch: { field_reason: '改' },
    });
    expect(result.waitingOthers).toBe(true);
    expect(persist.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId,
        skipSerial: true,
        requiredKeys: ['field_reason'],
      }),
    );
    expect(instanceRepo.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('会签：李四也通过后已通过', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 4,
      instanceId: 1,
      nodeKey: 'n2',
      assigneeId: 10,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ currentNodeKey: 'n2', visitedNodeKeys: ['br1', 'n2'] }),
    );
    taskRepo.count.mockResolvedValue(0);
    await engine.completeTask({
      taskId: 4,
      actorId: 10,
      action: 'approve',
      comment: '',
      dataPatch: {},
    });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('会签：张三驳回则整单驳回且李四待办取消', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 3,
      instanceId: 1,
      nodeKey: 'n2',
      assigneeId: 9,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ currentNodeKey: 'n2' }),
    );
    await engine.completeTask({
      taskId: 3,
      actorId: 9,
      action: 'reject',
      comment: '不批',
      dataPatch: { field_reason: '改' },
    });
    expect(persist.persist).not.toHaveBeenCalled();
    expect(taskRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cancelReason: '会签节点已驳回' }),
    );
  });

  it('撤回：有人通过过则失败', async () => {
    instanceRepo.update.mockResolvedValue({ affected: 0 });
    await expect(engine.cancel({ instanceId: 1, actorId: 5 })).rejects.toThrow(
      '审批人已开始处理，不能撤回',
    );
  });

  it('异常态也能撤回', async () => {
    instanceRepo.findOne.mockResolvedValue(runningInstance({ status: 'error' }));
    await engine.cancel({ instanceId: 1, actorId: 5 });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        status: expect.anything(),
      }),
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('同一待办第二次完成失败', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'done',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance());
    taskRepo.update.mockResolvedValue({ affected: 0 });
    await expect(
      engine.completeTask({
        taskId: 1,
        actorId: 21,
        action: 'approve',
        comment: '',
        dataPatch: {},
      }),
    ).rejects.toThrow('这条待办已处理');
  });

  it('派发无人进异常且原因带节点名', async () => {
    instanceRepo.findOne.mockResolvedValue(null);
    approver.resolve.mockResolvedValue({
      userIds: [],
      emptyReason: '节点「部门审批」在发起人所在部门没有可用的审批人',
    });
    await engine.submit({ form, recordId, actorId: 5 });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'error',
        errorReason: expect.stringContaining('在发起人所在部门'),
      }),
    );
  });

  it('没有实例的已通过不能重审', async () => {
    instanceRepo.findOne.mockResolvedValue(null);
    await expect(
      engine.resubmitApproved({ form, recordId, actorId: 5 }),
    ).rejects.toThrow('这条数据没有审批记录，不能重新提交');
  });

  it('重试从 mongo 步开始不再改待办', async () => {
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      status: 'error',
      retryStep: 'mongo',
      currentNodeKey: 'n1',
      formId: 12,
      recordId,
      graph: leaveGraph,
      round: 1,
      initiatorId: 5,
      notes: [],
    });
    await engine.retry({ instanceId: 1 });
    expect(taskRepo.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
      expect.objectContaining({ status: 'done' }),
    );
  });

  it('异常后再提交会取消上一轮未处理待办', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'error', currentNodeKey: 'n1', round: 1 }),
    );
    approver.resolve.mockResolvedValue({ userIds: [21] });
    await engine.submit({ form, recordId, actorId: 5 });
    expect(taskRepo.update).toHaveBeenCalledWith(
      { instanceId: 1, status: 'pending' },
      expect.objectContaining({
        status: 'cancelled',
        cancelReason: '发起人再次提交',
      }),
    );
  });

  it('上一轮残留待办不能驳回新一轮', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 99,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 22,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ round: 2, currentNodeKey: 'n1' }),
    );
    taskRepo.update.mockResolvedValue({ affected: 1 });
    await expect(
      engine.completeTask({
        taskId: 99,
        actorId: 22,
        action: 'reject',
        comment: '不批',
        dataPatch: {},
      }),
    ).rejects.toThrow('这条待办已处理');
    expect(instanceRepo.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'rejected' }),
    );
    expect(persist.persist).not.toHaveBeenCalled();
  });

  it('当前节点已推进时旧节点残留待办不能驳回', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 7,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 22,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ currentNodeKey: 'n2', visitedNodeKeys: ['br1', 'n1', 'n2'] }),
    );
    taskRepo.update.mockResolvedValue({ affected: 1 });
    await expect(
      engine.completeTask({
        taskId: 7,
        actorId: 22,
        action: 'reject',
        comment: '不批',
        dataPatch: {},
      }),
    ).rejects.toThrow('这条待办已处理');
    expect(instanceRepo.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'rejected' }),
    );
  });
});
