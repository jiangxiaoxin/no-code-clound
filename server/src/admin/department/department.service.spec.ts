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

describe('DepartmentService', () => {
  let service: DepartmentService;
  const departmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };
  const userDepartmentRepo = {
    find: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    departmentRepo.create.mockImplementation((x: Partial<Department>) => x);
    departmentRepo.save.mockImplementation(async (x: Partial<Department>) => ({
      id: x.id ?? 10,
      status: 'active',
      sortOrder: 0,
      parentId: null,
      ...x,
    }));
    const module = await Test.createTestingModule({
      providers: [
        DepartmentService,
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        {
          provide: getRepositoryToken(UserDepartment),
          useValue: userDepartmentRepo,
        },
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
