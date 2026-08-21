import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppForm } from './app-form.entity';
import { AppGroup } from './app-group.entity';
import { Application } from './application.entity';
import { ApplicationService } from './application.service';

describe('ApplicationService', () => {
  let service: ApplicationService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const groupRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const formRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
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
    });
  });
});
