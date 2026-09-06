import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppAccessService } from '../access/app-access.service';
import { AppForm } from '../app-form.entity';
import { WorkflowDefinitionService } from '../workflow/workflow-definition.service';
import { WorkflowEngine } from '../workflow/workflow.engine';
import { WorkflowInstance } from '../workflow/workflow-instance.entity';
import { WorkflowTask } from '../workflow/workflow-task.entity';
import { InstanceStatus } from '../workflow/workflow.types';
import {
  FormRecordPersistService,
  uniqueComparableValue,
} from './form-record.persist';
import { flattenFields } from './flatten-fields';
import {
  buildRecordQuery,
  dictCodesForFilters,
  RecordQueryBody,
  rewriteDictFilterValues,
} from './form-record.query';
import { FormRecordDoc, FormRecordStore } from './form-record.store';
import { parseFormSchema } from '../form-schema';
import { FormField } from './form-record.types';
import { User } from '../../user/user.entity';
import { DictionaryService } from '../dictionary/dictionary.service';
import {
  ADDRESS_IMPORT_NOTE,
  addressImportExample,
  headerFromCell,
  importableFields,
  importHeaders,
  MAX_IMPORT_FILE_SIZE,
  parseImportRows,
} from './form-record.import';
import ExcelJS from 'exceljs';

export type FormRecordView = {
  id: string;
  appId: number;
  formId: number;
  createdBy: number;
  createdByName: string;
  createdAt: Date;
  updatedBy: number;
  updatedByName: string;
  updatedAt: Date;
    data: Record<string, unknown>;
    userNames?: Record<string, string>;
    workflowStatus?: InstanceStatus;
    workflowInstanceId?: number;
    workflowInstance?: {
      id: number;
      initiatorId: number;
      status: InstanceStatus;
    };
    nextNodeTitle?: string;
    workflowHint?: string;
    canConfigure?: boolean;
    workflowProgress?: {
      graph: WorkflowInstance['graph'];
      visitedNodeKeys: string[];
      currentNodeKey: string | null;
      notes: WorkflowInstance['notes'];
      errorReason: string | null;
      tasks: {
        id: number;
        nodeKey: string;
        assigneeId: number;
        assigneeName: string;
        assigneeDisabled: boolean;
        status: string;
        action: string | null;
        comment: string | null;
        cancelReason: string | null;
        finishedAt: Date | null;
        createdAt: Date;
      }[];
    };
  };

@Injectable()
export class FormRecordService {
  constructor(
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly store: FormRecordStore,
    private readonly dictionaryService: DictionaryService,
    private readonly access: AppAccessService,
    private readonly persist: FormRecordPersistService,
    private readonly definition: WorkflowDefinitionService,
    private readonly engine: WorkflowEngine,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowTask)
    private readonly taskRepo: Repository<WorkflowTask>,
  ) {}

  async create(
    actorId: number,
    appId: number,
    formId: number,
    data: Record<string, unknown>,
    intent?: 'draft' | 'submit',
  ): Promise<FormRecordView> {
    const form = await this.requireForm(actorId, appId, formId);
    if (form.formKind !== 'workflow') {
      const doc = await this.persist.persist({ form, actorId, data });
      return this.toRecordView(doc, form);
    }
    const runtime = await this.definition.getRuntime(formId);
    if (!runtime.published) {
      throw new BadRequestException(
        '这张表单还没有配置流程，发布流程之后才能使用',
      );
    }
    if (!runtime.enabled) {
      const doc = await this.persist.persist({ form, actorId, data });
      await this.store.setWorkflowMeta(formId, doc._id.toHexString(), {
        workflowStatus: 'approved',
      });
      const saved = await this.store.findById(formId, doc._id.toHexString());
      return this.toRecordView(saved ?? doc, form);
    }
    const doc = await this.persist.persist({
      form,
      actorId,
      data,
      requiredKeys: 'all',
    });
    const recordId = doc._id.toHexString();
    let submitted: WorkflowInstance | null = null;
    if (intent === 'submit') {
      submitted = await this.engine.submit({ form, recordId, actorId });
    } else {
      await this.engine.ensureDraft({ form, recordId, actorId });
    }
    const saved = await this.store.findById(formId, recordId);
    return this.withNextNodeTitle(
      await this.toRecordView(saved ?? doc, form),
      submitted,
    );
  }

  async query(
    ownerId: number,
    appId: number,
    formId: number,
    body: RecordQueryBody,
  ) {
    const form = await this.requireForm(ownerId, appId, formId);
    const fields = this.readFields(form);
    const built = buildRecordQuery(fields, {
      ...body,
      formKind: form.formKind,
      filters: await this.resolveDictFilters(
        ownerId,
        appId,
        fields,
        body.filters,
      ),
      groups: body.groups
        ? await Promise.all(
            body.groups.map(async (group) => ({
              ...group,
              filters: await this.resolveDictFilters(
                ownerId,
                appId,
                fields,
                group.filters,
              ),
            })),
          )
        : body.groups,
    });
    const { items, total } = await this.store.query(formId, built);
    const names = await this.loadUserNames(items, fields);
    const userNames = this.userNamesRecord(names);
    const instances = await this.loadInstancesByIds(
      items
        .map((item) => item.workflowInstanceId)
        .filter((id): id is number => Number.isInteger(id)),
    );
    return {
      items: items.map((item) => {
        const view = this.toView(item, names);
        this.attachInstance(view, instances.get(item.workflowInstanceId ?? 0));
        return view;
      }),
      total,
      page: built.page,
      pageSize: built.pageSize,
      userNames,
    };
  }

  async getOne(
    ownerId: number,
    appId: number,
    formId: number,
    recordId: string,
  ): Promise<FormRecordView> {
    const form = await this.requireForm(ownerId, appId, formId);
    const doc = await this.store.findById(formId, recordId);
    if (!doc) throw new NotFoundException('记录不存在');
    const view = await this.attachProgress(
      await this.toRecordView(doc, form),
      form,
      doc,
    );
    const access = await this.access.getAccess(ownerId, appId);
    view.canConfigure = access.canConfigure;
    return view;
  }

  async update(
    actorId: number,
    appId: number,
    formId: number,
    recordId: string,
    data: Record<string, unknown>,
    intent?: 'draft' | 'submit',
  ): Promise<FormRecordView> {
    const form = await this.requireForm(actorId, appId, formId);
    if (form.formKind !== 'workflow') {
      const doc = await this.persist.persist({ form, actorId, data, recordId });
      return this.toRecordView(doc, form);
    }
    const runtime = await this.definition.getRuntime(formId);
    if (!runtime.published) {
      throw new BadRequestException(
        '这张表单还没有配置流程，发布流程之后才能使用',
      );
    }
    const existing = await this.store.findById(formId, recordId);
    if (!existing) throw new NotFoundException('记录不存在');
    const status = existing.workflowStatus as InstanceStatus | undefined;
    const instance = await this.findInstance(formId, recordId, existing.workflowInstanceId);

    if (status === 'running') {
      throw new BadRequestException(
        '审批中的数据不能编辑，请到「我发起的」撤回或等待审批',
      );
    }

    if (!runtime.enabled) {
      const doc = await this.persist.persist({ form, actorId, data, recordId });
      if (!status || status === 'approved' || !instance) {
        await this.store.setWorkflowMeta(formId, recordId, {
          workflowStatus: 'approved',
        });
      }
      const saved = await this.store.findById(formId, recordId);
      return this.toRecordView(saved ?? doc, form);
    }

    if (status === 'approved') {
      if (!instance) {
        throw new BadRequestException('这条数据没有审批记录，不能重新提交');
      }
      this.assertInitiator(instance, actorId);
      if (intent !== 'submit') {
        throw new BadRequestException('已通过的数据要重新提交审批，请点「提交」');
      }
      const doc = await this.persist.persist({
        form,
        actorId,
        data,
        recordId,
        requiredKeys: 'all',
      });
      const submitted = await this.engine.resubmitApproved({
        form,
        recordId,
        actorId,
      });
      const saved = await this.store.findById(formId, recordId);
      return this.withNextNodeTitle(
        await this.toRecordView(saved ?? doc, form),
        submitted,
      );
    }

    if (
      status === 'draft' ||
      status === 'rejected' ||
      status === 'error' ||
      !status
    ) {
      if (instance) this.assertInitiator(instance, actorId);
      const doc = await this.persist.persist({
        form,
        actorId,
        data,
        recordId,
        requiredKeys: 'all',
      });
      let submitted: WorkflowInstance | null = null;
      if (intent === 'submit') {
        submitted = await this.engine.submit({ form, recordId, actorId });
      } else {
        await this.engine.ensureDraft({ form, recordId, actorId });
      }
      const saved = await this.store.findById(formId, recordId);
      return this.withNextNodeTitle(
        await this.toRecordView(saved ?? doc, form),
        submitted,
      );
    }

    const doc = await this.persist.persist({ form, actorId, data, recordId });
    return this.toRecordView(doc, form);
  }

  async remove(
    ownerId: number,
    appId: number,
    formId: number,
    recordId: string,
  ): Promise<{ ok: true }> {
    const form = await this.requireForm(ownerId, appId, formId);
    const existing = await this.store.findById(formId, recordId);
    if (!existing) throw new NotFoundException('记录不存在');
    if (form.formKind === 'workflow') {
      const status = existing.workflowStatus as InstanceStatus | undefined;
      const instance = await this.findInstance(
        formId,
        recordId,
        existing.workflowInstanceId,
      );
      if (status === 'running') {
        throw new BadRequestException('审批中的数据不能删除');
      }
      if (
        status === 'draft' ||
        status === 'rejected' ||
        status === 'error'
      ) {
        if (!instance || instance.initiatorId !== ownerId) {
          throw new ForbiddenException('只有发起人能修改这条数据');
        }
      }
    }
    const deleted = await this.store.deleteById(formId, recordId);
    if (!deleted) throw new NotFoundException('记录不存在');
    if (form.formKind === 'workflow') {
      await this.engine.onRecordDeleted(formId, recordId);
    }
    return { ok: true };
  }

  async buildImportTemplate(
    ownerId: number,
    appId: number,
    formId: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const form = await this.requireForm(ownerId, appId, formId);
    const fields = importableFields(this.readFields(form));
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('数据');
    const headers = importHeaders(fields);
    const headerRow = sheet.addRow(headers);
    const hasAddress = fields.some((field) => field.type === 'address');
    if (hasAddress) {
      fields.forEach((field, index) => {
        if (field.type !== 'address') return;
        headerRow.getCell(index + 1).note = ADDRESS_IMPORT_NOTE;
      });
      sheet.addRow(
        fields.map((field) =>
          field.type === 'address' ? addressImportExample(field) : '',
        ),
      );
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const name = (form.name || '表单').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    return { buffer, filename: `${name}-导入模版.xlsx` };
  }

  async importFromExcel(
    ownerId: number,
    appId: number,
    formId: number,
    file?: { buffer?: Buffer; size?: number; originalname?: string },
  ): Promise<{ imported: number }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择要导入的文件');
    }
    if ((file.size || file.buffer.length) > MAX_IMPORT_FILE_SIZE) {
      throw new BadRequestException('文件不能超过 10MB');
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('请上传 xlsx 文件');
    }
    const form = await this.requireForm(ownerId, appId, formId);
    const fields = this.readFields(form);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { imported: 0 };
    }
    let headers: string[] = [];
    const rows: unknown[][] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        const count = Math.max(row.cellCount, 1);
        headers = Array.from({ length: count }, (_, index) =>
          headerFromCell(row.getCell(index + 1).value),
        );
        return;
      }
      rows.push(
        headers.map((_, index) => row.getCell(index + 1).value),
      );
    });
    const codes = [
      ...new Set(
        importableFields(fields)
          .map((field) => field.dictCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    const dictRows = codes.length
      ? await this.dictionaryService.listEnabledItemsByCodes(
          ownerId,
          appId,
          codes,
        )
      : [];
    const dictItemsByCode = Object.fromEntries(
      dictRows.map((row) => [row.code, row.items || []]),
    );
    const parsed = parseImportRows(headers, rows, fields, dictItemsByCode);
    const now = new Date();
    const docs: Omit<FormRecordDoc, '_id'>[] = [];
    const seen = new Map<string, Set<string | number>>();
    for (const data of parsed) {
      let skip = false;
      for (const field of flattenFields(fields ?? [])) {
        const value = uniqueComparableValue(field, data[field.key]);
        if (value === undefined) continue;
        let bucket = seen.get(field.key);
        if (!bucket) {
          bucket = new Set();
          seen.set(field.key, bucket);
        }
        if (
          bucket.has(value) ||
          (await this.store.existsByDataValue(formId, field.key, value))
        ) {
          skip = true;
          break;
        }
        bucket.add(value);
      }
      if (skip) continue;
      await this.persist.applySerialNumber(formId, fields, data);
      docs.push({
        appId,
        formId,
        createdBy: ownerId,
        createdAt: now,
        updatedBy: ownerId,
        updatedAt: now,
        data,
      });
    }
    const imported = await this.store.insertMany(docs);
    return { imported };
  }

  private async requireForm(ownerId: number, appId: number, formId: number) {
    await this.access.requireUse(ownerId, appId);
    const form = await this.formRepo.findOne({
      where: { id: formId, applicationId: appId },
    });
    if (!form) throw new NotFoundException('表单不存在');
    return form;
  }

  private readFields(form: AppForm): FormField[] | null {
    return parseFormSchema(form.fields).fields;
  }

  private async resolveDictFilters(
    ownerId: number,
    appId: number,
    fields: FormField[] | null,
    filters: RecordQueryBody['filters'],
  ) {
    const codes = dictCodesForFilters(fields, filters);
    if (!codes.length) return filters;
    const rows = await this.dictionaryService.listEnabledItemsByCodes(
      ownerId,
      appId,
      codes,
    );
    const itemsByCode = new Map(
      rows.map((row) => [row.code, row.items] as const),
    );
    return rewriteDictFilterValues(fields, filters, itemsByCode);
  }

  private async loadUserNames(
    docs: FormRecordDoc[],
    fields?: FormField[] | null,
  ): Promise<Map<number, string>> {
    const ids = new Set<number>();
    for (const doc of docs) {
      if (Number.isFinite(doc.createdBy)) ids.add(doc.createdBy);
      const updatedBy = doc.updatedBy ?? doc.createdBy;
      if (Number.isFinite(updatedBy)) ids.add(updatedBy);
      collectMemberIds(fields ?? [], doc.data ?? {}, ids);
    }
    const names = new Map<number, string>();
    if (!ids.size) return names;
    const users = await this.userRepo.find({
      where: { id: In([...ids]) },
      select: { id: true, displayName: true },
    });
    for (const user of users) {
      names.set(user.id, user.displayName);
    }
    return names;
  }

  private userNamesRecord(names: Map<number, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, name] of names) {
      out[String(id)] = name;
    }
    return out;
  }

  private async toRecordView(
    doc: FormRecordDoc,
    form: AppForm,
  ): Promise<FormRecordView> {
    const view = this.toView(
      doc,
      await this.loadUserNames([doc], this.readFields(form)),
    );
    if (doc.workflowInstanceId) {
      const inst = await this.instanceRepo.findOne({
        where: { id: doc.workflowInstanceId },
      });
      this.attachInstance(view, inst);
    }
    return view;
  }

  private attachInstance(
    view: FormRecordView,
    inst: WorkflowInstance | null | undefined,
  ) {
    if (!inst) return;
    view.workflowInstance = {
      id: inst.id,
      initiatorId: inst.initiatorId,
      status: inst.status,
    };
  }

  private withNextNodeTitle(
    view: FormRecordView,
    instance: WorkflowInstance | null | undefined,
  ) {
    const title = instance
      ? instance.graph.nodes.find((node) => node.key === instance.currentNodeKey)
          ?.title
      : undefined;
    if (title) view.nextNodeTitle = title;
    return view;
  }

  private async loadInstancesByIds(ids: number[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<number, WorkflowInstance>();
    const rows = await this.instanceRepo.find({ where: { id: In(unique) } });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async attachProgress(
    view: FormRecordView,
    form: AppForm,
    doc: FormRecordDoc,
  ): Promise<FormRecordView> {
    if (form.formKind !== 'workflow') return view;
    if (!doc.workflowInstanceId) {
      if (doc.workflowStatus === 'approved') {
        const runtime = await this.definition.getRuntime(form.id);
        view.workflowHint = runtime?.enabled
          ? '转为流程表单之前保存，没有审批记录'
          : '流程停用期间保存，没有审批记录';
      }
      return view;
    }
    const inst = await this.instanceRepo.findOne({
      where: { id: doc.workflowInstanceId },
    });
    if (!inst) return view;
    const tasks = await this.taskRepo.find({
      where: { instanceId: inst.id },
      order: { createdAt: 'ASC' },
    });
    const userIds = [...new Set(tasks.map((row) => row.assigneeId))];
    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    const disabled = new Set(
      users.filter((user) => user.status !== 'active').map((user) => user.id),
    );
    view.workflowProgress = {
      graph: inst.graph,
      visitedNodeKeys: inst.visitedNodeKeys || [],
      currentNodeKey: inst.currentNodeKey,
      notes: inst.notes,
      errorReason: inst.errorReason,
      tasks: tasks.map((row) => ({
        id: row.id,
        nodeKey: row.nodeKey,
        assigneeId: row.assigneeId,
        assigneeName: names.get(row.assigneeId) || '',
        assigneeDisabled: disabled.has(row.assigneeId),
        status: row.status,
        action: row.action,
        comment: row.comment,
        cancelReason: row.cancelReason,
        finishedAt: row.finishedAt,
        createdAt: row.createdAt,
      })),
    };
    return view;
  }

  private async findInstance(
    formId: number,
    recordId: string,
    workflowInstanceId?: number,
  ) {
    if (workflowInstanceId) {
      return this.instanceRepo.findOne({ where: { id: workflowInstanceId } });
    }
    return this.instanceRepo.findOne({ where: { formId, recordId } });
  }

  private assertInitiator(
    instance: { initiatorId: number },
    actorId: number,
  ) {
    if (instance.initiatorId !== actorId) {
      throw new ForbiddenException('只有发起人能修改这条数据');
    }
  }

  private toView(
    doc: FormRecordDoc,
    names: Map<number, string>,
  ): FormRecordView {
    const updatedBy = doc.updatedBy ?? doc.createdBy;
    const view: FormRecordView = {
      id: doc._id.toHexString(),
      appId: doc.appId,
      formId: doc.formId,
      createdBy: doc.createdBy,
      createdByName: names.get(doc.createdBy) ?? '',
      createdAt: doc.createdAt,
      updatedBy,
      updatedByName: names.get(updatedBy) ?? '',
      updatedAt: doc.updatedAt ?? doc.createdAt,
      data: doc.data ?? {},
      userNames: this.userNamesRecord(names),
    };
    if (doc.workflowStatus) {
      view.workflowStatus = doc.workflowStatus as InstanceStatus;
    }
    if (doc.workflowInstanceId) {
      view.workflowInstanceId = doc.workflowInstanceId;
    }
    return view;
  }
}

function collectMemberIds(
  fields: FormField[],
  data: Record<string, unknown>,
  ids: Set<number>,
) {
  for (const field of flattenFields(fields)) {
    if (field.type === 'subform') {
      const rows = Array.isArray(data[field.key])
        ? (data[field.key] as unknown[])
        : [];
      for (const row of rows) {
        if (row && typeof row === 'object') {
          collectMemberIds(
            field.fields || [],
            row as Record<string, unknown>,
            ids,
          );
        }
      }
      continue;
    }
    if (field.type === 'member') {
      const value = data[field.key];
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        ids.add(value);
      }
    }
    if (field.type === 'member-multiple' && Array.isArray(data[field.key])) {
      for (const item of data[field.key] as unknown[]) {
        if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
          ids.add(item);
        }
      }
    }
  }
}
