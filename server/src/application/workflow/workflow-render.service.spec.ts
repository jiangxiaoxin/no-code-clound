import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppForm } from '../app-form.entity';
import { FormRecordStore } from '../form-record/form-record.store';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowRenderService } from './workflow-render.service';
import { WorkflowTask } from './workflow-task.entity';

describe('WorkflowRenderService', () => {
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
      nodes: [
        {
          key: 'n1',
          type: 'approve',
          fieldAccess: { field_reason: 'editable', field_days: 'readonly' },
        },
      ],
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
          formKind: 'workflow',
          fields: [
            {
              key: 'field_device',
              type: 'data',
              sourceFormId: 20,
              linkage: {
                sourceFormId: 20,
                sourceKey: 'name',
                fieldMappings: [
                  { from: 'name', to: 'field_reason' },
                  { from: 'days', to: 'field_days' },
                ],
              },
            },
            { key: 'field_reason', type: 'input' },
            { key: 'field_days', type: 'number' },
            { key: 'field_file', type: 'file' },
          ],
        };
      }
      return { id: 20, formKind: 'workflow', fields: [{ key: 'name', type: 'input' }] };
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

  it('没有使用权的审批人能查出源表已通过记录且不含 running', async () => {
    const result = await service.sourceRecords(1, 21, {
      fieldKey: 'field_device',
      page: 1,
      pageSize: 20,
    });
    expect(store.query).toHaveBeenCalledWith(
      20,
      expect.objectContaining({
        filter: expect.objectContaining({ workflowStatus: 'approved' }),
      }),
    );
    expect(result.items).toHaveLength(1);
  });

  it('发起人在审批中不能上传', async () => {
    await expect(
      service.assertWritable(1, 5, 'field_file'),
    ).rejects.toThrow('当前状态不能修改');
  });

  it('联动结果只保留可编辑目标', async () => {
    store.query.mockResolvedValue({
      items: [{ data: { name: '改', days: 3 } }],
      total: 1,
    });
    const result = await service.linkage(1, 21, {
      fieldKey: 'field_device',
      conditions: [],
    });
    expect(result.data).toEqual({ field_reason: '改' });
    expect(result.data).not.toHaveProperty('field_days');
  });

  it('done 处理人能读源记录但不能上传', async () => {
    instanceRepo.findOne.mockResolvedValue({ ...instance, status: 'approved' });
    taskRepo.find.mockResolvedValue([
      { id: 3, assigneeId: 21, status: 'done', nodeKey: 'n1' },
    ]);
    await expect(
      service.sourceRecords(1, 21, { fieldKey: 'field_device', page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(service.assertWritable(1, 21, 'field_file')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('无关人打开 render 为 404', async () => {
    taskRepo.find.mockResolvedValue([]);
    await expect(
      service.sourceRecords(1, 99, { fieldKey: 'field_device' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
