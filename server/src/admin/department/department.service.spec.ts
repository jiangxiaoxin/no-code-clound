import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Department } from './department.entity';
import { DepartmentService } from './department.service';
import { UserDepartment } from './user-department.entity';
import { User } from '../../user/user.entity';

describe('DepartmentService', () => {
  let service: DepartmentService;
  const departmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };
  const userDepartmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
  const userRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    departmentRepo.create.mockImplementation((x: Partial<Department>) => x);
    departmentRepo.save.mockImplementation(async (x: Partial<Department>) => ({
      id: x.id ?? 10,
      status: 'active',
      sortOrder: 0,
      parentId: null,
      leaderUserId: x.leaderUserId ?? null,
      ...x,
    }));
    departmentRepo.update.mockResolvedValue({});
    userDepartmentRepo.find.mockResolvedValue([]);
    userDepartmentRepo.count.mockResolvedValue(0);
    userDepartmentRepo.create.mockImplementation((x: object) => x);
    userDepartmentRepo.save.mockResolvedValue({});
    userDepartmentRepo.delete.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        DepartmentService,
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        {
          provide: getRepositoryToken(UserDepartment),
          useValue: userDepartmentRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = module.get(DepartmentService);
  });

  describe('tree', () => {
    it('builds tree by sortOrder ASC then createdAt ASC', async () => {
      departmentRepo.find.mockResolvedValue([
        {
          id: 1,
          name: '总部',
          parentId: null,
          status: 'active',
          sortOrder: 0,
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 3,
          name: '研发',
          parentId: 1,
          status: 'active',
          sortOrder: 0,
          createdAt: new Date('2026-01-02'),
        },
        {
          id: 2,
          name: '市场',
          parentId: 1,
          status: 'active',
          sortOrder: 1,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      userDepartmentRepo.find.mockResolvedValue([
        { departmentId: 3 },
        { departmentId: 3 },
      ]);
      userRepo.find.mockResolvedValue([]);

      const tree = await service.tree();

      expect(departmentRepo.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      expect(tree).toEqual([
        expect.objectContaining({
          id: 1,
          name: '总部',
          memberCount: 0,
          childCount: 2,
          children: [
            expect.objectContaining({
              id: 3,
              name: '研发',
              memberCount: 2,
              childCount: 0,
              leader: null,
              children: [],
            }),
            expect.objectContaining({
              id: 2,
              name: '市场',
              memberCount: 0,
              childCount: 0,
              children: [],
            }),
          ],
        }),
      ]);
    });

    it('tree 带出停用的部门负责人', async () => {
      departmentRepo.find.mockResolvedValue([
        {
          id: 1,
          name: '总部',
          parentId: null,
          status: 'active',
          sortOrder: 0,
          createdAt: new Date('2026-01-01'),
          leaderUserId: null,
        },
        {
          id: 3,
          name: '研发',
          parentId: 1,
          status: 'active',
          sortOrder: 0,
          createdAt: new Date('2026-01-02'),
          leaderUserId: 9,
        },
      ]);
      userDepartmentRepo.find.mockResolvedValue([]);
      userRepo.find.mockResolvedValue([
        { id: 9, displayName: '张三', status: 'disabled' },
      ]);

      const tree = await service.tree();
      expect(tree[0].children[0].leader).toEqual({
        id: 9,
        displayName: '张三',
        status: 'disabled',
      });
    });
  });

  describe('create', () => {
    it('trims name before save', async () => {
      departmentRepo.findOne.mockResolvedValue(null);

      const result = await service.create({ name: '  研发  ' });

      expect(result.name).toBe('研发');
      expect(departmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: '研发' }),
      );
    });

    it('rejects duplicate sibling name', async () => {
      departmentRepo.findOne.mockResolvedValue({ id: 2, name: '研发' });

      await expect(service.create({ name: '研发' })).rejects.toMatchObject({
        constructor: ConflictException,
        message: '同级部门名称已存在',
      });
    });

    it('rejects missing or disabled parent', async () => {
      departmentRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.create({ name: '小组', parentId: 9 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      departmentRepo.findOne.mockResolvedValueOnce({
        id: 9,
        status: 'disabled',
      });
      await expect(
        service.create({ name: '小组', parentId: 9 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('指定负责人：挂到新部门，不提示替换', async () => {
      departmentRepo.findOne.mockResolvedValue(null);
      departmentRepo.find.mockResolvedValue([]);
      userRepo.findOne.mockResolvedValue({
        id: 8,
        displayName: '李四',
        status: 'active',
      });
      userDepartmentRepo.count.mockResolvedValue(1);

      const result = await service.create({
        name: '研发',
        leaderUserId: 8,
      });

      expect(userDepartmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8, departmentId: 10 }),
      );
      expect(result.leader).toEqual({
        id: 8,
        displayName: '李四',
        status: 'active',
      });
      expect(result.leaderReplaceHint).toBeUndefined();
    });

    it('指定的负责人不存在', async () => {
      departmentRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: '研发', leaderUserId: 99 }),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        message: '人员不存在',
      });
    });
  });

  describe('update', () => {
    it('rejects moving a department under itself or a descendant', async () => {
      departmentRepo.findOne
        .mockResolvedValueOnce({
          id: 1,
          name: '总部',
          parentId: null,
          status: 'active',
          sortOrder: 0,
        })
        .mockResolvedValueOnce({
          id: 2,
          name: '研发',
          parentId: 1,
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 2,
          name: '研发',
          parentId: 1,
          status: 'active',
        });

      await expect(
        service.update(1, { parentId: 2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('换成另一人：提示替换，原负责人不再担任', async () => {
      const department = {
        id: 10,
        name: '研发部',
        parentId: null,
        status: 'active' as const,
        sortOrder: 0,
        leaderUserId: 7,
      };
      departmentRepo.findOne.mockImplementation(async ({ where }: { where: { id?: number } }) => {
        if (where.id === 10) return { ...department };
        if (where.id === 7) {
          return { id: 7, displayName: '张三', status: 'active' };
        }
        return null;
      });
      userRepo.findOne.mockImplementation(async ({ where }: { where: { id?: number } }) => {
        if (where.id === 8) {
          return { id: 8, displayName: '李四', status: 'active' };
        }
        if (where.id === 7) {
          return { id: 7, displayName: '张三', status: 'active' };
        }
        return null;
      });
      userDepartmentRepo.find.mockResolvedValue([{ userId: 8, departmentId: 10 }]);
      departmentRepo.find.mockResolvedValue([{ id: 10, leaderUserId: 8 }]);
      userDepartmentRepo.count.mockResolvedValue(2);
      departmentRepo.count.mockResolvedValue(0);

      const result = await service.update(10, { leaderUserId: 8 });

      expect(result.leaderReplaceHint).toBe('已将研发部原负责人张三替换为李四');
      expect(result.leader).toEqual({
        id: 8,
        displayName: '李四',
        status: 'active',
      });
    });

    it('清空负责人：列变为空，不把人调出部门', async () => {
      departmentRepo.findOne.mockResolvedValue({
        id: 10,
        name: '研发部',
        parentId: null,
        status: 'active',
        sortOrder: 0,
        leaderUserId: 8,
      });
      userDepartmentRepo.count.mockResolvedValue(1);
      departmentRepo.count.mockResolvedValue(0);
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.update(10, { leaderUserId: null });

      expect(result.leader).toBeNull();
      expect(userDepartmentRepo.delete).not.toHaveBeenCalled();
    });

    it('只改状态时不改负责人', async () => {
      departmentRepo.findOne.mockResolvedValue({
        id: 10,
        name: '研发部',
        parentId: null,
        status: 'active',
        sortOrder: 0,
        leaderUserId: 8,
      });
      userDepartmentRepo.count.mockResolvedValue(1);
      departmentRepo.count.mockResolvedValue(0);
      userRepo.findOne.mockResolvedValue({
        id: 8,
        displayName: '李四',
        status: 'active',
      });

      const result = await service.update(10, { status: 'disabled' });

      expect(userDepartmentRepo.save).not.toHaveBeenCalled();
      expect(result.leader).toEqual({
        id: 8,
        displayName: '李四',
        status: 'active',
      });
    });

    it('选了其他部门的人：调进本部门，并摘掉其原部门负责人', async () => {
      departmentRepo.findOne.mockResolvedValue({
        id: 10,
        name: '研发部',
        parentId: null,
        status: 'active',
        sortOrder: 0,
        leaderUserId: null,
      });
      userRepo.findOne.mockResolvedValue({
        id: 8,
        displayName: '李四',
        status: 'active',
      });
      userDepartmentRepo.find.mockResolvedValue([{ userId: 8, departmentId: 2 }]);
      departmentRepo.find.mockResolvedValue([
        { id: 2, name: '销售部', leaderUserId: 8 },
      ]);
      userDepartmentRepo.count.mockResolvedValue(1);
      departmentRepo.count.mockResolvedValue(0);

      const result = await service.update(10, { leaderUserId: 8 });

      expect(userDepartmentRepo.delete).toHaveBeenCalledWith({ userId: 8 });
      expect(userDepartmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8, departmentId: 10 }),
      );
      expect(departmentRepo.update).toHaveBeenCalledWith(
        { id: 2 },
        { leaderUserId: null },
      );
      expect(result.leader?.id).toBe(8);
    });
  });

  describe('delete', () => {
    it('rejects when children exist', async () => {
      departmentRepo.findOne.mockResolvedValue({ id: 1, name: '总部' });
      departmentRepo.count.mockResolvedValue(2);

      await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when members exist', async () => {
      departmentRepo.findOne.mockResolvedValue({ id: 1, name: '总部' });
      departmentRepo.count.mockResolvedValue(0);
      userDepartmentRepo.count.mockResolvedValue(3);

      await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('requireAssignable', () => {
    it('deduplicates ids and returns active departments', async () => {
      departmentRepo.find.mockResolvedValue([
        { id: 1, status: 'active' },
        { id: 2, status: 'active' },
      ]);

      await expect(service.requireAssignable([2, 1, 1])).resolves.toHaveLength(
        2,
      );
    });

    it('rejects missing or disabled departments', async () => {
      departmentRepo.find.mockResolvedValueOnce([{ id: 1, status: 'active' }]);
      await expect(service.requireAssignable([1, 9])).rejects.toBeInstanceOf(
        NotFoundException,
      );

      departmentRepo.find.mockResolvedValueOnce([
        { id: 1, status: 'disabled' },
      ]);
      await expect(service.requireAssignable([1])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
