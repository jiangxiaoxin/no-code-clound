import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { AppForm } from '../app-form.entity';
import { Application } from '../application.entity';
import { FormRecordService } from './form-record.service';
import { FormRecordStore } from './form-record.store';

describe('FormRecordService', () => {
  let service: FormRecordService;
  const appRepo = { findOne: jest.fn() };
  const formRepo = { findOne: jest.fn() };
  const store = {
    insert: jest.fn(),
    findById: jest.fn(),
    replaceData: jest.fn(),
    deleteById: jest.fn(),
    query: jest.fn(),
    existsByDataValue: jest.fn(),
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
    updatedAt: now,
    data: { name: '张三' },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FormRecordService,
        { provide: getRepositoryToken(Application), useValue: appRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: FormRecordStore, useValue: store },
      ],
    }).compile();
    service = module.get(FormRecordService);
  });

  it('throws when app is missing', async () => {
    appRepo.findOne.mockResolvedValue(null);
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
    appRepo.findOne.mockResolvedValue(ownedApp);
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
    appRepo.findOne.mockResolvedValue(ownedApp);
    formRepo.findOne.mockResolvedValue(form);
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue(doc);

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
    expect(result).toEqual({
      id: '64b64c4c4c4c4c4c4c4c4c4c',
      appId: 8,
      formId: 12,
      createdBy: 1,
      createdAt: now,
      updatedAt: now,
      data: { name: '张三' },
    });
    expect(result).not.toHaveProperty('_id');
  });

  it('rejects create when a unique input value already exists', async () => {
    appRepo.findOne.mockResolvedValue(ownedApp);
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
    appRepo.findOne.mockResolvedValue(ownedApp);
    formRepo.findOne.mockResolvedValue({
      ...form,
      fields: [{ key: 'name', type: 'input', title: '姓名', unique: true }],
    });
    store.findById.mockResolvedValue(doc);
    store.existsByDataValue.mockResolvedValue(false);
    store.replaceData.mockResolvedValue({ ...doc, data: { name: '张三' } });

    await service.update(1, 8, 12, doc._id.toHexString(), { name: '张三' });

    expect(store.existsByDataValue).toHaveBeenCalledWith(
      12,
      'name',
      '张三',
      doc._id.toHexString(),
    );
  });

  it('throws when record id is missing', async () => {
    appRepo.findOne.mockResolvedValue(ownedApp);
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
});
