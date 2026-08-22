import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Department } from './department.entity';
import { UserDepartment } from './user-department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

export type DepartmentItem = {
  id: number;
  name: string;
  parentId: number | null;
  status: 'active' | 'disabled';
  sortOrder: number;
  memberCount: number;
  childCount: number;
  children: DepartmentItem[];
};

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
  ) {}

  async tree(): Promise<DepartmentItem[]> {
    const departments = await this.departmentRepo.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const links = await this.userDepartmentRepo.find();
    const memberCounts = new Map<number, number>();
    for (const link of links) {
      memberCounts.set(
        link.departmentId,
        (memberCounts.get(link.departmentId) ?? 0) + 1,
      );
    }

    const nodes = new Map<number, DepartmentItem>();
    for (const department of departments) {
      nodes.set(department.id, {
        id: department.id,
        name: department.name,
        parentId: department.parentId,
        status: department.status,
        sortOrder: department.sortOrder,
        memberCount: memberCounts.get(department.id) ?? 0,
        childCount: 0,
        children: [],
      });
    }

    const roots: DepartmentItem[] = [];
    for (const department of departments) {
      const node = nodes.get(department.id)!;
      const parent =
        department.parentId == null ? null : nodes.get(department.parentId);
      if (parent) {
        parent.children.push(node);
        parent.childCount = parent.children.length;
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentItem> {
    const name = dto.name.trim();
    const parentId = dto.parentId ?? null;
    await this.assertParentAssignable(parentId);
    await this.assertSiblingNameUnique(parentId, name);

    const saved = await this.departmentRepo.save(
      this.departmentRepo.create({
        name,
        parentId,
        status: 'active',
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    return this.toItem(saved, 0, 0);
  }

  async update(id: number, dto: UpdateDepartmentDto): Promise<DepartmentItem> {
    const department = await this.requireOne(id);
    const name = dto.name === undefined ? department.name : dto.name.trim();
    const parentId =
      dto.parentId === undefined ? department.parentId : dto.parentId;
    const status = dto.status ?? department.status;
    const sortOrder =
      dto.sortOrder === undefined ? department.sortOrder : dto.sortOrder;

    if (parentId !== department.parentId) {
      await this.assertParentAssignable(parentId);
      await this.assertNotCycle(id, parentId);
    }
    if (name !== department.name || parentId !== department.parentId) {
      await this.assertSiblingNameUnique(parentId, name, id);
    }

    department.name = name;
    department.parentId = parentId;
    department.status = status;
    department.sortOrder = sortOrder;
    const saved = await this.departmentRepo.save(department);
    const [memberCount, childCount] = await Promise.all([
      this.userDepartmentRepo.count({ where: { departmentId: id } }),
      this.departmentRepo.count({ where: { parentId: id } }),
    ]);
    return this.toItem(saved, memberCount, childCount);
  }

  async delete(id: number): Promise<void> {
    await this.requireOne(id);
    const childCount = await this.departmentRepo.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('存在子部门，无法删除');
    }
    const memberCount = await this.userDepartmentRepo.count({
      where: { departmentId: id },
    });
    if (memberCount > 0) {
      throw new ConflictException('部门仍有关联人员，无法删除');
    }
    await this.departmentRepo.delete(id);
  }

  async requireAssignable(ids: number[]): Promise<Department[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return [];
    }
    const departments = await this.departmentRepo.find({
      where: { id: In(uniqueIds) },
    });
    if (departments.length !== uniqueIds.length) {
      throw new NotFoundException('部门不存在');
    }
    if (departments.some((department) => department.status === 'disabled')) {
      throw new BadRequestException('不能分配已停用的部门');
    }
    return departments;
  }

  private async requireOne(id: number): Promise<Department> {
    const department = await this.departmentRepo.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException('部门不存在');
    }
    return department;
  }

  private async assertParentAssignable(parentId: number | null): Promise<void> {
    if (parentId == null) {
      return;
    }
    const parent = await this.departmentRepo.findOne({
      where: { id: parentId },
    });
    if (!parent) {
      throw new BadRequestException('上级部门不存在');
    }
    if (parent.status === 'disabled') {
      throw new BadRequestException('不能在已停用的部门下新建或移动');
    }
  }

  private async assertSiblingNameUnique(
    parentId: number | null,
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.departmentRepo.findOne({
      where: {
        parentId: parentId == null ? IsNull() : parentId,
        name,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('同级部门名称已存在');
    }
  }

  private async assertNotCycle(
    id: number,
    parentId: number | null,
  ): Promise<void> {
    if (parentId == null) {
      return;
    }
    if (parentId === id) {
      throw new BadRequestException('上级部门不能是自身或自身后代');
    }
    const seen = new Set<number>();
    let current: number | null = parentId;
    while (current != null) {
      if (current === id || seen.has(current)) {
        throw new BadRequestException('上级部门不能是自身或自身后代');
      }
      seen.add(current);
      const node = await this.departmentRepo.findOne({ where: { id: current } });
      current = node?.parentId ?? null;
    }
  }

  private toItem(
    department: Department,
    memberCount: number,
    childCount: number,
  ): DepartmentItem {
    return {
      id: department.id,
      name: department.name,
      parentId: department.parentId,
      status: department.status,
      sortOrder: department.sortOrder,
      memberCount,
      childCount,
      children: [],
    };
  }
}
