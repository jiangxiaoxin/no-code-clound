import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppAccessService } from '../access/app-access.service';
import { AppForm } from '../app-form.entity';
import { FormRecordPersistService } from '../form-record/form-record.persist';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowInstanceService } from './workflow-instance.service';
import { WorkflowTask } from './workflow-task.entity';

const recordId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('WorkflowInstanceService', () => {
  let service: WorkflowInstanceService;
  const instanceRepo = { findOne: jest.fn() };
  const taskRepo = { findOne: jest.fn() };
  const formRepo = { findOne: jest.fn(), findOneOrFail: jest.fn() };
  const persist = { persist: jest.fn() };
  const engine = {
    ensureDraft: jest.fn(),
    submit: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    completeTask: jest.fn(),
    transfer: jest.fn(),
    addSign: jest.fn(),
    returnTo: jest.fn(),
    resubmitStart: jest.fn(),
  };
  const access = {
    getAccess: jest.fn(),
    requireUse: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    formRepo.findOne.mockResolvedValue({
      id: 12,
      name: '请假单',
      fields: [],
    });
    formRepo.findOneOrFail.mockResolvedValue({
      id: 12,
      name: '请假单',
      fields: [],
    });
    engine.submit.mockResolvedValue({
      graph: { nodes: [{ key: 'n1', title: '部门审批' }] },
      currentNodeKey: 'n1',
    });
    engine.completeTask.mockResolvedValue({ waitingOthers: false });
    const module = await Test.createTestingModule({
      providers: [
        WorkflowInstanceService,
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(WorkflowTask), useValue: taskRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: FormRecordPersistService, useValue: persist },
        { provide: WorkflowEngine, useValue: engine },
        { provide: AppAccessService, useValue: access },
      ],
    }).compile();
    service = module.get(WorkflowInstanceService);
  });

  it('失权发起人仍能在首页再存草稿', async () => {
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      initiatorId: 5,
      status: 'rejected',
      formId: 12,
      recordId,
      appId: 8,
    });
    access.getAccess.mockResolvedValue({
      canUse: false,
      canConfigure: false,
      isOwner: false,
    });
    await service.saveDraft(1, 5, { field_reason: '改' });
    expect(persist.persist).toHaveBeenCalledWith(
      expect.objectContaining({ recordId, actorId: 5, requiredKeys: 'all' }),
    );
    expect(engine.ensureDraft).toHaveBeenCalled();
    expect(access.requireUse).not.toHaveBeenCalled();
  });

  it('非发起人调提交当单据不存在', async () => {
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      initiatorId: 5,
      status: 'rejected',
    });
    await expect(service.submit(1, 6, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('审批中不能再存草稿', async () => {
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      initiatorId: 5,
      status: 'running',
    });
    await expect(service.saveDraft(1, 5, {})).rejects.toThrow(
      '当前状态不能修改',
    );
  });

  it('审批人不能重试，配置者可以', async () => {
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      initiatorId: 5,
      status: 'error',
      appId: 8,
    });
    access.getAccess.mockResolvedValue({ canConfigure: false });
    await expect(service.retry(1, 21)).rejects.toBeInstanceOf(NotFoundException);
    access.getAccess.mockResolvedValue({ canConfigure: true });
    await service.retry(1, 3);
    expect(engine.retry).toHaveBeenCalledWith({ instanceId: 1 });
  });

  it('通过时丢掉不可编辑字段', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 3,
      instanceId: 1,
      nodeKey: 'n2',
      assigneeId: 9,
    });
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      graph: {
        nodes: [
          {
            key: 'n2',
            type: 'approve',
            title: '人事备案',
            fieldAccess: { field_reason: 'editable', field_days: 'readonly' },
            commentRequiredOnApprove: false,
          },
        ],
      },
    });
    await service.complete(3, 9, {
      action: 'approve',
      comment: '',
      data: { field_reason: 'a', field_days: 9 },
    });
    expect(engine.completeTask).toHaveBeenCalledWith(
      expect.objectContaining({ dataPatch: { field_reason: 'a' } }),
    );
  });

  it('节点未要求驳回意见时，空意见也能驳回', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 3,
      instanceId: 1,
      nodeKey: 'n1',
      assigneeId: 9,
    });
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      graph: {
        nodes: [
          {
            key: 'n1',
            type: 'approve',
            title: '部门审批',
            fieldAccess: {},
            commentRequiredOnApprove: false,
            commentRequiredOnReject: false,
          },
        ],
      },
    });
    await service.complete(3, 9, {
      action: 'reject',
      comment: '',
      data: {},
    });
    expect(engine.completeTask).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject', comment: '' }),
    );
  });

  it('转交交给引擎', async () => {
    await service.transfer(3, 21, { assigneeId: 9, comment: '代批' });
    expect(engine.transfer).toHaveBeenCalledWith({
      taskId: 3,
      actorId: 21,
      assigneeId: 9,
      comment: '代批',
    });
  });

  it('发起人提交先落库再推进', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 8,
      nodeKey: 'start',
      instanceId: 1,
      assigneeId: 5,
    });
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      initiatorId: 5,
      formId: 12,
      recordId,
    });
    engine.resubmitStart.mockResolvedValue({ nextNodeTitle: '部门审批' });
    await service.resubmit(8, 5, { field_reason: '改' });
    expect(persist.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId,
        actorId: 5,
        requiredKeys: 'all',
        data: { field_reason: '改' },
      }),
    );
    expect(engine.resubmitStart).toHaveBeenCalledWith({
      taskId: 8,
      actorId: 5,
    });
  });

  it('start 待办不能当审批通过', async () => {
    taskRepo.findOne.mockResolvedValue({
      id: 8,
      nodeKey: 'start',
      instanceId: 1,
    });
    instanceRepo.findOne.mockResolvedValue({
      id: 1,
      graph: { nodes: [{ key: 'start', type: 'start' }] },
    });
    await expect(
      service.complete(8, 5, { action: 'approve', comment: '' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
