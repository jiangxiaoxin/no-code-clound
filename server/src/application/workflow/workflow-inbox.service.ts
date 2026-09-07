import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Department } from '../../admin/department/department.entity';
import { User } from '../../user/user.entity';
import { AppForm } from '../app-form.entity';
import { Application } from '../application.entity';
import { DictionaryService } from '../dictionary/dictionary.service';
import { flattenFields } from '../form-record/flatten-fields';
import { parseFormSchema } from '../form-schema';
import { FormRecordStore } from '../form-record/form-record.store';
import { FormField } from '../form-record/form-record.types';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTask } from './workflow-task.entity';
import { InstanceStatus, WorkflowNode } from './workflow.types';

const DEFAULT_BRIEF_FIELD_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'time',
  'date',
  'datetime',
]);

const STATUS_TEXT: Record<InstanceStatus, string> = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  error: '异常',
};

@Injectable()
export class WorkflowInboxService {
  constructor(
    @InjectRepository(WorkflowTask)
    private readonly taskRepo: Repository<WorkflowTask>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly store: FormRecordStore,
    private readonly dictionary: DictionaryService,
    private readonly engine: WorkflowEngine,
  ) {}

  async query(
    userId: number,
    body: { kind: 'todo' | 'mine' | 'done' | 'cc'; appId?: number; page?: number; pageSize?: number },
  ) {
    const page = body.page ?? 1;
    const pageSize = body.pageSize ?? 20;
    const kind = body.kind;
    if (kind === 'mine') {
      const qb = this.instanceRepo
        .createQueryBuilder('instance')
        .where('instance.initiatorId = :userId', { userId })
        .orderBy('instance.updatedAt', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize);
      if (body.appId) qb.andWhere('instance.appId = :appId', { appId: body.appId });
      const [items, total] = await qb.getManyAndCount();
      return {
        items: await this.toMineCards(items),
        total,
        page,
        pageSize,
      };
    }
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .innerJoin(WorkflowInstance, 'instance', 'instance.id = task.instanceId')
      .where('task.assigneeId = :userId', { userId })
      .orderBy(
        kind === 'done' || kind === 'cc' ? 'task.finishedAt' : 'task.createdAt',
        'DESC',
      )
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (kind === 'todo') {
      qb.andWhere('task.status = :status', { status: 'pending' });
    } else if (kind === 'cc') {
      qb.andWhere('task.action = :action', { action: 'cc' });
    } else {
      qb.andWhere('task.status = :status', { status: 'done' });
      qb.andWhere('task.action IN (:...actions)', {
        actions: ['approve', 'reject'],
      });
    }
    if (body.appId) qb.andWhere('instance.appId = :appId', { appId: body.appId });
    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.toTaskCards(items, kind),
      total,
      page,
      pageSize,
    };
  }

  async count(userId: number, appId?: number) {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .innerJoin(WorkflowInstance, 'instance', 'instance.id = task.instanceId')
      .where('task.assigneeId = :userId', { userId })
      .andWhere('task.status = :status', { status: 'pending' });
    if (appId) qb.andWhere('instance.appId = :appId', { appId });
    return { todo: await qb.getCount() };
  }

  async open(userId: number, kind: 'todo' | 'mine' | 'done' | 'cc', id: number) {
    let task: WorkflowTask | null = null;
    let instance: WorkflowInstance | null = null;
    if (kind === 'mine') {
      instance = await this.instanceRepo.findOne({ where: { id } });
      if (!instance || instance.initiatorId !== userId) {
        throw new NotFoundException('单据不存在');
      }
    } else {
      task = await this.taskRepo.findOne({ where: { id } });
      if (!task || task.assigneeId !== userId) {
        throw new NotFoundException('待办不存在');
      }
      if (kind === 'todo' && task.status !== 'pending') {
        throw new NotFoundException('待办不存在');
      }
      if (kind === 'done' && task.status !== 'done') {
        throw new NotFoundException('待办不存在');
      }
      if (kind === 'cc' && task.action !== 'cc') {
        throw new NotFoundException('待办不存在');
      }
      instance = await this.instanceRepo.findOne({ where: { id: task.instanceId } });
      if (!instance) throw new NotFoundException('单据不存在');
    }
    const form = await this.formRepo.findOne({ where: { id: instance.formId } });
    if (!form) throw new NotFoundException('表单不存在');
    const record = await this.store.findById(instance.formId, instance.recordId);
    const tasks = await this.taskRepo.find({
      where: { instanceId: instance.id },
      order: { createdAt: 'ASC' },
    });
    const userIds = new Set<number>([instance.initiatorId]);
    for (const row of tasks) userIds.add(row.assigneeId);
    const users = userIds.size
      ? await this.userRepo.find({ where: { id: In([...userIds]) } })
      : [];
    const names: Record<string, string> = {};
    const disabled = new Set<number>();
    for (const user of users) {
      names[String(user.id)] = user.displayName;
      if (user.status !== 'active') disabled.add(user.id);
    }
    await this.engine.markStuckByDisabledApprovers(instance, tasks, disabled);
    const fields = parseFormSchema(form.fields).fields;
    const dictCodes = flattenFields(fields)
      .map((field) => field.dictCode)
      .filter((code): code is string => Boolean(code));
    const dictionaries = await this.dictionary.listEnabledItemsByApp(
      instance.appId,
      dictCodes,
    );
    const node = instance.currentNodeKey
      ? instance.graph.nodes.find((item) => item.key === instance.currentNodeKey)
      : undefined;
    const approve = node?.type === 'approve' ? node : undefined;
    const ccNode =
      kind === 'cc' && task
        ? instance.graph.nodes.find((item) => item.key === task.nodeKey)
        : undefined;
    return {
      kind,
      form: {
        id: form.id,
        name: form.name,
        fields,
        formKind: form.formKind,
      },
      record: record ? { id: instance.recordId, data: record.data ?? {} } : null,
      recordMissing: !record,
      dictionaries,
      instance: {
        id: instance.id,
        status: instance.status,
        currentNodeKey: instance.currentNodeKey,
        visitedNodeKeys: instance.visitedNodeKeys,
        round: instance.round,
        errorReason: instance.errorReason,
        notes: instance.notes,
        graph: instance.graph,
        initiatorId: instance.initiatorId,
        hasApproved: instance.hasApproved,
        definitionVersion: instance.definitionVersion,
      },
      tasks: tasks.map((row) => ({
        id: row.id,
        nodeKey: row.nodeKey,
        assigneeId: row.assigneeId,
        assigneeName: names[String(row.assigneeId)] || '',
        assigneeDisabled: disabled.has(row.assigneeId),
        status: row.status,
        action: row.action,
        comment: row.comment,
        cancelReason: row.cancelReason,
        finishedAt: row.finishedAt,
        createdAt: row.createdAt,
      })),
      names,
      actions: this.actionsOf(kind, instance, task),
      fieldAccess:
        kind === 'todo'
          ? approve?.fieldAccess || {}
          : kind === 'cc' && ccNode?.type === 'cc'
            ? ccNode.fieldAccess || {}
            : {},
      commentRequiredOnApprove: Boolean(approve?.commentRequiredOnApprove),
      commentRequiredOnReject: approve?.commentRequiredOnReject !== false,
    };
  }

  private actionsOf(
    kind: 'todo' | 'mine' | 'done' | 'cc',
    instance: WorkflowInstance,
    task: WorkflowTask | null,
  ) {
    if (kind === 'todo') {
      return {
        canApprove: task?.status === 'pending',
        canReject: task?.status === 'pending',
        canDraft: false,
        canSubmit: false,
        canCancel: false,
        canRetry: false,
        readOnly: false,
      };
    }
    if (kind === 'done' || kind === 'cc') {
      return {
        canApprove: false,
        canReject: false,
        canDraft: false,
        canSubmit: false,
        canCancel: false,
        canRetry: false,
        readOnly: true,
      };
    }
    if (instance.status === 'approved') {
      return {
        canApprove: false,
        canReject: false,
        canDraft: false,
        canSubmit: false,
        canCancel: false,
        canRetry: false,
        readOnly: true,
      };
    }
    return {
      canApprove: false,
      canReject: false,
      canDraft:
        instance.status === 'draft' ||
        instance.status === 'rejected' ||
        instance.status === 'error',
      canSubmit:
        instance.status === 'draft' ||
        instance.status === 'rejected' ||
        instance.status === 'error',
      canCancel:
        (instance.status === 'running' || instance.status === 'error') &&
        !instance.hasApproved,
      canRetry: instance.status === 'error',
      readOnly: false,
    };
  }

  private async toMineCards(instances: WorkflowInstance[]) {
    const ctx = await this.loadCardContext(instances);
    const packed = await Promise.all(
      instances.map(async (instance) => {
        const record = await this.store.findById(instance.formId, instance.recordId);
        return {
          instance,
          record,
          form: ctx.forms.get(instance.formId),
        };
      }),
    );
    const names = await this.loadBriefNames(
      packed.map((row) => ({
        fields: row.form?.fields,
        data: row.record?.data,
        briefKeys: briefKeysOf(row.instance.graph?.nodes, row.instance.currentNodeKey),
      })),
    );
    return packed.map(({ instance, record, form }) => {
      const missing = !record;
      return {
        id: instance.id,
        kind: 'mine' as const,
        appId: instance.appId,
        appName: ctx.apps.get(instance.appId)?.name || '',
        formId: instance.formId,
        formName: form?.name || '',
        summary: missing
          ? '数据已删除'
          : this.summaryOf(
              form?.fields,
              record?.data,
              instance.recordId,
              briefKeysOf(instance.graph?.nodes, instance.currentNodeKey),
              names,
            ),
        status: instance.status,
        statusText: STATUS_TEXT[instance.status],
        currentNodeTitle: titleOf(instance.graph.nodes, instance.currentNodeKey),
        initiatorName: ctx.users.get(instance.initiatorId) || '',
        time: instance.updatedAt,
        recordMissing: missing,
      };
    });
  }

  private async toTaskCards(
    tasks: WorkflowTask[],
    kind: 'todo' | 'done' | 'cc',
  ) {
    const instanceIds = [...new Set(tasks.map((row) => row.instanceId))];
    const instances = instanceIds.length
      ? await this.instanceRepo.find({ where: { id: In(instanceIds) } })
      : [];
    const byId = new Map(instances.map((row) => [row.id, row]));
    const ctx = await this.loadCardContext(instances);
    const packed = await Promise.all(
      tasks.map(async (task) => {
        const instance = byId.get(task.instanceId);
        const record = instance
          ? await this.store.findById(instance.formId, instance.recordId)
          : null;
        return {
          task,
          instance,
          record,
          form: instance ? ctx.forms.get(instance.formId) : undefined,
        };
      }),
    );
    const names = await this.loadBriefNames(
      packed.map((row) => ({
        fields: row.form?.fields,
        data: row.record?.data,
        briefKeys: briefKeysOf(row.instance?.graph?.nodes, row.task.nodeKey),
      })),
    );
    return packed.map(({ task, instance, record, form }) => {
      const missing = !record;
      return {
        id: task.id,
        kind,
        appId: instance?.appId,
        appName: instance ? ctx.apps.get(instance.appId)?.name || '' : '',
        formId: instance?.formId,
        formName: form?.name || '',
        summary: missing
          ? '数据已删除'
          : this.summaryOf(
              form?.fields,
              record?.data,
              instance?.recordId,
              briefKeysOf(instance?.graph?.nodes, task.nodeKey),
              names,
            ),
        status: instance?.status,
        statusText:
          kind === 'cc'
            ? '已抄送'
            : kind === 'done'
            ? task.action === 'reject'
              ? '已驳回'
              : '已通过'
            : titleOf(instance?.graph.nodes, task.nodeKey) ||
              STATUS_TEXT[instance?.status || 'running'],
        currentNodeTitle: titleOf(instance?.graph.nodes, instance?.currentNodeKey),
        initiatorName: instance ? ctx.users.get(instance.initiatorId) || '' : '',
        time:
          kind === 'done' || kind === 'cc' ? task.finishedAt : task.createdAt,
        recordMissing: missing,
      };
    });
  }

  private async loadCardContext(instances: WorkflowInstance[]) {
    const formIds = [...new Set(instances.map((row) => row.formId))];
    const appIds = [...new Set(instances.map((row) => row.appId))];
    const userIds = [...new Set(instances.map((row) => row.initiatorId))];
    const [forms, apps, users] = await Promise.all([
      formIds.length ? this.formRepo.find({ where: { id: In(formIds) } }) : [],
      appIds.length ? this.appRepo.find({ where: { id: In(appIds) } }) : [],
      userIds.length ? this.userRepo.find({ where: { id: In(userIds) } }) : [],
    ]);
    return {
      forms: new Map(forms.map((row) => [row.id, row])),
      apps: new Map(apps.map((row) => [row.id, row])),
      users: new Map(users.map((row) => [row.id, row.displayName])),
    };
  }

  private async loadBriefNames(
    rows: {
      fields: AppForm['fields'] | FormField[] | null | undefined;
      data: Record<string, unknown> | undefined;
      briefKeys?: string[];
    }[],
  ) {
    const userIds = new Set<number>();
    const deptIds = new Set<number>();
    for (const row of rows) {
      collectBriefOrgIds(row.fields, row.data, row.briefKeys, userIds, deptIds);
    }
    const [users, depts] = await Promise.all([
      userIds.size
        ? this.userRepo.find({
            where: { id: In([...userIds]) },
            select: { id: true, displayName: true },
          })
        : [],
      deptIds.size
        ? this.departmentRepo.find({
            where: { id: In([...deptIds]) },
            select: { id: true, name: true },
          })
        : [],
    ]);
    return {
      users: new Map(users.map((user) => [user.id, user.displayName])),
      depts: new Map(depts.map((dept) => [dept.id, dept.name])),
    };
  }

  private summaryOf(
    fields: AppForm['fields'] | FormField[] | null | undefined,
    data: Record<string, unknown> | undefined,
    recordId: string | undefined,
    briefFieldKeys: string[] | undefined,
    names: { users: Map<number, string>; depts: Map<number, string> },
  ) {
    const parsed = Array.isArray(fields)
      ? (fields as FormField[])
      : parseFormSchema(fields).fields;
    const flat = flattenFields(parsed).filter(
      (field) =>
        field.type !== 'subform' &&
        field.type !== 'divider' &&
        field.type !== 'tabs' &&
        field.type !== 'relate-subform',
    );
    const allowed = new Set(
      Array.isArray(briefFieldKeys)
        ? briefFieldKeys
        : flat
            .filter((field) => DEFAULT_BRIEF_FIELD_TYPES.has(field.type))
            .map((field) => field.key),
    );
    const parts: string[] = [];
    for (const field of flat) {
      if (!allowed.has(field.key)) continue;
      const text = briefValueText(field, data?.[field.key], names);
      if (!text) continue;
      parts.push(`${field.title || field.key}：${text}`);
    }
    return parts.join(' / ') || recordId || '';
  }
}

function titleOf(
  nodes: WorkflowNode[] | undefined,
  key: string | null | undefined,
) {
  if (!key || !nodes) return '';
  return nodes.find((node) => node.key === key)?.title || '';
}

function briefKeysOf(
  nodes: WorkflowNode[] | undefined,
  nodeKey: string | null | undefined,
) {
  const list = nodes || [];
  const current = list.find((node) => node.key === nodeKey);
  if (current?.type === 'approve' || current?.type === 'cc') {
    return current.briefFieldKeys;
  }
  const approve = list.find((node) => node.type === 'approve');
  return approve?.type === 'approve' ? approve.briefFieldKeys : undefined;
}

function collectBriefOrgIds(
  fields: AppForm['fields'] | FormField[] | null | undefined,
  data: Record<string, unknown> | undefined,
  briefFieldKeys: string[] | undefined,
  userIds: Set<number>,
  deptIds: Set<number>,
) {
  const parsed = Array.isArray(fields)
    ? (fields as FormField[])
    : parseFormSchema(fields).fields;
  const flat = flattenFields(parsed);
  const allowed = new Set(
    Array.isArray(briefFieldKeys)
      ? briefFieldKeys
      : flat
          .filter((field) => DEFAULT_BRIEF_FIELD_TYPES.has(field.type))
          .map((field) => field.key),
  );
  for (const field of flat) {
    if (!allowed.has(field.key)) continue;
    if (field.type === 'member' || field.type === 'member-multiple') {
      collectPositiveIds(data?.[field.key], userIds);
    }
    if (field.type === 'dept' || field.type === 'dept-multiple') {
      collectPositiveIds(data?.[field.key], deptIds);
    }
  }
}

function collectPositiveIds(value: unknown, ids: Set<number>) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    ids.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPositiveIds(item, ids);
  }
}

function briefValueText(
  field: FormField,
  value: unknown,
  names: { users: Map<number, string>; depts: Map<number, string> },
): string {
  if (field.type === 'member' || field.type === 'member-multiple') {
    return namedIdsText(value, names.users);
  }
  if (field.type === 'dept' || field.type === 'dept-multiple') {
    return namedIdsText(value, names.depts);
  }
  if (value == null || value === '') return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => primitiveBriefText(item))
      .filter(Boolean)
      .join('、');
  }
  return primitiveBriefText(value);
}

function namedIdsText(value: unknown, names: Map<number, string>): string {
  const ids: number[] = [];
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    ids.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
        ids.push(item);
      }
    }
  }
  return ids.map((id) => names.get(id) || '已删除').join('、');
}

function primitiveBriefText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return '';
  return String(value);
}
