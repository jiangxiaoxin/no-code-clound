import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppForm } from '../app-form.entity';
import { flattenFields } from '../form-record/flatten-fields';
import { buildRecordQuery } from '../form-record/form-record.query';
import { FormRecordStore } from '../form-record/form-record.store';
import { FormField } from '../form-record/form-record.types';
import { parseFormSchema } from '../form-schema';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTask } from './workflow-task.entity';
import { FieldAccess } from './workflow.types';

@Injectable()
export class WorkflowRenderService {
  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowTask)
    private readonly taskRepo: Repository<WorkflowTask>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    private readonly store: FormRecordStore,
  ) {}

  async sourceRecords(
    instanceId: number,
    actorId: number,
    body: {
      fieldKey: string;
      filters?: { key: string; op: string; value: unknown }[];
      page?: number;
      pageSize?: number;
      keyword?: string;
    },
  ) {
    const { instance, form } = await this.requireReader(instanceId, actorId);
    const field = findField(form, body.fieldKey);
    const sourceFormId = Number(field?.sourceFormId || field?.linkage?.sourceFormId);
    if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
      throw new BadRequestException('该字段没有数据源');
    }
    const sourceForm = await this.formRepo.findOne({ where: { id: sourceFormId } });
    if (!sourceForm) throw new NotFoundException('源表不存在');
    if (sourceForm.applicationId !== instance.appId) {
      throw new BadRequestException('该字段的数据源不属于本应用，请联系应用配置者检查');
    }
    const fields = parseFormSchema(sourceForm.fields).fields;
    const filters = [...(body.filters || [])];
    if (body.keyword && fields?.[0]?.key) {
      filters.push({ key: fields[0].key, op: 'contains', value: body.keyword });
    }
    const built = buildRecordQuery(fields, {
      filters,
      page: body.page ?? 1,
      pageSize: body.pageSize ?? 20,
      pickApproved: sourceForm.formKind === 'workflow',
      formKind: sourceForm.formKind,
    });
    return this.store.query(sourceFormId, built);
  }

  async linkage(
    instanceId: number,
    actorId: number,
    body: { fieldKey: string; conditions?: { key: string; op: string; value: unknown }[] },
  ) {
    const { instance, form, writableKeys } = await this.requireReader(
      instanceId,
      actorId,
    );
    const field = findField(form, body.fieldKey);
    const linkage = field?.linkage as
      | {
          sourceFormId?: number;
          sourceKey?: string;
          fieldMappings?: { from: string; to: string }[];
        }
      | undefined;
    const sourceFormId = Number(linkage?.sourceFormId);
    if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
      return { data: {} };
    }
    const sourceForm = await this.formRepo.findOne({ where: { id: sourceFormId } });
    if (!sourceForm) return { data: {} };
    if (sourceForm.applicationId !== instance.appId) {
      throw new BadRequestException('该字段的数据源不属于本应用，请联系应用配置者检查');
    }
    const fields = parseFormSchema(sourceForm.fields).fields;
    const built = buildRecordQuery(fields, {
      filters: body.conditions || [],
      page: 1,
      pageSize: 2,
      pickApproved: sourceForm.formKind === 'workflow',
      formKind: sourceForm.formKind,
    });
    const result = await this.store.query(sourceFormId, built);
    const row = result.items[0]?.data ?? {};
    const data: Record<string, unknown> = {};
    const initiatorWritable =
      instance.initiatorId === actorId &&
      (instance.status === 'draft' ||
        instance.status === 'rejected' ||
        instance.status === 'error');
    for (const mapping of linkage?.fieldMappings || []) {
      const writable = initiatorWritable || writableKeys.has(mapping.to);
      if (!writable) continue;
      if (mapping.from in row) data[mapping.to] = row[mapping.from];
    }
    return { data };
  }

  async assertWritable(instanceId: number, actorId: number, fieldKey: string) {
    const { writableKeys, instance } = await this.requireReader(instanceId, actorId);
    const initiatorWritable =
      instance.initiatorId === actorId &&
      (instance.status === 'draft' ||
        instance.status === 'rejected' ||
        instance.status === 'error');
    if (initiatorWritable) return;
    if (writableKeys.has(fieldKey)) return;
    if (
      instance.initiatorId === actorId &&
      instance.status === 'running'
    ) {
      throw new BadRequestException('当前状态不能修改');
    }
    throw new BadRequestException('当前状态不能修改');
  }

  private async requireReader(instanceId: number, actorId: number) {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('单据不存在');
    const tasks = await this.taskRepo.find({ where: { instanceId } });
    const isInitiator = instance.initiatorId === actorId;
    const myTasks = tasks.filter((row) => row.assigneeId === actorId);
    if (!isInitiator && !myTasks.length) {
      throw new NotFoundException('单据不存在');
    }
    const form = await this.formRepo.findOne({ where: { id: instance.formId } });
    if (!form) throw new NotFoundException('表单不存在');
    const pending = myTasks.find(
      (row) => row.status === 'pending' && row.nodeKey === instance.currentNodeKey,
    );
    const node = instance.graph.nodes.find(
      (item) => item.key === instance.currentNodeKey,
    );
    const writableKeys = new Set<string>();
    if (pending && node?.type === 'approve') {
      for (const [key, access] of Object.entries(node.fieldAccess || {})) {
        if ((access as FieldAccess) === 'editable') writableKeys.add(key);
      }
    }
    return { instance, form, writableKeys };
  }
}

function findField(form: AppForm, key: string): (FormField & {
  sourceFormId?: number;
  linkage?: { sourceFormId?: number };
}) | undefined {
  return flattenFields(parseFormSchema(form.fields).fields).find(
    (item) => item.key === key,
  );
}
