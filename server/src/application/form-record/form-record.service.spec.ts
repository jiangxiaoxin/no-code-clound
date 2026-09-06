import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { AppAccessService } from '../access/app-access.service';
import { AppForm } from '../app-form.entity';
import { User } from '../../user/user.entity';
import { FormRecordPersistService } from './form-record.persist';
import { FormRecordService } from './form-record.service';
import { FormRecordStore } from './form-record.store';
import { DictionaryService } from '../dictionary/dictionary.service';
import { FormSerialSeqService } from './form-serial-seq.service';
import { WorkflowDefinitionService } from '../workflow/workflow-definition.service';
import { WorkflowEngine } from '../workflow/workflow.engine';
import { WorkflowInstance } from '../workflow/workflow-instance.entity';
import { WorkflowTask } from '../workflow/workflow-task.entity';

describe('FormRecordService', () => {
  let service: FormRecordService;
  const formRepo = { findOne: jest.fn() };
  const access = {
    requireUse: jest.fn(),
    requireConfigure: jest.fn(),
    requireOwner: jest.fn(),
    getAccess: jest.fn(),
  };
  const userRepo = { find: jest.fn() };
  const store = {
    insert: jest.fn(),
    findById: jest.fn(),
    replaceData: jest.fn(),
    deleteById: jest.fn(),
    query: jest.fn(),
    existsByDataValue: jest.fn(),
    setWorkflowMeta: jest.fn(),
  };
  const definition = { getRuntime: jest.fn() };
  const engine = {
    submit: jest.fn(),
    ensureDraft: jest.fn(),
    resubmitApproved: jest.fn(),
    onRecordDeleted: jest.fn(),
  };
  const instanceRepo = { findOne: jest.fn(), find: jest.fn() };
  const taskRepo = { find: jest.fn() };
  const dictionaryService = {
    listEnabledItemsByCodes: jest.fn(),
  };
  const serialSeq = {
    takeNext: jest.fn(),
  };
  const ownedApp = { id: 8, ownerId: 1 };
  const form = {
    id: 12,
    applicationId: 8,
    name: '客户',
    fields: [{ key: 'name', type: 'input' }],
  };
  const now = new Date('2026-08-24T03:00:00.000Z');
  const doc = {
    _id: new ObjectId('64b64c4c4c4c4c4c4c4c4c4c'),
    appId: 8,
    formId: 12,
    createdBy: 1,
    createdAt: now,
    updatedBy: 1,
    updatedAt: now,
    data: { name: '张三' },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    access.requireUse.mockResolvedValue(ownedApp);
    access.getAccess.mockResolvedValue({
      app: ownedApp,
      canUse: true,
      canConfigure: true,
      isOwner: true,
    });
    const module = await Test.createTestingModule({
      providers: [
        FormRecordService,
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: AppAccessService, useValue: access },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: FormRecordStore, useValue: store },
        { provide: DictionaryService, useValue: dictionaryService },
        { provide: FormSerialSeqService, useValue: serialSeq },
        FormRecordPersistService,
        { provide: WorkflowDefinitionService, useValue: definition },
        { provide: WorkflowEngine, useValue: engine },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(WorkflowTask), useValue: taskRepo },
      ],
    }).compile();
    service = module.get(FormRecordService);
    instanceRepo.find.mockResolvedValue([]);
    taskRepo.find.mockResolvedValue([]);
  });

  it('throws when app is missing', async () => {
    access.requireUse.mockRejectedValue(new NotFoundException('应用不存在'));
    try {
      await service.create(1, 8, 12, { name: '张三' });
      throw new Error('expected 404');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).message).toBe('应用不存在');
    }
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('throws when form is missing', async () => {
    formRepo.findOne.mockResolvedValue(null);
    try {
      await service.create(1, 8, 12, { name: '张三' });
      throw new Error('expected 404');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).message).toBe('表单不存在');
    }
  });

  it('creates a record view without _id', async () => {
    formRepo.findOne.mockResolvedValue(form);
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue(doc);
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    const result = await service.create(1, 8, 12, {
      name: '张三',
      extra: 'drop',
    });

    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 8,
        formId: 12,
        createdBy: 1,
        data: { name: '张三' },
      }),
    );
    const inserted = store.insert.mock.calls[0][0];
    expect(inserted.updatedAt).toBe(inserted.createdAt);
    expect(inserted.updatedBy).toBe(inserted.createdBy);
    expect(result).toEqual({
      id: '64b64c4c4c4c4c4c4c4c4c4c',
      appId: 8,
      formId: 12,
      createdBy: 1,
      createdByName: '李四',
      createdAt: now,
      updatedBy: 1,
      updatedByName: '李四',
      updatedAt: now,
      data: { name: '张三' },
      userNames: { '1': '李四' },
    });
    expect(result).not.toHaveProperty('_id');
  });

  it('创建人是当前登录人不是应用所有者', async () => {
    access.requireUse.mockResolvedValue({ id: 8, ownerId: 9 });
    formRepo.findOne.mockResolvedValue(form);
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue(doc);
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);
    await service.create(1, 8, 12, { name: '张三' });
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 1, updatedBy: 1 }),
    );
  });

  it('rejects create when a unique input value already exists', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [{ key: 'name', type: 'input', title: '姓名', unique: true }],
    });
    store.existsByDataValue.mockResolvedValue(true);

    await expect(service.create(1, 8, 12, { name: '张三' })).rejects.toEqual(
      expect.objectContaining({
        constructor: ConflictException,
        message: '[姓名]不允许重复值',
      }),
    );
    expect(store.existsByDataValue).toHaveBeenCalledWith(
      12,
      'name',
      '张三',
      undefined,
    );
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('allows update when unique value belongs to the same record', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [{ key: 'name', type: 'input', title: '姓名', unique: true }],
    });
    store.findById.mockResolvedValue(doc);
    store.existsByDataValue.mockResolvedValue(false);
    store.replaceData.mockResolvedValue({ ...doc, data: { name: '张三' } });
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    await service.update(1, 8, 12, doc._id.toHexString(), { name: '张三' });

    expect(store.replaceData).toHaveBeenCalledWith(
      12,
      doc._id.toHexString(),
      { name: '张三' },
      1,
    );

    expect(store.existsByDataValue).toHaveBeenCalledWith(
      12,
      'name',
      '张三',
      doc._id.toHexString(),
    );
  });

  it('rejects create when a unique number value already exists', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [{ key: 'code', type: 'number', title: '编号', unique: true }],
    });
    store.existsByDataValue.mockResolvedValue(true);

    await expect(service.create(1, 8, 12, { code: 100 })).rejects.toEqual(
      expect.objectContaining({
        constructor: ConflictException,
        message: '[编号]不允许重复值',
      }),
    );
    expect(store.existsByDataValue).toHaveBeenCalledWith(
      12,
      'code',
      100,
      undefined,
    );
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('checks unique number zero and skips empty number', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [{ key: 'code', type: 'number', title: '编号', unique: true }],
    });
    store.existsByDataValue.mockResolvedValue(false);
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue({ ...doc, data: { code: 0 } });
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    await service.create(1, 8, 12, { code: 0 });
    expect(store.existsByDataValue).toHaveBeenCalledWith(
      12,
      'code',
      0,
      undefined,
    );

    store.existsByDataValue.mockClear();
    store.insert.mockClear();
    store.findById.mockResolvedValue({ ...doc, data: {} });
    await service.create(1, 8, 12, {});
    expect(store.existsByDataValue).not.toHaveBeenCalled();
    expect(store.insert).toHaveBeenCalled();
  });

  it('rejects create when unique subform number already exists', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [
        {
          key: 'lines',
          type: 'subform',
          title: '明细',
          fields: [
            { key: 'qty', type: 'number', title: '数量', unique: true },
          ],
        },
      ],
    });
    store.existsByDataValue.mockResolvedValue(true);

    await expect(
      service.create(1, 8, 12, { lines: [{ qty: 0 }] }),
    ).rejects.toEqual(
      expect.objectContaining({
        constructor: ConflictException,
        message: '[数量]不允许重复值',
      }),
    );
    expect(store.existsByDataValue).toHaveBeenCalledWith(
      12,
      'lines.qty',
      0,
      undefined,
    );
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('getOne 给只有使用权的人 canConfigure=false', async () => {
    access.getAccess.mockResolvedValue({
      app: ownedApp,
      canUse: true,
      canConfigure: false,
      isOwner: false,
    });
    formRepo.findOne.mockResolvedValue(form);
    store.findById.mockResolvedValue(doc);
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    const result = await service.getOne(
      2,
      8,
      12,
      '64b64c4c4c4c4c4c4c4c4c4c',
    );

    expect(result.canConfigure).toBe(false);
    expect(result.id).toBe('64b64c4c4c4c4c4c4c4c4c4c');
  });

  it('getOne 给所有者 canConfigure=true', async () => {
    formRepo.findOne.mockResolvedValue(form);
    store.findById.mockResolvedValue(doc);
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    const result = await service.getOne(
      1,
      8,
      12,
      '64b64c4c4c4c4c4c4c4c4c',
    );

    expect(result.canConfigure).toBe(true);
  });

  it('throws when record id is missing', async () => {
    formRepo.findOne.mockResolvedValue(form);
    store.findById.mockResolvedValue(null);
    try {
      await service.getOne(1, 8, 12, 'not-an-id');
      throw new Error('expected 404');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).message).toBe('记录不存在');
    }
  });

  it('rewrites dictionary labels before querying records', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [{ key: 'status', type: 'radio', dictCode: '11' }],
    });
    dictionaryService.listEnabledItemsByCodes.mockResolvedValue([
      { code: '11', items: [{ label: '启用', value: '1' }] },
    ]);
    store.query.mockResolvedValue({ items: [], total: 0 });
    userRepo.find.mockResolvedValue([]);

    await service.query(1, 8, 12, {
      filters: [{ key: 'status', op: 'eq', value: '启用' }],
    });

    expect(dictionaryService.listEnabledItemsByCodes).toHaveBeenCalledWith(
      1,
      8,
      ['11'],
    );
    expect(store.query).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        filter: { 'data.status': '1' },
      }),
    );
  });

  it('generates serial number on create and ignores client value', async () => {
    serialSeq.takeNext.mockResolvedValue(1);
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [
        { key: 'name', type: 'input' },
        {
          key: 'sn',
          type: 'serialNumber',
          serialSeparator: '-',
          serialRule: [
            { kind: 'datetime', format: 'YYYYMMDD' },
            { kind: 'counter', start: 1, digits: 5 },
          ],
        },
      ],
    });
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue({
      ...doc,
      data: { name: '张三', sn: 'generated' },
    });
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    await service.create(1, 8, 12, { name: '张三', sn: 'hack' });

    expect(serialSeq.takeNext).toHaveBeenCalled();
    const inserted = store.insert.mock.calls[0][0];
    expect(inserted.data.name).toBe('张三');
    expect(inserted.data.sn).toMatch(/^\d{8}-00001$/);
    expect(inserted.data.sn).not.toBe('hack');
  });

  it('does not call takeNext when serial has no counter', async () => {
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [
        {
          key: 'sn',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'epochMs' }],
        },
      ],
    });
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue({ ...doc, data: { sn: '1' } });
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);

    await service.create(1, 8, 12, {});
    expect(serialSeq.takeNext).not.toHaveBeenCalled();
    expect(String(store.insert.mock.calls[0][0].data.sn)).toMatch(/^\d+$/);
  });

  it('未发布流程的流程表单一条数据都不写', async () => {
    formRepo.findOne.mockResolvedValue({ ...form, formKind: 'workflow' });
    definition.getRuntime.mockResolvedValue({
      published: false,
      enabled: false,
      graph: null,
      version: 0,
    });
    await expect(
      service.create(1, 8, 12, { name: 'x' }, 'draft'),
    ).rejects.toThrow('这张表单还没有配置流程');
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('关掉启用后保存直接记为已通过且不建实例', async () => {
    formRepo.findOne.mockResolvedValue({ ...form, formKind: 'workflow' });
    definition.getRuntime.mockResolvedValue({
      published: true,
      enabled: false,
      graph: {},
      version: 2,
    });
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue({ ...doc, workflowStatus: 'approved' });
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);
    await service.create(1, 8, 12, { name: 'x' });
    expect(store.setWorkflowMeta).toHaveBeenCalledWith(12, doc._id.toHexString(), {
      workflowStatus: 'approved',
    });
    expect(engine.submit).not.toHaveBeenCalled();
  });

  it('已通过只有实例发起人能再提交', async () => {
    formRepo.findOne.mockResolvedValue({ ...form, formKind: 'workflow' });
    definition.getRuntime.mockResolvedValue({
      published: true,
      enabled: true,
      graph: {},
      version: 1,
    });
    store.findById.mockResolvedValue({
      ...doc,
      createdBy: 1,
      workflowStatus: 'approved',
      workflowInstanceId: 7,
    });
    instanceRepo.findOne.mockResolvedValue({ id: 7, initiatorId: 2 });
    await expect(
      service.update(1, 8, 12, doc._id.toHexString(), { name: 'y' }, 'submit'),
    ).rejects.toThrow('只有发起人能修改这条数据');
  });

  it('普通表单带 intent 仍当普通保存', async () => {
    formRepo.findOne.mockResolvedValue(form);
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue(doc);
    userRepo.find.mockResolvedValue([{ id: 1, displayName: '李四' }]);
    await service.create(1, 8, 12, { name: 'x' }, 'submit');
    expect(store.setWorkflowMeta).not.toHaveBeenCalled();
    expect(engine.submit).not.toHaveBeenCalled();
  });

  it('审批中不能删除，草稿删除后引擎清实例', async () => {
    formRepo.findOne.mockResolvedValue({ ...form, formKind: 'workflow' });
    store.findById.mockResolvedValue({ ...doc, workflowStatus: 'running' });
    await expect(
      service.remove(1, 8, 12, doc._id.toHexString()),
    ).rejects.toThrow('审批中的数据不能删除');
    expect(store.deleteById).not.toHaveBeenCalled();

    store.findById.mockResolvedValue({
      ...doc,
      workflowStatus: 'draft',
      workflowInstanceId: 3,
    });
    instanceRepo.findOne.mockResolvedValue({ id: 3, initiatorId: 1 });
    store.deleteById.mockResolvedValue(true);
    await service.remove(1, 8, 12, doc._id.toHexString());
    expect(engine.onRecordDeleted).toHaveBeenCalledWith(
      12,
      doc._id.toHexString(),
    );
  });
});
