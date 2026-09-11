import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { In, Repository } from 'typeorm';
import { Department } from '../admin/department/department.entity';
import { UserDepartment } from '../admin/department/user-department.entity';
import { Role } from '../admin/role/role.entity';
import { User } from '../user/user.entity';
import type { AppAccess } from './access/app-access.service';
import { AppAccessService } from './access/app-access.service';
import { AppFormConfig } from './app-form-config.entity';
import {
  FormViewer,
  normalizeFormDataAccess,
  type FormDataAccessConfig,
} from './form-data-access';
import { FormRecordDoc } from './form-record/form-record.store';
import { WorkflowInstance } from './workflow/workflow-instance.entity';
import { WorkflowTask } from './workflow/workflow-task.entity';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export type FormViewerRow = FormViewer & {
  label: string;
  effective: boolean;
};

@Injectable()
export class FormDataAccessService {
  constructor(
    @InjectRepository(AppFormConfig)
    private readonly formConfigRepo: Repository<AppFormConfig>,
    @InjectRepository(UserDepartment)
    private readonly userDeptRepo: Repository<UserDepartment>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowTask)
    private readonly taskRepo: Repository<WorkflowTask>,
    private readonly access: AppAccessService,
  ) {}

  async policyOf(formId: number): Promise<FormDataAccessConfig> {
    const row = await this.formConfigRepo.findOne({ where: { formId } });
    return normalizeFormDataAccess(row?.config);
  }

  async assertCanViewForm(
    userId: number,
    access: AppAccess,
    formId: number,
  ): Promise<void> {
    if (await this.canViewForm(userId, access, formId)) return;
    throw new NotFoundException('表单不存在');
  }

  async canViewForm(
    userId: number,
    access: AppAccess,
    formId: number,
  ): Promise<boolean> {
    if (access.isOwner || access.canConfigure) return true;
    const policy = await this.policyOf(formId);
    if (!policy.formViewers.length) return true;
    return this.access.targetsHit(userId, policy.formViewers);
  }

  async filterVisibleFormIds(
    userId: number,
    access: AppAccess,
    formIds: number[],
  ): Promise<Set<number>> {
    if (access.isOwner || access.canConfigure) {
      return new Set(formIds);
    }
    const visible = new Set<number>();
    if (!formIds.length) return visible;
    const rows = await this.formConfigRepo.find({
      where: { formId: In(formIds) },
    });
    const byForm = new Map(rows.map((row) => [row.formId, row]));
    for (const formId of formIds) {
      const policy = normalizeFormDataAccess(byForm.get(formId)?.config);
      if (
        !policy.formViewers.length ||
        (await this.access.targetsHit(userId, policy.formViewers))
      ) {
        visible.add(formId);
      }
    }
    return visible;
  }

  async rowMongoFilter(
    userId: number,
    access: AppAccess,
    formId: number,
    formKind?: string,
  ): Promise<Record<string, unknown> | null> {
    if (access.isOwner || access.canConfigure) return null;
    const policy = await this.policyOf(formId);
    if (policy.rowScope === 'all') return null;
    if (policy.rowScope === 'created') return { createdBy: userId };
    if (policy.rowScope === 'dept') {
      const colleagueIds = await this.colleagueIds(userId);
      if (!colleagueIds) {
        return this.relatedFilter(userId, formId, formKind);
      }
      return { createdBy: { $in: colleagueIds } };
    }
    return this.relatedFilter(userId, formId, formKind);
  }

  async assertCanViewRecord(
    userId: number,
    access: AppAccess,
    formId: number,
    doc: Pick<FormRecordDoc, '_id' | 'createdBy'>,
    formKind?: string,
  ): Promise<void> {
    if (await this.canViewRecord(userId, access, formId, doc, formKind)) return;
    throw new NotFoundException('记录不存在');
  }

  async decorateViewers(viewers: FormViewer[]): Promise<FormViewerRow[]> {
    return Promise.all(viewers.map((row) => this.toViewerRow(row)));
  }

  private async canViewRecord(
    userId: number,
    access: AppAccess,
    formId: number,
    doc: Pick<FormRecordDoc, '_id' | 'createdBy'>,
    formKind?: string,
  ): Promise<boolean> {
    if (access.isOwner || access.canConfigure) return true;
    const policy = await this.policyOf(formId);
    if (policy.rowScope === 'all') return true;
    if (policy.rowScope === 'created') return doc.createdBy === userId;
    if (policy.rowScope === 'dept') {
      const colleagueIds = await this.colleagueIds(userId);
      if (!colleagueIds) {
        return this.isRelated(userId, formId, doc, formKind);
      }
      return colleagueIds.includes(doc.createdBy);
    }
    return this.isRelated(userId, formId, doc, formKind);
  }

  private async relatedFilter(
    userId: number,
    formId: number,
    formKind?: string,
  ): Promise<Record<string, unknown>> {
    if (formKind !== 'workflow') return { createdBy: userId };
    const recordIds = await this.participatedRecordIds(userId, formId);
    const objectIds = recordIds
      .filter((id) => OBJECT_ID_RE.test(id))
      .map((id) => new ObjectId(id));
    if (!objectIds.length) return { createdBy: userId };
    return {
      $or: [{ createdBy: userId }, { _id: { $in: objectIds } }],
    };
  }

  private async isRelated(
    userId: number,
    formId: number,
    doc: Pick<FormRecordDoc, '_id' | 'createdBy'>,
    formKind?: string,
  ): Promise<boolean> {
    if (doc.createdBy === userId) return true;
    if (formKind !== 'workflow') return false;
    const recordId =
      typeof doc._id?.toHexString === 'function'
        ? doc._id.toHexString()
        : String(doc._id);
    const ids = await this.participatedRecordIds(userId, formId);
    return ids.includes(recordId);
  }

  private async participatedRecordIds(
    userId: number,
    formId: number,
  ): Promise<string[]> {
    const tasks = await this.taskRepo.find({
      where: { assigneeId: userId },
      select: { instanceId: true },
    });
    const instanceIds = [...new Set(tasks.map((row) => row.instanceId))];
    if (!instanceIds.length) return [];
    const instances = await this.instanceRepo.find({
      where: { id: In(instanceIds), formId },
      select: { recordId: true },
    });
    return instances.map((row) => row.recordId).filter(Boolean);
  }

  private async colleagueIds(userId: number): Promise<number[] | null> {
    const link = await this.userDeptRepo.findOne({ where: { userId } });
    if (!link) return null;
    const rows = await this.userDeptRepo.find({
      where: { departmentId: link.departmentId },
    });
    return rows.map((row) => row.userId);
  }

  private async toViewerRow(row: FormViewer): Promise<FormViewerRow> {
    if (row.type === 'user') {
      const user = await this.userRepo.findOne({ where: { id: row.targetId } });
      return this.decorateViewer(
        row,
        user?.displayName || '人员',
        user ? user.status === 'active' : false,
        !user,
      );
    }
    if (row.type === 'department') {
      const dept = await this.deptRepo.findOne({ where: { id: row.targetId } });
      return this.decorateViewer(
        row,
        dept?.name || '部门',
        dept ? dept.status === 'active' : false,
        !dept,
      );
    }
    const role = await this.roleRepo.findOne({ where: { id: row.targetId } });
    return this.decorateViewer(
      row,
      role?.name || '角色',
      role ? role.status === 'active' : false,
      !role,
    );
  }

  private decorateViewer(
    row: FormViewer,
    name: string,
    effective: boolean,
    missing: boolean,
  ): FormViewerRow {
    const kind =
      row.type === 'user' ? '人员' : row.type === 'department' ? '部门' : '角色';
    let label = name;
    if (missing) {
      label = `${kind}（id:${row.targetId}，已删除，当前不生效）`;
    } else if (!effective) {
      label = `${name}（已停用，当前不生效）`;
    }
    return { ...row, label, effective: effective && !missing };
  }
}
