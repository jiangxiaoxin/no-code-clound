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
    taskRepo.find.mockResolvedValue([]);
    definition.getRuntime.mockResolvedValue({
      hasBeenEnabled: true,
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

  it('找不到审批人后重试：重新派这个节点，不跳到下一个', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'error', retryStep: 'dispatch' }),
    );
    approver.resolve.mockResolvedValue({ userIds: [21] });
    await engine.retry({ instanceId: 1 });
    expect(taskRepo.insert).toHaveBeenCalledWith([
      expect.objectContaining({ nodeKey: 'n1', assigneeId: 21, status: 'pending' }),
    ]);
    expect(instanceRepo.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentNodeKey: 'n2' }),
    );
  });

  it('重试重新派单：同一轮里取消过的待办改回待处理，不再插一条', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'error', retryStep: 'dispatch' }),
    );
    taskRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 7, assigneeId: 21, nodeKey: 'n1', round: 1, status: 'cancelled' },
      ]);
    approver.resolve.mockResolvedValue({ userIds: [21] });
    await engine.retry({ instanceId: 1 });
    expect(taskRepo.insert).not.toHaveBeenCalled();
    expect(taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ nodeKey: 'n1', round: 1 }),
      expect.objectContaining({ status: 'pending', cancelReason: null }),
    );
  });

  it('派待办失败进异常，不会停在审批中却没有待办', async () => {
    instanceRepo.findOne.mockResolvedValue(null);
    taskRepo.insert.mockRejectedValue(new Error('数据库炸了'));
    await engine.submit({ form, recordId, actorId: 5 });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error', retryStep: 'dispatch' }),
    );
  });

  it('审批人全部停用：单据转异常，发起人才看得到重试', async () => {
    const instance = runningInstance() as never;
    await engine.markStuckByDisabledApprovers(
      instance,
      [{ nodeKey: 'n1', round: 1, status: 'pending', assigneeId: 21 }] as never,
      new Set([21]),
    );
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status: 'running' }),
      expect.objectContaining({ status: 'error', retryStep: 'dispatch' }),
    );
  });

  it('还有一个审批人没停用：单据保持审批中', async () => {
    const instance = runningInstance() as never;
    await engine.markStuckByDisabledApprovers(
      instance,
      [
        { nodeKey: 'n1', round: 1, status: 'pending', assigneeId: 21 },
        { nodeKey: 'n1', round: 1, status: 'pending', assigneeId: 22 },
      ] as never,
      new Set([21]),
    );
    expect(instanceRepo.update).not.toHaveBeenCalled();
  });

  it('写回失败后重试：补写审批人当时改的内容', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({
        status: 'error',
        retryStep: 'mongo',
        retryPatch: { field_reason: '审批人改过的事由' },
        retryActorId: 21,
      }),
    );
    await engine.retry({ instanceId: 1 });
    expect(persist.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 21,
        data: { field_reason: '审批人改过的事由' },
      }),
    );
  });

  it('发起人已撤回时驳回失败，不会两边都成功', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 3,
      instanceId: 1,
      nodeKey: 'n2',
      assigneeId: 9,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance({ currentNodeKey: 'n2' }));
    instanceRepo.update.mockResolvedValue({ affected: 0 });
    await expect(
      engine.completeTask({
        taskId: 3,
        actorId: 9,
        action: 'reject',
        comment: '不批',
        dataPatch: {},
      }),
    ).rejects.toThrow('单据状态已变化');
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
});

const ccGraph: WorkflowGraph = {
  nodes: [
    ...leaveGraph.nodes,
    {
      key: 'cc1',
      type: 'cc',
      title: '抄送经理',
      x: 400,
      y: 2,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
      fieldAccess: {},
    },
  ],
  edges: [...leaveGraph.edges, { key: 'e_cc', from: 'n1', to: 'cc1' }],
};

describe('WorkflowEngine 抄送', () => {
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
    taskRepo.find.mockResolvedValue([]);
    definition.getRuntime.mockResolvedValue({
      hasBeenEnabled: true,
      enabled: true,
      graph: ccGraph,
      version: 1,
    });
    store.findById.mockResolvedValue({
      data: { field_leave_type: '事假' },
    });
    formRepo.findOne.mockResolvedValue(form);
    persist.persist.mockResolvedValue({});
    approver.resolve.mockImplementation(async (input: { nodeTitle?: string }) => {
      if (input.nodeTitle === '抄送经理') return { userIds: [9] };
      return { userIds: [21, 22] };
    });
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

  function ccInserts() {
    return taskRepo.insert.mock.calls
      .flatMap((call) => {
        const rows = call[0];
        return Array.isArray(rows) ? rows : [rows];
      })
      .filter((row) => row?.action === 'cc');
  }

  it('提交时不发挂在审批上的抄送', async () => {
    instanceRepo.findOne.mockResolvedValue(null);
    await engine.submit({ form, recordId, actorId: 5 });
    expect(ccInserts()).toEqual([]);
  });

  it('审批通过后写下抄送任务并继续主路', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance({ graph: ccGraph }));
    await engine.completeTask({
      taskId: 1,
      actorId: 21,
      action: 'approve',
      comment: '',
      dataPatch: {},
    });
    expect(ccInserts()).toEqual([
      expect.objectContaining({
        nodeKey: 'cc1',
        assigneeId: 9,
        status: 'done',
        action: 'cc',
      }),
    ]);
  });

  it('驳回不发抄送', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance({ graph: ccGraph }));
    await engine.completeTask({
      taskId: 1,
      actorId: 21,
      action: 'reject',
      comment: '不批',
      dataPatch: {},
    });
    expect(ccInserts()).toEqual([]);
  });

  it('抄送解析不到人则记进度不插任务', async () => {
    approver.resolve.mockImplementation(async (input: { nodeTitle?: string }) => {
      if (input.nodeTitle === '抄送经理') return { userIds: [] };
      return { userIds: [21, 22] };
    });
    taskRepo.findOne.mockResolvedValue({
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance({ graph: ccGraph }));
    await engine.completeTask({
      taskId: 1,
      actorId: 21,
      action: 'approve',
      comment: '',
      dataPatch: {},
    });
    expect(ccInserts()).toEqual([]);
    expect(instanceRepo.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ text: '节点「抄送经理」没有可抄送的人' }),
        ]),
      }),
    );
  });

  it('已有抄送行则不再插入', async () => {
    taskRepo.find.mockImplementation(async (opts: { where?: { nodeKey?: string } }) => {
      if (opts?.where?.nodeKey === 'cc1') {
        return [{ nodeKey: 'cc1', assigneeId: 9, round: 1, action: 'cc' }];
      }
      return [];
    });
    taskRepo.findOne.mockResolvedValue({
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'pending',
      round: 1,
    });
    instanceRepo.findOne.mockResolvedValue(runningInstance({ graph: ccGraph }));
    await engine.completeTask({
      taskId: 1,
      actorId: 21,
      action: 'approve',
      comment: '',
      dataPatch: {},
    });
    expect(ccInserts()).toEqual([]);
  });
});
