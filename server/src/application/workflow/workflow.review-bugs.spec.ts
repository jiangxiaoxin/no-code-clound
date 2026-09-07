// 复现 docs/reviews/2026-09-07-workflow-and-permission-review.md 登记的问题。
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
      fieldAccess: { field_reason: 'editable' },
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

describe('评审问题复现：workflow.engine 重试路径', () => {
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
    store.findById.mockResolvedValue({ data: { field_leave_type: '事假' } });
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

  it('【必须修1】重试翻转状态时撤回已抢先（affected=0）：不应给已撤回的单派待办', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'error', retryStep: 'dispatch', hasApproved: false }),
    );
    // 撤回的条件更新先把单据改回草稿，重试的翻转 update 影响 0 行
    instanceRepo.update.mockResolvedValueOnce({ affected: 0 });
    approver.resolve.mockResolvedValue({ userIds: [21] });
    await engine.retry({ instanceId: 1 });
    expect(taskRepo.insert).not.toHaveBeenCalled();
    expect(taskRepo.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('【必须修1】重试翻转落空后不应把 Mongo 写回成「审批中」', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'error', retryStep: 'dispatch', hasApproved: false }),
    );
    instanceRepo.update.mockResolvedValueOnce({ affected: 0 });
    approver.resolve.mockResolvedValue({ userIds: [21] });
    await engine.retry({ instanceId: 1 });
    expect(store.setWorkflowMeta).not.toHaveBeenCalledWith(
      12,
      recordId,
      expect.objectContaining({ workflowStatus: 'running' }),
    );
  });

  it('【必须修1-补】翻转成功后撤回才落库：复核发现已撤回，撤掉刚派的待办并对齐 Mongo', async () => {
    const errorInstance = runningInstance({
      status: 'error',
      retryStep: 'dispatch',
      hasApproved: false,
    });
    const draftInstance = runningInstance({
      status: 'draft',
      currentNodeKey: null,
      hasApproved: false,
      retryStep: null,
      errorReason: null,
    });
    // 第 1 次读：重试入口；第 2 次读：撤回里重新查单；之后读到的是撤回后的草稿
    instanceRepo.findOne
      .mockResolvedValueOnce(errorInstance)
      .mockResolvedValueOnce(errorInstance)
      .mockResolvedValue(draftInstance);
    // 本节点只剩一条取消过的待办，重试会把它改回待处理
    taskRepo.find
      .mockResolvedValueOnce([]) // cancelDisabledPending：没有待处理的待办
      .mockResolvedValueOnce([
        { id: 6, instanceId: 1, nodeKey: 'n1', round: 1, assigneeId: 21, status: 'cancelled' },
      ]);
    let cancelLanded = false;
    // 竞态注入：状态翻转落库的同时，发起人的撤回也提交成功
    instanceRepo.update.mockImplementationOnce(async () => {
      if (!cancelLanded) {
        cancelLanded = true;
        await engine.cancel({ instanceId: 1, actorId: 5 });
      }
      return { affected: 1 };
    });
    await engine.retry({ instanceId: 1 });
    // 派出去的待办要被复核撤回，Mongo 状态跟着数据库实际状态走
    expect(taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ nodeKey: 'n1', status: 'pending' }),
      expect.objectContaining({
        status: 'cancelled',
        cancelReason: '单据状态已变化，待办自动撤回',
      }),
    );
    expect(store.setWorkflowMeta).toHaveBeenLastCalledWith(
      12,
      recordId,
      expect.objectContaining({ workflowStatus: 'draft' }),
    );
  });

  it('【必须修2】会签写回失败后重试：还有人没批时不能推进到「已通过」', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({
        status: 'error',
        retryStep: 'mongo',
        currentNodeKey: 'n2',
        visitedNodeKeys: ['br1', 'n2'],
        hasApproved: true,
        retryPatch: { field_reason: '张三改的' },
        retryActorId: 9,
      }),
    );
    // 李四的待办还挂在本节点
    taskRepo.count.mockResolvedValue(1);
    await engine.retry({ instanceId: 1 });
    expect(instanceRepo.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved' }),
    );
    expect(store.setWorkflowMeta).not.toHaveBeenCalledWith(
      12,
      recordId,
      expect.objectContaining({ workflowStatus: 'approved' }),
    );
  });

  it('【必须修2-修复】会签写回重试：还有人没批时回到审批中等他，不推进', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({
        status: 'error',
        retryStep: 'mongo',
        currentNodeKey: 'n2',
        visitedNodeKeys: ['br1', 'n2'],
        hasApproved: true,
        retryPatch: { field_reason: '张三改的' },
        retryActorId: 9,
      }),
    );
    taskRepo.count.mockResolvedValue(1);
    await engine.retry({ instanceId: 1 });
    // 张三当时改的内容先补写进表单
    expect(persist.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        data: expect.objectContaining({ field_reason: '张三改的' }),
      }),
    );
    // 单据回到审批中，等人批完再继续
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status: 'error' }),
      expect.objectContaining({ status: 'running', retryStep: null }),
    );
    expect(instanceRepo.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('【必须修2-锁定】会签写回重试：所有人都批完才继续推进到已通过', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({
        status: 'error',
        retryStep: 'mongo',
        currentNodeKey: 'n2',
        visitedNodeKeys: ['br1', 'n2'],
        hasApproved: true,
        retryPatch: { field_reason: '张三改的' },
        retryActorId: 9,
      }),
    );
    taskRepo.count.mockResolvedValue(0);
    await engine.retry({ instanceId: 1 });
    expect(instanceRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('【必须修3】会签里已批的人通过、未批的人被停用后重试：不能变成「审批中且零待办」', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({
        status: 'error',
        retryStep: 'dispatch',
        currentNodeKey: 'n2',
        visitedNodeKeys: ['br1', 'n2'],
        hasApproved: true,
      }),
    );
    taskRepo.find
      .mockResolvedValueOnce([
        // cancelDisabledPending 查到的本节点 pending：只有李四（已停用）
        { id: 8, instanceId: 1, nodeKey: 'n2', round: 1, assigneeId: 10, status: 'pending' },
      ])
      .mockResolvedValueOnce([
        // 重试前本节点全部待办：张三已通过、李四刚被停用取消
        { id: 7, instanceId: 1, nodeKey: 'n2', round: 1, assigneeId: 9, status: 'done' },
        { id: 8, instanceId: 1, nodeKey: 'n2', round: 1, assigneeId: 10, status: 'cancelled' },
      ]);
    userRepo.find.mockResolvedValue([{ id: 10, status: 'disabled' }]);
    // 重新解析只剩张三（启用），而张三已经批过了
    approver.resolve.mockResolvedValue({ userIds: [9] });
    await engine.retry({ instanceId: 1 });
    // 翻成「审批中」之后必须真的有待办；零待办的单据既撤回不了也重试不了
    const flippedToRunning = instanceRepo.update.mock.calls.some(
      ([, patch]) => (patch as Record<string, unknown>).status === 'running',
    );
    const pendingDispatched =
      taskRepo.insert.mock.calls.length > 0 ||
      taskRepo.update.mock.calls.some(
        ([where, patch]) =>
          (patch as Record<string, unknown>).status === 'pending' &&
          (where as Record<string, unknown>).status === 'cancelled',
      );
    expect(flippedToRunning && !pendingDispatched).toBe(false);
    expect(store.setWorkflowMeta).not.toHaveBeenCalledWith(
      12,
      recordId,
      expect.objectContaining({ workflowStatus: 'running' }),
    );
    // 正确行为：保持异常并写清原因（这一轮解析出的审批人都已通过），恢复账号后再重试
    expect(instanceRepo.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 1, status: 'error' }),
      expect.objectContaining({
        retryStep: 'dispatch',
        errorReason: expect.stringContaining('都已通过'),
      }),
    );
  });

  it('【建议修4】或签两人并发通过：先通过的人写库失败，重试补写的必须是他改的内容', async () => {
    // 用一行可变状态模拟真实库：update 真正落库、findOne 读回，不做任何事后矫正
    const row = runningInstance() as Record<string, unknown>;
    instanceRepo.findOne.mockImplementation(async () => ({ ...row }));
    instanceRepo.update.mockImplementation(async (_where, patch) => {
      Object.assign(row, patch);
      return { affected: 1 };
    });
    const zhangTask = {
      id: 1,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 21,
      status: 'pending',
      round: 1,
    };
    taskRepo.findOne.mockResolvedValueOnce(zhangTask);
    persist.persist.mockImplementationOnce(async () => {
      // 李四的通过恰好落在张三「已抢占、写库尚未失败」的窗口里，或签一人通过流程即推进
      taskRepo.findOne.mockResolvedValueOnce({ ...zhangTask, id: 2, assigneeId: 22 });
      await engine.completeTask({
        taskId: 2,
        actorId: 22,
        action: 'approve',
        comment: '',
        dataPatch: { field_reason: '李四改的' },
      });
      throw new Error('写库失败');
    });
    await expect(
      engine.completeTask({
        taskId: 1,
        actorId: 21,
        action: 'approve',
        comment: '',
        dataPatch: { field_reason: '张三改的' },
      }),
    ).rejects.toThrow('写库失败');

    // 失败方要把槽位占回来：库里留着的补丁必须是张三的内容（不能被李四清掉）
    expect(row.retryPatch).toEqual({ field_reason: '张三改的' });
    await engine.retry({ instanceId: 1 });
    expect(persist.persist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorId: 21,
        data: expect.objectContaining({ field_reason: '张三改的' }),
      }),
    );
  });

  it('【建议修5】删除异常单后实例应一并清理，否则重试会给已删数据派待办', async () => {
    instanceRepo.findOne.mockResolvedValue(
      runningInstance({ status: 'error', currentNodeKey: 'n1' }),
    );
    await engine.onRecordDeleted(12, recordId);
    expect(taskRepo.delete).toHaveBeenCalledWith({ instanceId: 1 });
    expect(instanceRepo.delete).toHaveBeenCalledWith({ id: 1 });
  });
});

describe('评审问题复现：workflow.render 跨应用取数', () => {
  let service: WorkflowRenderService;
  const instanceRepo = { findOne: jest.fn() };
  const taskRepo = { find: jest.fn(), findOne: jest.fn() };
  const formRepo = { findOne: jest.fn() };
  const store = { findById: jest.fn(), query: jest.fn() };

  const instance = {
    id: 1,
    initiatorId: 5,
    status: 'running',
    appId: 8,
    formId: 12,
    recordId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    currentNodeKey: 'n1',
    graph: {
      nodes: [{ key: 'n1', type: 'approve', fieldAccess: {} }],
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    instanceRepo.findOne.mockResolvedValue(instance);
    taskRepo.find.mockResolvedValue([
      { id: 3, assigneeId: 21, status: 'pending', nodeKey: 'n1' },
    ]);
    formRepo.findOne.mockImplementation(async ({ where }: { where: { id: number } }) => {
      if (where.id === 12) {
        return {
          id: 12,
          applicationId: 8,
          formKind: 'workflow',
          fields: [
            {
              key: 'field_device',
              type: 'data',
              sourceFormId: 20,
              linkage: {
                sourceFormId: 20,
                sourceKey: 'name',
                fieldMappings: [{ from: 'name', to: 'field_reason' }],
              },
            },
            { key: 'field_reason', type: 'input' },
          ],
        };
      }
      // 源表 20 属于另一个应用（applicationId 77）
      return {
        id: 20,
        applicationId: 77,
        formKind: 'workflow',
        fields: [{ key: 'name', type: 'input' }],
      };
    });
    store.query.mockResolvedValue({
      items: [{ data: { name: '设备A' }, workflowStatus: 'approved' }],
      total: 1,
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

  it('【建议修6】字段指向其他应用的表时，取数接口应拒绝而不是读出对方记录', async () => {
    await expect(
      service.sourceRecords(1, 21, { fieldKey: 'field_device', page: 1, pageSize: 20 }),
    ).rejects.toThrow();
    expect(store.query).not.toHaveBeenCalled();
  });

  it('【建议修6】联动接口同样不能跨应用带出源表数据', async () => {
    await expect(
      service.linkage(1, 21, { fieldKey: 'field_device', conditions: [] }),
    ).rejects.toThrow();
    expect(store.query).not.toHaveBeenCalled();
  });
});
