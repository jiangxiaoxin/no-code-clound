import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like } from 'typeorm';
import { Application } from '../application.entity';
import { DictionaryItem } from './dictionary-item.entity';
import { Dictionary } from './dictionary.entity';
import { DictionaryService } from './dictionary.service';

describe('DictionaryService', () => {
  let service: DictionaryService;
  const appRepo = {
    findOne: jest.fn(),
  };
  const dictRepo = {
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const itemRepo = {
    find: jest.fn(),
    count: jest.fn(),
  };
  const manager = {
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) =>
      fn(manager),
    ),
  };

  const ownedApp = {
    id: 8,
    name: '进销存',
    icon: '#E8A317',
    ownerId: 1,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.transaction.mockImplementation(
      async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager),
    );
    manager.create.mockImplementation((_entity: unknown, value: unknown) => value);
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) => {
      if (Array.isArray(value)) {
        return value.map((item, index) => ({ id: 10 + index, ...item }));
      }
      const row = value as { id?: number };
      return {
        id: row.id ?? 1,
        status: 'active',
        description: '',
        ...row,
      };
    });
    const module = await Test.createTestingModule({
      providers: [
        DictionaryService,
        { provide: getRepositoryToken(Application), useValue: appRepo },
        { provide: getRepositoryToken(Dictionary), useValue: dictRepo },
        { provide: getRepositoryToken(DictionaryItem), useValue: itemRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(DictionaryService);
  });

  describe('create', () => {
    it('rejects create when app is not owned', async () => {
      appRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(1, 8, {
          name: '请假类型',
          code: 'leave_type',
          items: [],
        }),
      ).rejects.toMatchObject({ message: '应用不存在' });
      expect(dictRepo.save).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects invalid codes', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      await expect(
        service.create(1, 8, {
          name: '请假类型',
          code: 'LeaveType',
          items: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate name in the same app', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue({ id: 3, name: '请假类型' });
      await expect(
        service.create(1, 8, {
          name: '请假类型',
          code: 'leave_type',
          items: [],
        }),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        message: '同一应用内字典名称已存在',
      });
    });

    it('rejects duplicate code in the same app', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 3, code: 'leave_type' });
      await expect(
        service.create(1, 8, {
          name: '请假类型',
          code: 'leave_type',
          items: [],
        }),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        message: '同一应用内字典编码已存在',
      });
    });

    it('allows the same code in another application', async () => {
      appRepo.findOne.mockResolvedValue({ id: 9, ownerId: 1 });
      dictRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(1, 9, {
          name: '请假类型',
          code: 'leave_type',
          items: [],
        }),
      ).resolves.toMatchObject({ applicationId: 9, code: 'leave_type' });

      expect(dictRepo.findOne).toHaveBeenCalledWith({
        where: { applicationId: 9, name: '请假类型' },
      });
    });

    it('rejects duplicate item values in the same request', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(1, 8, {
          name: '请假类型',
          code: 'leave_type',
          items: [
            { label: '年假', value: 'annual' },
            { label: '调休', value: 'annual' },
          ],
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: '同一请求里选项值不能重复',
      });
    });

    it('saves dictionary then items in a transaction and returns counts', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue(null);

      const result = await service.create(1, 8, {
        name: '请假类型',
        code: 'leave_type',
        description: '假期',
        items: [{ label: '年假', value: 'annual', sortOrder: 1 }],
      });

      expect(manager.save).toHaveBeenCalled();
      const firstSave = manager.save.mock.calls[0];
      expect(firstSave[0]).toBe(Dictionary);
      expect(firstSave[1]).toMatchObject({
        applicationId: 8,
        name: '请假类型',
        code: 'leave_type',
      });
      const secondSave = manager.save.mock.calls[1];
      expect(secondSave[0]).toBe(DictionaryItem);
      expect(result).toMatchObject({
        applicationId: 8,
        name: '请假类型',
        code: 'leave_type',
        itemCount: 1,
        items: [expect.objectContaining({ label: '年假', value: 'annual' })],
      });
    });
  });

  describe('list', () => {
    it('filters by application, keyword, status and includes itemCount', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findAndCount.mockResolvedValue([
        [
          {
            id: 1,
            applicationId: 8,
            name: '请假类型',
            code: 'leave_type',
            description: '',
            status: 'active',
          },
        ],
        1,
      ]);
      itemRepo.count.mockResolvedValue(3);

      const result = await service.list(1, 8, {
        keyword: '请假',
        status: 'active',
        page: 2,
        pageSize: 10,
      });

      expect(dictRepo.findAndCount).toHaveBeenCalledWith({
        where: [
          {
            applicationId: 8,
            name: Like('%请假%'),
            status: 'active',
          },
          {
            applicationId: 8,
            code: Like('%请假%'),
            status: 'active',
          },
        ],
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });
      expect(itemRepo.count).toHaveBeenCalledWith({
        where: { dictionaryId: 1 },
      });
      expect(result).toEqual({
        items: [
          {
            id: 1,
            applicationId: 8,
            name: '请假类型',
            code: 'leave_type',
            description: '',
            status: 'active',
            itemCount: 3,
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      });
    });

    it('defaults to page 1 and pageSize 10', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.list(1, 8, {});

      expect(dictRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result).toMatchObject({ items: [], total: 0, page: 1, pageSize: 10 });
    });
  });

  describe('getOne', () => {
    it('returns all items including disabled', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue({
        id: 4,
        applicationId: 8,
        name: '请假类型',
        code: 'leave_type',
        description: '',
        status: 'active',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 7,
          label: '年假',
          value: 'annual',
          sortOrder: 0,
          status: 'active',
        },
        {
          id: 8,
          label: '旧项',
          value: 'old',
          sortOrder: 1,
          status: 'disabled',
        },
      ]);

      const result = await service.getOne(1, 8, 4);

      expect(itemRepo.find).toHaveBeenCalledWith({
        where: { dictionaryId: 4 },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      expect(result.items).toHaveLength(2);
      expect(result.itemCount).toBe(2);
    });

    it('rejects dictionaries that belong to another app', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue(null);
      await expect(service.getOne(1, 8, 99)).rejects.toMatchObject({
        constructor: NotFoundException,
        message: '字典不存在',
      });
    });
  });

  describe('update', () => {
    const existing = {
      id: 4,
      applicationId: 8,
      name: '请假类型',
      code: 'leave_type',
      description: '',
      status: 'active' as const,
    };

    it('does not change code even if a code field is present on the dto object', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      itemRepo.find.mockResolvedValue([]);

      await service.update(1, 8, 4, {
        name: '假期类型',
        code: 'changed',
      } as { name: string; code: string });

      const savedDict = manager.save.mock.calls.find(
        (call) => call[0] === Dictionary,
      )?.[1] as { code?: string };
      expect(savedDict.code).toBe('leave_type');
    });

    it('rejects renaming onto an existing name', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 9, name: '加班类型' });
      await expect(
        service.update(1, 8, 4, { name: '加班类型' }),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        message: '同一应用内字典名称已存在',
      });
    });

    it('replaces items when items is provided', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue(existing);
      itemRepo.find.mockResolvedValue([]);

      await service.update(1, 8, 4, {
        items: [{ label: '年假', value: 'annual' }],
      });

      expect(manager.delete).toHaveBeenCalledWith(DictionaryItem, {
        dictionaryId: 4,
      });
      expect(manager.save.mock.calls.some((call) => call[0] === DictionaryItem)).toBe(
        true,
      );
    });

    it('does not delete items when items is omitted', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue(existing);
      itemRepo.find.mockResolvedValue([]);

      await service.update(1, 8, 4, { description: '说明' });

      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('rejects missing dictionaries', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue(null);
      await expect(service.delete(1, 8, 4)).rejects.toMatchObject({
        constructor: NotFoundException,
        message: '字典不存在',
      });
    });

    it('deletes items then the dictionary without occupancy checks', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.findOne.mockResolvedValue({
        id: 4,
        applicationId: 8,
        name: '请假类型',
        code: 'leave_type',
      });

      await expect(service.delete(1, 8, 4)).resolves.toBeUndefined();
      expect(manager.delete).toHaveBeenCalledWith(DictionaryItem, {
        dictionaryId: 4,
      });
      expect(manager.delete).toHaveBeenCalledWith(Dictionary, { id: 4 });
    });
  });

  describe('options', () => {
    it('returns only enabled dictionaries of this app by name', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.find.mockResolvedValue([
        { id: 2, name: '请假类型', code: 'leave_type' },
        { id: 1, name: '加班类型', code: 'ot_type' },
      ]);

      await expect(service.options(1, 8)).resolves.toEqual([
        { id: 2, name: '请假类型', code: 'leave_type' },
        { id: 1, name: '加班类型', code: 'ot_type' },
      ]);

      expect(dictRepo.find).toHaveBeenCalledWith({
        where: { applicationId: 8, status: 'active' },
        order: { name: 'ASC' },
      });
    });

    it('rejects when app is not owned', async () => {
      appRepo.findOne.mockResolvedValue(null);
      await expect(service.options(1, 8)).rejects.toMatchObject({
        message: '应用不存在',
      });
    });
  });

  describe('listEnabledItemsByCode', () => {
    it('returns empty when dictionary is missing', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.find.mockResolvedValue([]);
      await expect(
        service.listEnabledItemsByCode(1, 8, 'leave_type'),
      ).resolves.toEqual([]);
    });

    it('returns enabled items even if dictionary is disabled', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.find.mockResolvedValue([
        {
          id: 4,
          applicationId: 8,
          code: 'leave_type',
          status: 'disabled',
        },
      ]);
      itemRepo.find.mockResolvedValue([
        { dictionaryId: 4, label: '年假', value: 'annual' },
      ]);

      await expect(
        service.listEnabledItemsByCode(1, 8, 'leave_type'),
      ).resolves.toEqual([{ label: '年假', value: 'annual' }]);
    });
  });

  describe('listEnabledItemsByCodes', () => {
    it('returns items aligned to unique codes', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      dictRepo.find.mockResolvedValue([
        { id: 4, code: 'leave_type', status: 'disabled' },
        { id: 5, code: 'ot_type', status: 'active' },
      ]);
      itemRepo.find.mockResolvedValue([
        { dictionaryId: 4, label: '年假', value: 'annual' },
        { dictionaryId: 5, label: '工作日', value: 'workday' },
      ]);

      await expect(
        service.listEnabledItemsByCodes(1, 8, [
          'leave_type',
          'missing',
          'leave_type',
          'ot_type',
        ]),
      ).resolves.toEqual([
        { code: 'leave_type', items: [{ label: '年假', value: 'annual' }] },
        { code: 'missing', items: [] },
        { code: 'ot_type', items: [{ label: '工作日', value: 'workday' }] },
      ]);

      expect(dictRepo.find).toHaveBeenCalledWith({
        where: { applicationId: 8, code: In(['leave_type', 'missing', 'ot_type']) },
      });
    });

    it('returns empty for empty codes', async () => {
      appRepo.findOne.mockResolvedValue(ownedApp);
      await expect(service.listEnabledItemsByCodes(1, 8, [])).resolves.toEqual(
        [],
      );
      expect(dictRepo.find).not.toHaveBeenCalled();
    });
  });
});
