import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Application } from '../application.entity';
import { AppForm } from '../app-form.entity';
import { Department } from '../../admin/department/department.entity';
import { DictionaryService } from '../dictionary/dictionary.service';
import { FormRecordStore } from '../form-record/form-record.store';
import { User } from '../../user/user.entity';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInboxService } from './workflow-inbox.service';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTask } from './workflow-task.entity';

describe('WorkflowInboxService', () => {
  let service: WorkflowInboxService;
  const taskRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const instanceRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const formRepo = { find: jest.fn(), findOne: jest.fn() };
  const appRepo = { find: jest.fn(), findOne: jest.fn() };
  const userRepo = { find: jest.fn() };
  const departmentRepo = { find: jest.fn() };
  const store = { findById: jest.fn() };
  const dictionary = { listEnabledItemsByApp: jest.fn() };
  const engine = { markStuckByDisabledApprovers: jest.fn() };

  function qb(result: { items: unknown[]; total: number }) {
    const chain: Record<string, jest.Mock> = {};
    const self = () => chain;
    chain.innerJoin = jest.fn(self);
    chain.where = jest.fn(self);
    chain.andWhere = jest.fn(self);
    chain.orderBy = jest.fn(self);
    chain.skip = jest.fn(self);
    chain.take = jest.fn(self);
    chain.getManyAndCount = jest.fn().mockResolvedValue([result.items, result.total]);
    chain.getCount = jest.fn().mockResolvedValue(result.total);
    return chain;
  }

  async function stubTodo(input: {
    fields: { key: string; type: string; title: string }[];
    data: Record<string, unknown>;
    node: Record<string, unknown>;
  }) {
    const task = {
      id: 3,
      instanceId: 1,
      assigneeId: 21,
      status: 'pending',
      nodeKey: 'n1',
      createdAt: new Date(),
    };
    taskRepo.createQueryBuilder.mockReturnValue(qb({ items: [task], total: 1 }));
    instanceRepo.find.mockResolvedValue([
      {
        id: 1,
        appId: 8,
        formId: 12,
        recordId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        initiatorId: 5,
        status: 'running',
        currentNodeKey: 'n1',
        graph: { nodes: [input.node] },
      },
    ]);
    formRepo.find.mockResolvedValue([{ id: 12, name: '请假单', fields: input.fields }]);
    appRepo.find.mockResolvedValue([{ id: 8, name: '人事' }]);
    userRepo.find.mockResolvedValue([{ id: 5, displayName: '张三' }]);
    store.findById.mockResolvedValue({ data: input.data });
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    taskRepo.createQueryBuilder.mockReturnValue(qb({ items: [], total: 0 }));
    instanceRepo.createQueryBuilder.mockReturnValue(qb({ items: [], total: 0 }));
    formRepo.find.mockResolvedValue([]);
    appRepo.find.mockResolvedValue([]);
    userRepo.find.mockResolvedValue([]);
    departmentRepo.find.mockResolvedValue([]);
    dictionary.listEnabledItemsByApp.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        WorkflowInboxService,
        { provide: getRepositoryToken(WorkflowTask), useValue: taskRepo },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: getRepositoryToken(Application), useValue: appRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: FormRecordStore, useValue: store },
        { provide: DictionaryService, useValue: dictionary },
        { provide: WorkflowEngine, useValue: engine },
      ],
    }).compile();
    service = module.get(WorkflowInboxService);
  });

  it('非应用成员仍能查到派给自己的待办', async () => {
    const task = {
      id: 3,
      instanceId: 1,
      assigneeId: 21,
      status: 'pending',
      nodeKey: 'n1',
      createdAt: new Date(),
    };
    taskRepo.createQueryBuilder.mockReturnValue(
      qb({ items: [task], total: 1 }),
    );
    instanceRepo.find.mockResolvedValue([
      {
        id: 1,
        appId: 8,
        formId: 12,
        recordId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        initiatorId: 5,
        status: 'running',
        currentNodeKey: 'n1',
        graph: { nodes: [{ key: 'n1', type: 'approve', title: '部门审批' }] },
      },
    ]);
    formRepo.find.mockResolvedValue([{ id: 12, name: '请假单', fields: [] }]);
    appRepo.find.mockResolvedValue([{ id: 8, name: '人事' }]);
    userRepo.find.mockResolvedValue([{ id: 5, displayName: '张三' }]);
    store.findById.mockResolvedValue({ data: { field_reason: '回家' } });

    const result = await service.query(21, { kind: 'todo', page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items[0].formName).toBe('请假单');
  });

  it('未配简报时卡片默认带出文本数字日期时间，不带下拉', async () => {
    await stubTodo({
      fields: [
        { key: 'field_reason', type: 'textarea', title: '事由' },
        { key: 'field_type', type: 'select', title: '请假类型' },
        { key: 'field_days', type: 'number', title: '天数' },
      ],
      data: { field_reason: '回家', field_type: '事假', field_days: 3 },
      node: { key: 'n1', type: 'approve', title: '部门审批' },
    });
    const result = await service.query(21, { kind: 'todo', page: 1, pageSize: 20 });
    expect(result.items[0].summary).toBe('事由：回家 / 天数：3');
  });

  it('勾了简报的字段才出现在卡片上', async () => {
    await stubTodo({
      fields: [
        { key: 'field_reason', type: 'textarea', title: '事由' },
        { key: 'field_type', type: 'select', title: '请假类型' },
      ],
      data: { field_reason: '回家', field_type: '事假' },
      node: {
        key: 'n1',
        type: 'approve',
        title: '部门审批',
        briefFieldKeys: ['field_type'],
      },
    });
    const result = await service.query(21, { kind: 'todo', page: 1, pageSize: 20 });
    expect(result.items[0].summary).toBe('请假类型：事假');
  });

  it('简报里人员单选和部门单选显示姓名、部门名', async () => {
    await stubTodo({
      fields: [
        { key: 'field_dept', type: 'dept', title: '部门单选' },
        { key: 'field_leader', type: 'member', title: '直接领导单选' },
      ],
      data: { field_dept: 4, field_leader: 4 },
      node: {
        key: 'n1',
        type: 'approve',
        title: '直接领导审批',
        briefFieldKeys: ['field_dept', 'field_leader'],
      },
    });
    userRepo.find.mockResolvedValue([
      { id: 5, displayName: '张三' },
      { id: 4, displayName: '李四' },
    ]);
    departmentRepo.find.mockResolvedValue([{ id: 4, name: '研发部' }]);

    const result = await service.query(21, { kind: 'todo', page: 1, pageSize: 20 });
    expect(result.items[0].summary).toBe('部门单选：研发部 / 直接领导单选：李四');
  });

  it('带 appId 不串出别的应用', async () => {
    const chain = qb({ items: [], total: 0 });
    taskRepo.createQueryBuilder.mockReturnValue(chain);
    await service.query(21, { kind: 'todo', appId: 8, page: 1, pageSize: 20 });
    expect(chain.andWhere).toHaveBeenCalledWith(
      'instance.appId = :appId',
      { appId: 8 },
    );
  });

  it('记录删除后 inbox 仍返回且 recordMissing', async () => {
    instanceRepo.createQueryBuilder.mockReturnValue(
      qb({
        items: [
          {
            id: 1,
            appId: 8,
            formId: 12,
            recordId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            initiatorId: 5,
            status: 'approved',
            currentNodeKey: null,
            graph: { nodes: [] },
            updatedAt: new Date(),
          },
        ],
        total: 1,
      }),
    );
    formRepo.find.mockResolvedValue([{ id: 12, name: '请假单', fields: [] }]);
    appRepo.find.mockResolvedValue([{ id: 8, name: '人事' }]);
    userRepo.find.mockResolvedValue([{ id: 5, displayName: '张三' }]);
    store.findById.mockResolvedValue(null);

    const result = await service.query(5, { kind: 'mine', page: 1, pageSize: 20 });
    expect(result.items[0].recordMissing).toBe(true);
    expect(result.items[0].summary).toBe('数据已删除');
  });

  it('mine 里已通过只读', async () => {
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      initiatorId: 5,
      status: 'approved',
      appId: 8,
      formId: 12,
      recordId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      graph: { nodes: [] },
      currentNodeKey: null,
      visitedNodeKeys: [],
      round: 1,
      errorReason: null,
      notes: [],
      hasApproved: true,
    });
    formRepo.findOne.mockResolvedValue({ id: 12, name: '请假单', fields: [] });
    store.findById.mockResolvedValue({ data: {} });
    taskRepo.find.mockResolvedValue([]);
    userRepo.find.mockResolvedValue([{ id: 5, displayName: '张三', status: 'active' }]);

    const detail = await service.open(5, 'mine', 1);
    expect(detail.actions.readOnly).toBe(true);
    expect(detail.actions.canSubmit).toBe(false);
  });

  it('非处理人打开 todo 为 404', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 3,
      assigneeId: 21,
      status: 'pending',
      instanceId: 1,
    });
    await expect(service.open(9, 'todo', 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
