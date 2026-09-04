import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppForm } from './app-form.entity';
import { AppFormConfig } from './app-form-config.entity';
import { AppGroup } from './app-group.entity';
import { Application } from './application.entity';
import { ApplicationService } from './application.service';
import { Dictionary } from './dictionary/dictionary.entity';
import { DictionaryItem } from './dictionary/dictionary-item.entity';
import { FormRecordStore } from './form-record/form-record.store';
import { FormSerialSeq } from './form-record/form-serial-seq.entity';

describe('ApplicationService', () => {
  let service: ApplicationService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const groupRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
  };
  const formRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };
  const formConfigRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const dictRepo = {
    find: jest.fn(),
    delete: jest.fn(),
  };
  const itemRepo = {
    delete: jest.fn(),
  };
  const serialSeqRepo = {
    delete: jest.fn(),
  };

  const formRecordStore = {
    dropFormCollection: jest.fn(),
    dropAppCollections: jest.fn(),
    syncIndexes: jest.fn(),
  };

  const ownedApp = {
    id: 8,
    name: '进销存',
    icon: '#E8A317',
    ownerId: 1,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ApplicationService,
        { provide: getRepositoryToken(Application), useValue: repo },
        { provide: getRepositoryToken(AppGroup), useValue: groupRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: getRepositoryToken(AppFormConfig), useValue: formConfigRepo },
        { provide: getRepositoryToken(Dictionary), useValue: dictRepo },
        { provide: getRepositoryToken(DictionaryItem), useValue: itemRepo },
        { provide: getRepositoryToken(FormSerialSeq), useValue: serialSeqRepo },
        { provide: FormRecordStore, useValue: formRecordStore },
      ],
    }).compile();
    service = module.get(ApplicationService);
  });

  describe('list', () => {
    it('returns current owner apps newest first without extra fields', async () => {
      repo.find.mockResolvedValue([
        {
          id: 2,
          name: '仓库',
          icon: '#2F6BFF',
          ownerId: 1,
          createdAt: new Date('2026-08-19T04:00:00.000Z'),
        },
        {
          id: 1,
          name: '进销存',
          icon: '#E8A317',
          ownerId: 1,
          createdAt: new Date('2026-08-19T03:00:00.000Z'),
        },
      ]);

      const result = await service.list(1);

      expect(repo.find).toHaveBeenCalledWith({
        where: { ownerId: 1 },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([
        { id: 2, name: '仓库', icon: '#2F6BFF' },
        { id: 1, name: '进销存', icon: '#E8A317' },
      ]);
    });
  });

  describe('create', () => {
    it('saves trimmed name with icon and returns id+name+icon', async () => {
      repo.create.mockImplementation((x: Partial<Application>) => x);
      repo.save.mockImplementation(async (u: Partial<Application>) => ({
        id: 3,
        ...u,
      }));

      const result = await service.create(1, { name: '  我的应用  ' });

      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0] as {
        name: string;
        icon: string;
        ownerId: number;
      };
      expect(saved.name).toBe('我的应用');
      expect(saved.ownerId).toBe(1);
      expect(saved.icon).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(result).toEqual({
        id: 3,
        name: '我的应用',
        icon: saved.icon,
      });
    });

    it('throws when name is empty after trim', async () => {
      await expect(service.create(1, { name: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('returns id+name+icon for owner', async () => {
      repo.findOne.mockResolvedValue(ownedApp);

      await expect(service.getOne(1, 8)).resolves.toEqual({
        id: 8,
        name: '进销存',
        icon: '#E8A317',
      });
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 8, ownerId: 1 },
      });
    });

    it('throws 404 when missing or not owner', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.getOne(1, 8)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      try {
        await service.getOne(1, 8);
      } catch (e) {
        expect((e as NotFoundException).message).toBe('应用不存在');
      }
    });
  });

  describe('renameApp', () => {
    it('updates name', async () => {
      repo.findOne.mockResolvedValue({ ...ownedApp, name: '旧名' });
      repo.save.mockImplementation(async (row: Application) => row);

      await expect(
        service.renameApp(1, 8, { name: ' 新名 ' }),
      ).resolves.toEqual({
        id: 8,
        name: '新名',
        icon: ownedApp.icon,
      });
    });

    it('throws 404 when missing or not owner', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.renameApp(1, 8, { name: '新名' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteApp', () => {
    it('removes mysql rows and mongo collections for the app', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([
        { id: 10, applicationId: 8 },
        { id: 11, applicationId: 8 },
      ]);
      dictRepo.find.mockResolvedValue([{ id: 3, applicationId: 8 }]);

      await service.deleteApp(1, 8);

      expect(formRecordStore.dropAppCollections).toHaveBeenCalledWith(8, [
        10, 11,
      ]);
      expect(formRecordStore.dropAppCollections.mock.invocationCallOrder[0]).toBeLessThan(
        serialSeqRepo.delete.mock.invocationCallOrder[0],
      );
      expect(serialSeqRepo.delete).toHaveBeenCalled();
      expect(formConfigRepo.delete).toHaveBeenCalled();
      expect(itemRepo.delete).toHaveBeenCalled();
      expect(dictRepo.delete).toHaveBeenCalledWith({ applicationId: 8 });
      expect(formRepo.delete).toHaveBeenCalledWith({ applicationId: 8 });
      expect(groupRepo.delete).toHaveBeenCalledWith({ applicationId: 8 });
      expect(repo.remove).toHaveBeenCalledWith(ownedApp);
    });

    it('still drops leftover mongo collections when the app has no forms', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([]);
      dictRepo.find.mockResolvedValue([]);

      await service.deleteApp(1, 8);

      expect(formRecordStore.dropAppCollections).toHaveBeenCalledWith(8, []);
      expect(serialSeqRepo.delete).not.toHaveBeenCalled();
      expect(formConfigRepo.delete).not.toHaveBeenCalled();
      expect(itemRepo.delete).not.toHaveBeenCalled();
      expect(dictRepo.delete).toHaveBeenCalledWith({ applicationId: 8 });
      expect(formRepo.delete).toHaveBeenCalledWith({ applicationId: 8 });
      expect(groupRepo.delete).toHaveBeenCalledWith({ applicationId: 8 });
      expect(repo.remove).toHaveBeenCalledWith(ownedApp);
    });

    it('does not delete mysql when mongo drop fails', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([{ id: 10, applicationId: 8 }]);
      dictRepo.find.mockResolvedValue([]);
      formRecordStore.dropAppCollections.mockRejectedValue(
        new Error('mongo down'),
      );

      await expect(service.deleteApp(1, 8)).rejects.toThrow('mongo down');
      expect(repo.remove).not.toHaveBeenCalled();
      expect(formRepo.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when missing or not owner', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.deleteApp(1, 8)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(formRepo.find).not.toHaveBeenCalled();
      expect(formRecordStore.dropAppCollections).not.toHaveBeenCalled();
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  describe('getForm', () => {
    it('returns id+name+groupId for owned form', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
      });

      await expect(service.getForm(1, 8, 10)).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: 2,
        fields: null,
        columns: 1,
      });
    });

    it('returns saved fields array', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
        fields: [{ key: 'a1', type: 'input', title: '姓名' }],
      });

      await expect(service.getForm(1, 8, 10)).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: 2,
        fields: [{ key: 'a1', type: 'input', title: '姓名' }],
        columns: 1,
      });
    });

    it('returns columns from wrapped schema', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
        fields: {
          columns: 3,
          fields: [{ key: 'a1', type: 'input', title: '姓名' }],
        },
      });

      await expect(service.getForm(1, 8, 10)).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: 2,
        fields: [{ key: 'a1', type: 'input', title: '姓名' }],
        columns: 3,
      });
    });

    it('throws 404 when form is missing', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue(null);

      await expect(service.getForm(1, 8, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('directory', () => {
    it('nests forms under groups and lists ungrouped forms separately', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.find.mockResolvedValue([
        { id: 2, name: '人事', applicationId: 8 },
        { id: 1, name: '人事', applicationId: 8 },
      ]);
      formRepo.find.mockResolvedValue([
        { id: 11, name: '未分组', applicationId: 8, groupId: null },
        { id: 10, name: '入职登记', applicationId: 8, groupId: 2 },
        { id: 9, name: '入职登记', applicationId: 8, groupId: 2 },
      ]);

      const result = await service.directory(1, 8);

      expect(groupRepo.find).toHaveBeenCalledWith({
        where: { applicationId: 8 },
        order: { createdAt: 'DESC' },
      });
      expect(formRepo.find).toHaveBeenCalledWith({
        where: { applicationId: 8 },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual({
        groups: [
          {
            id: 2,
            name: '人事',
            forms: [
              { id: 10, name: '入职登记', groupId: 2 },
              { id: 9, name: '入职登记', groupId: 2 },
            ],
          },
          { id: 1, name: '人事', forms: [] },
        ],
        forms: [{ id: 11, name: '未分组', groupId: null }],
      });
    });
  });

  describe('createGroup', () => {
    it('saves trimmed name and allows duplicate names', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.create.mockImplementation((x: Partial<AppGroup>) => x);
      groupRepo.save.mockImplementation(async (row: Partial<AppGroup>) => ({
        id: 4,
        ...row,
      }));

      const first = await service.createGroup(1, 8, { name: ' 人事 ' });
      const second = await service.createGroup(1, 8, { name: '人事' });

      expect(first).toEqual({ id: 4, name: '人事' });
      expect(second).toEqual({ id: 4, name: '人事' });
      expect(groupRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('renameGroup', () => {
    it('updates name', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.findOne.mockResolvedValue({
        id: 2,
        name: '旧名',
        applicationId: 8,
      });
      groupRepo.save.mockImplementation(async (row: AppGroup) => row);

      await expect(
        service.renameGroup(1, 8, 2, { name: ' 新名 ' }),
      ).resolves.toEqual({ id: 2, name: '新名' });
    });

    it('throws 404 when group is not in this app', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.findOne.mockResolvedValue(null);

      try {
        await service.renameGroup(1, 8, 99, { name: '新名' });
        throw new Error('expected 404');
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect((e as NotFoundException).message).toBe('分组不存在');
      }
    });
  });

  describe('deleteGroup', () => {
    it('removes empty group', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.findOne.mockResolvedValue({
        id: 2,
        name: '人事',
        applicationId: 8,
      });
      formRepo.count.mockResolvedValue(0);

      await service.deleteGroup(1, 8, 2);

      expect(groupRepo.remove).toHaveBeenCalled();
    });

    it('rejects when group still has forms', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.findOne.mockResolvedValue({
        id: 2,
        name: '人事',
        applicationId: 8,
      });
      formRepo.count.mockResolvedValue(1);

      try {
        await service.deleteGroup(1, 8, 2);
        throw new Error('expected 400');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toBe(
          '请先删除分组内的表单',
        );
      }
      expect(groupRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('createForm', () => {
    it('creates ungrouped form when groupId is omitted', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.create.mockImplementation((x: Partial<AppForm>) => x);
      formRepo.save.mockImplementation(async (row: Partial<AppForm>) => ({
        id: 11,
        ...row,
      }));

      await expect(
        service.createForm(1, 8, { name: ' 未分组 ' }),
      ).resolves.toEqual({
        id: 11,
        name: '未分组',
        groupId: null,
      });
    });

    it('creates form under a group in this app', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.findOne.mockResolvedValue({
        id: 2,
        name: '人事',
        applicationId: 8,
      });
      formRepo.create.mockImplementation((x: Partial<AppForm>) => x);
      formRepo.save.mockImplementation(async (row: Partial<AppForm>) => ({
        id: 10,
        ...row,
      }));

      await expect(
        service.createForm(1, 8, { name: '入职登记', groupId: 2 }),
      ).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: 2,
      });
    });

    it('throws 400 when groupId is not in this app', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      groupRepo.findOne.mockResolvedValue(null);

      try {
        await service.createForm(1, 8, { name: '入职登记', groupId: 99 });
        throw new Error('expected 400');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toBe('分组不存在');
      }
      expect(formRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('renameForm', () => {
    it('updates name', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '旧名',
        applicationId: 8,
        groupId: 2,
      });
      formRepo.save.mockImplementation(async (row: AppForm) => row);

      await expect(
        service.renameForm(1, 8, 10, { name: '新名' }),
      ).resolves.toEqual({
        id: 10,
        name: '新名',
        groupId: 2,
      });
    });
  });

  describe('deleteForm', () => {
    it('removes form in this app', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
      });

      await service.deleteForm(1, 8, 10);

      expect(formRepo.remove).toHaveBeenCalled();
      expect(formRecordStore.dropFormCollection).toHaveBeenCalledWith(10);
      expect(formRepo.remove.mock.invocationCallOrder[0]).toBeLessThan(
        formRecordStore.dropFormCollection.mock.invocationCallOrder[0],
      );
    });

    it('still drops the mongo collection after TypeORM clears entity id', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      const form = {
        id: 10 as number | undefined,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
      };
      formRepo.findOne.mockResolvedValue(form);
      formRepo.remove.mockImplementation(async (row: { id?: number }) => {
        delete row.id;
        return row;
      });

      await service.deleteForm(1, 8, 10);

      expect(formRecordStore.dropFormCollection).toHaveBeenCalledWith(10);
    });

    it('keeps form deleted when drop fails', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
      });
      formRecordStore.dropFormCollection.mockRejectedValue(
        new Error('mongo down'),
      );

      await expect(service.deleteForm(1, 8, 10)).resolves.toBeUndefined();
      expect(formRepo.remove).toHaveBeenCalled();
    });

    it('throws 404 when form is missing', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue(null);

      try {
        await service.deleteForm(1, 8, 10);
        throw new Error('expected 404');
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect((e as NotFoundException).message).toBe('表单不存在');
      }
      expect(formRecordStore.dropFormCollection).not.toHaveBeenCalled();
    });
  });

  describe('saveFields', () => {
    it('saves fields then syncs indexes and returns the form', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
        fields: null,
      });
      formRepo.save.mockImplementation(async (row: AppForm) => row);
      formRecordStore.syncIndexes.mockResolvedValue(undefined);
      const fields = [{ key: 'a1', type: 'input', title: '姓名' }];

      await expect(service.saveFields(1, 8, 10, fields)).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: 2,
        fields,
        columns: 1,
      });
      expect(formRepo.save).toHaveBeenCalled();
      expect(formRecordStore.syncIndexes).toHaveBeenCalledWith(10, fields);
    });

    it('allows empty array', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: null,
        fields: [{ key: 'a1', type: 'input' }],
      });
      formRepo.save.mockImplementation(async (row: AppForm) => row);
      formRecordStore.syncIndexes.mockResolvedValue(undefined);

      await expect(service.saveFields(1, 8, 10, [])).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: null,
        fields: [],
        columns: 1,
      });
    });

    it('wraps schema when columns is not 1', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
        fields: null,
      });
      formRepo.save.mockImplementation(async (row: AppForm) => row);
      formRecordStore.syncIndexes.mockResolvedValue(undefined);
      const fields = [{ key: 'a1', type: 'input', title: '姓名' }];

      await expect(service.saveFields(1, 8, 10, fields, 2)).resolves.toEqual({
        id: 10,
        name: '入职登记',
        groupId: 2,
        fields,
        columns: 2,
      });
      expect(formRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: { columns: 2, fields },
        }),
      );
      expect(formRecordStore.syncIndexes).toHaveBeenCalledWith(10, fields);
    });

    it('throws 400 when fields is not an array', async () => {
      try {
        await service.saveFields(1, 8, 10, null as unknown as unknown[]);
        throw new Error('expected 400');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toBe('请提交字段列表');
      }
      expect(formRepo.save).not.toHaveBeenCalled();
    });

    it('rejects two serial number fields', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
        fields: null,
      });
      const fields = [
        {
          key: 'a',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'YYYY' }],
        },
        {
          key: 'b',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'YYYY' }],
        },
      ];
      await expect(service.saveFields(1, 8, 10, fields)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(formRepo.save).not.toHaveBeenCalled();
    });

    it('allows serial number without counter', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.findOne.mockResolvedValue({
        id: 10,
        name: '入职登记',
        applicationId: 8,
        groupId: 2,
        fields: null,
      });
      formRepo.save.mockImplementation(async (row: AppForm) => row);
      formRecordStore.syncIndexes.mockResolvedValue(undefined);
      const fields = [
        {
          key: 'sn',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'epochMs' }],
        },
      ];
      await expect(service.saveFields(1, 8, 10, fields)).resolves.toEqual(
        expect.objectContaining({ fields }),
      );
    });
  });

  describe('listFormFields', () => {
    it('returns other saved forms with option field types only', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([
        {
          id: 12,
          name: '客户',
          applicationId: 8,
          createdAt: new Date('2026-08-24T02:00:00.000Z'),
          fields: {
            columns: 2,
            fields: [
              { key: 'n1', title: '客户名称', type: 'input' },
              { key: 'd1', title: '分割', type: 'divider' },
              { key: 'm1', title: '负责人', type: 'member' },
              { key: 'x1', type: 'number' },
              { key: 'p1', title: '头像', type: 'image' },
              { key: 'f1', title: '附件', type: 'file' },
              { key: 'a2', title: '地址', type: 'address' },
              { key: 's1', title: '状态', type: 'radio', dictCode: '11' },
            ],
          },
        },
        {
          id: 11,
          name: '当前表',
          applicationId: 8,
          createdAt: new Date('2026-08-24T01:00:00.000Z'),
          fields: [{ key: 'a1', title: '标题', type: 'input' }],
        },
        {
          id: 10,
          name: '未保存',
          applicationId: 8,
          createdAt: new Date('2026-08-24T00:00:00.000Z'),
          fields: null,
        },
        {
          id: 9,
          name: '只有分割线',
          applicationId: 8,
          createdAt: new Date('2026-08-23T00:00:00.000Z'),
          fields: [{ key: 'd1', title: '线', type: 'divider' }],
        },
      ]);

      await expect(service.listFormFields(1, 8, 11)).resolves.toEqual([
        {
          id: 12,
          name: '客户',
          fields: [
            { key: 'n1', title: '客户名称', type: 'input' },
            { key: 'm1', title: '负责人', type: 'member' },
            { key: 'x1', title: '', type: 'number' },
            { key: 'p1', title: '头像', type: 'image' },
            { key: 'f1', title: '附件', type: 'file' },
            { key: 'a2', title: '地址', type: 'address' },
            { key: 's1', title: '状态', type: 'radio', dictCode: '11' },
          ],
        },
      ]);
      expect(formRepo.find).toHaveBeenCalledWith({
        where: { applicationId: 8 },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns pane inner input and omits tabs', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([
        {
          id: 13,
          name: '带标签页',
          applicationId: 8,
          fields: {
            columns: 1,
            fields: [
              {
                key: 'tabs_1',
                title: '标签页',
                type: 'tabs',
                panes: [
                  {
                    id: 'p1',
                    title: 'A',
                    fields: [{ key: 'n2', title: '姓名', type: 'input' }],
                  },
                ],
              },
            ],
          },
        },
      ]);

      await expect(service.listFormFields(1, 8)).resolves.toEqual([
        {
          id: 13,
          name: '带标签页',
          fields: [{ key: 'n2', title: '姓名', type: 'input' }],
        },
      ]);
    });

    it('does not exclude when excludeFormId is omitted', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([
        {
          id: 12,
          name: '客户',
          applicationId: 8,
          fields: [{ key: 'n1', title: '客户名称', type: 'input' }],
        },
      ]);

      await expect(service.listFormFields(1, 8)).resolves.toEqual([
        {
          id: 12,
          name: '客户',
          fields: [{ key: 'n1', title: '客户名称', type: 'input' }],
        },
      ]);
    });

    it('can include subform fields and their children', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([
        {
          id: 12,
          name: '设备',
          applicationId: 8,
          fields: [
            { key: 'no', title: '编号', type: 'input' },
            {
              key: 'parts',
              title: '配件',
              type: 'subform',
              fields: [{ key: 'name', title: '名称', type: 'input' }],
            },
          ],
        },
      ]);

      await expect(service.listFormFields(1, 8, undefined, 'subform')).resolves.toEqual([
        {
          id: 12,
          name: '设备',
          fields: [
            { key: 'no', title: '编号', type: 'input' },
            {
              key: 'parts',
              title: '配件',
              type: 'subform',
              fields: [{ key: 'name', title: '名称', type: 'input' }],
            },
          ],
        },
      ]);
    });

    it('include=relate 时返回关联数据字段和它指向的主表', async () => {
      repo.findOne.mockResolvedValue(ownedApp);
      formRepo.find.mockResolvedValue([
        {
          id: 30,
          name: '人员表',
          applicationId: 8,
          fields: {
            fields: [
              { key: 'name', type: 'input', title: '工人名' },
              { key: 'r1', type: 'relate', title: '所属工厂', sourceFormId: 12 },
              { key: 'r2', type: 'relate', title: '没配主表' },
            ],
          },
        },
      ]);

      await expect(service.listFormFields(1, 8, undefined, 'relate')).resolves.toEqual([
        {
          id: 30,
          name: '人员表',
          fields: [
            { key: 'name', title: '工人名', type: 'input' },
            { key: 'r1', title: '所属工厂', type: 'relate', sourceFormId: 12 },
          ],
        },
      ]);

      await expect(service.listFormFields(1, 8)).resolves.toEqual([
        {
          id: 30,
          name: '人员表',
          fields: [{ key: 'name', title: '工人名', type: 'input' }],
        },
      ]);
    });
  });
});
