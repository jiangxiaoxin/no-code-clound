import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppForm } from './app-form.entity';
import { AppFormConfig } from './app-form-config.entity';
import { AppGroup } from './app-group.entity';
import { Application } from './application.entity';
import { AppAccessService } from './access/app-access.service';
import { FormDataAccessService } from './form-data-access.service';
import { AppConfigurator } from './access/app-configurator.entity';
import { AppAccessScope } from './access/app-access-scope.entity';
import { Dictionary } from './dictionary/dictionary.entity';
import { DictionaryItem } from './dictionary/dictionary-item.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ConvertFormKindDto } from './dto/convert-form-kind.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { NameDto } from './dto/name.dto';
import { flattenFields } from './form-record/flatten-fields';
import { FormField } from './form-record/form-record.types';
import { FormRecordStore } from './form-record/form-record.store';
import { FormSerialSeq } from './form-record/form-serial-seq.entity';
import { WorkflowDefinition } from './workflow/workflow-definition.entity';
import { WorkflowInstance } from './workflow/workflow-instance.entity';
import { WorkflowTask } from './workflow/workflow-task.entity';
import { WorkflowVersion } from './workflow/workflow-version.entity';
import { mergeFormConfig, normalizeFormConfig } from './form-config';
import { normalizeFormViewers } from './form-data-access';
import { startNodeOf } from './workflow/workflow.graph';
import { parseFormSchema, serializeFormSchema } from './form-schema';
import { assertSerialSchema } from './form-record/serial-number';

const OPTION_FIELD_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'radio',
  'checkbox',
  'select',
  'select-multiple',
  'image',
  'file',
  'address',
  'serialNumber',
  'member',
  'member-multiple',
  'dept',
  'dept-multiple',
]);

const ICON_COLORS = [
  '#E8A317',
  '#2F6BFF',
  '#7B61FF',
  '#3DB8F5',
  '#12B5A0',
  '#F25C54',
];

export type OptionField = {
  key: string;
  title: string;
  type: string;
  dictCode?: string;
  optionSource?: string;
  /** 关联数据指向的主表，仅 include=relate 时返回 */
  sourceFormId?: number;
  fields?: OptionField[];
};

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(AppGroup)
    private readonly groupRepo: Repository<AppGroup>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    @InjectRepository(AppFormConfig)
    private readonly formConfigRepo: Repository<AppFormConfig>,
    @InjectRepository(Dictionary)
    private readonly dictRepo: Repository<Dictionary>,
    @InjectRepository(DictionaryItem)
    private readonly itemRepo: Repository<DictionaryItem>,
    @InjectRepository(FormSerialSeq)
    private readonly serialSeqRepo: Repository<FormSerialSeq>,
    @InjectRepository(WorkflowDefinition)
    private readonly workflowDefinitionRepo: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowVersion)
    private readonly workflowVersionRepo: Repository<WorkflowVersion>,
    @InjectRepository(WorkflowInstance)
    private readonly workflowInstanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowTask)
    private readonly workflowTaskRepo: Repository<WorkflowTask>,
    private readonly formRecordStore: FormRecordStore,
    private readonly access: AppAccessService,
    private readonly formData: FormDataAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async list(ownerId: number): Promise<
    {
      id: number;
      name: string;
      icon: string;
      isOwner: boolean;
      canConfigure: boolean;
    }[]
  > {
    return this.access.listAccessible(ownerId);
  }

  async create(
    ownerId: number,
    dto: CreateApplicationDto,
  ): Promise<{
    id: number;
    name: string;
    icon: string;
    isOwner: boolean;
    canConfigure: boolean;
  }> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请输入应用名称');
    }

    const saved = await this.appRepo.save(
      this.appRepo.create({
        name,
        icon: this.pickIcon(name),
        ownerId,
      }),
    );
    return { ...this.toAppItem(saved), isOwner: true, canConfigure: true };
  }

  async getOne(
    ownerId: number,
    id: number,
  ): Promise<{
    id: number;
    name: string;
    icon: string;
    canConfigure: boolean;
    isOwner: boolean;
  }> {
    const access = await this.access.getAccess(ownerId, id);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    return {
      ...this.toAppItem(access.app),
      canConfigure: access.canConfigure,
      isOwner: access.isOwner,
    };
  }

  async renameApp(
    ownerId: number,
    id: number,
    dto: NameDto,
  ): Promise<{ id: number; name: string; icon: string }> {
    const app = await this.access.requireConfigure(ownerId, id);
    app.name = this.requireName(dto.name);
    const saved = await this.appRepo.save(app);
    return this.toAppItem(saved);
  }

  async deleteApp(ownerId: number, id: number): Promise<void> {
    const app = await this.access.requireOwner(ownerId, id);
    const forms = await this.formRepo.find({
      where: { applicationId: id },
    });
    const formIds = forms.map((form) => form.id);
    const dicts = await this.dictRepo.find({
      where: { applicationId: id },
    });
    const dictIds = dicts.map((row) => row.id);
    const instanceIds = (
      await this.workflowInstanceRepo.find({
        where: { appId: id },
        select: { id: true },
      })
    ).map((row) => row.id);

    // MySQL 侧一个事务全删或全不删，不会留下看得见的空壳；Mongo 集合没法进事务，
    // 放在最后删：失败时只留下没人能看见的孤儿集合
    await this.dataSource.transaction(async (txn) => {
      if (instanceIds.length) {
        await txn.delete(WorkflowTask, { instanceId: In(instanceIds) });
      }
      await txn.delete(WorkflowInstance, { appId: id });
      await txn.delete(WorkflowVersion, { appId: id });
      await txn.delete(WorkflowDefinition, { appId: id });
      if (formIds.length) {
        await txn.delete(FormSerialSeq, { formId: In(formIds) });
        await txn.delete(AppFormConfig, { formId: In(formIds) });
      }
      if (dictIds.length) {
        await txn.delete(DictionaryItem, { dictionaryId: In(dictIds) });
      }
      await txn.delete(Dictionary, { applicationId: id });
      await txn.delete(AppForm, { applicationId: id });
      await txn.delete(AppGroup, { applicationId: id });
      await txn.delete(AppConfigurator, { appId: id });
      await txn.delete(AppAccessScope, { appId: id });
      await txn.remove(Application, app);
    });

    await this.formRecordStore.dropAppCollections(id, formIds);
  }

  async getForm(ownerId: number, appId: number, formId: number) {
    const access = await this.access.getAccess(ownerId, appId);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    const form = await this.requireForm(appId, formId);
    await this.formData.assertCanViewForm(ownerId, access, formId);
    const def = await this.workflowDefinitionRepo.findOne({ where: { formId } });
    const enabled = await this.workflowVersionRepo.findOne({
      where: { formId, enabled: true },
    });
    const startAccess = startNodeOf(enabled?.graph)?.fieldAccess;
    return {
      ...this.toFormDetail(form),
      ...this.toWorkflowFlags(Boolean(def?.hasBeenEnabled), Boolean(enabled)),
      ...(startAccess && Object.keys(startAccess).length
        ? { startFieldAccess: startAccess }
        : {}),
    };
  }

  async saveFields(
    ownerId: number,
    appId: number,
    formId: number,
    fields: unknown,
    columns?: number,
  ) {
    if (!Array.isArray(fields)) {
      throw new BadRequestException('请提交字段列表');
    }
    await this.access.requireConfigure(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    const flat = flattenFields(fields as FormField[]);
    assertSerialSchema(flat);
    await this.assertSourceFormsInApp(appId, flat);
    form.fields = serializeFormSchema(
      fields as Record<string, unknown>[],
      columns,
    ) as AppForm['fields'];
    const saved = await this.formRepo.save(form);
    await this.formRecordStore.syncIndexes(
      formId,
      parseFormSchema(saved.fields).fields,
    );
    return this.toFormDetail(saved);
  }

  async listFormFields(
    ownerId: number,
    appId: number,
    excludeFormId?: number,
    include?: string,
  ): Promise<{ id: number; name: string; fields: OptionField[] }[]> {
    const access = await this.access.getAccess(ownerId, appId);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    const forms = await this.formRepo.find({
      where: { applicationId: appId },
      order: { createdAt: 'DESC' },
    });
    const visible = await this.formData.filterVisibleFormIds(
      ownerId,
      access,
      forms.map((form) => form.id),
    );
    const exclude =
      Number.isInteger(excludeFormId) && (excludeFormId as number) > 0
        ? excludeFormId
        : undefined;
    const includeSubform = include === 'subform';
    const includeRelate = include === 'relate';

    const result: { id: number; name: string; fields: OptionField[] }[] = [];
    for (const form of forms) {
      if (!visible.has(form.id)) continue;
      if (exclude != null && form.id === exclude) {
        continue;
      }
      const fields = this.toOptionFields(
        flattenFields(parseFormSchema(form.fields).fields),
        includeSubform,
        includeRelate,
      );
      if (!fields.length) {
        continue;
      }
      result.push({ id: form.id, name: form.name, fields });
    }
    return result;
  }

  async getFormConfig(ownerId: number, appId: number, formId: number) {
    const access = await this.access.getAccess(ownerId, appId);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    await this.requireForm(appId, formId);
    await this.formData.assertCanViewForm(ownerId, access, formId);
    const row = await this.formConfigRepo.findOne({ where: { formId } });
    const config = this.toFormConfig(row?.config);
    return {
      ...config,
      formViewers: await this.formData.decorateViewers(
        normalizeFormViewers(config.formViewers),
      ),
    };
  }

  async saveFormConfig(
    ownerId: number,
    appId: number,
    formId: number,
    config: unknown,
  ) {
    await this.access.requireConfigure(ownerId, appId);
    await this.requireForm(appId, formId);
    const existing = await this.formConfigRepo.findOne({ where: { formId } });
    const next = mergeFormConfig(existing?.config, config);
    let row = existing;
    if (!row) {
      row = this.formConfigRepo.create({ formId, config: next });
    } else {
      row.config = next;
    }
    const saved = await this.formConfigRepo.save(row);
    return this.toFormConfig(saved.config);
  }

  async directory(ownerId: number, id: number) {
    const access = await this.access.getAccess(ownerId, id);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    const groups = await this.groupRepo.find({
      where: { applicationId: id },
      order: { createdAt: 'DESC' },
    });
    const forms = await this.formRepo.find({
      where: { applicationId: id },
      order: { createdAt: 'DESC' },
    });
    const visible = await this.formData.filterVisibleFormIds(
      ownerId,
      access,
      forms.map((form) => form.id),
    );
    const visibleForms = forms.filter((form) => visible.has(form.id));

    const formIds = visibleForms.map((form) => form.id);
    const defs = formIds.length
      ? await this.workflowDefinitionRepo.find({
          where: { formId: In(formIds) },
        })
      : [];
    const enabledRows = formIds.length
      ? await this.workflowVersionRepo.find({
          where: { formId: In(formIds), enabled: true },
        })
      : [];
    const defByForm = new Map(defs.map((row) => [row.formId, row]));
    const enabledFormIds = new Set(enabledRows.map((row) => row.formId));
    const formsByGroup = new Map<
      number,
      ReturnType<ApplicationService['toFormItem']>[]
    >();
    const rootForms: ReturnType<ApplicationService['toFormItem']>[] = [];
    for (const form of visibleForms) {
      const item = {
        ...this.toFormItem(form),
        ...this.toWorkflowFlags(
          Boolean(defByForm.get(form.id)?.hasBeenEnabled),
          enabledFormIds.has(form.id),
        ),
      };
      if (form.groupId == null) {
        rootForms.push(item);
        continue;
      }
      const list = formsByGroup.get(form.groupId) ?? [];
      list.push(item);
      formsByGroup.set(form.groupId, list);
    }

    return {
      canConfigure: access.canConfigure,
      isOwner: access.isOwner,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        forms: formsByGroup.get(group.id) ?? [],
      })),
      forms: rootForms,
    };
  }

  async createGroup(ownerId: number, appId: number, dto: NameDto) {
    await this.access.requireConfigure(ownerId, appId);
    const saved = await this.groupRepo.save(
      this.groupRepo.create({
        applicationId: appId,
        name: this.requireName(dto.name),
      }),
    );
    return { id: saved.id, name: saved.name };
  }

  async renameGroup(
    ownerId: number,
    appId: number,
    groupId: number,
    dto: NameDto,
  ) {
    await this.access.requireConfigure(ownerId, appId);
    const group = await this.requireGroup(appId, groupId);
    group.name = this.requireName(dto.name);
    const saved = await this.groupRepo.save(group);
    return { id: saved.id, name: saved.name };
  }

  async deleteGroup(ownerId: number, appId: number, groupId: number) {
    await this.access.requireConfigure(ownerId, appId);
    const group = await this.requireGroup(appId, groupId);
    const formCount = await this.formRepo.count({
      where: { applicationId: appId, groupId },
    });
    if (formCount > 0) {
      throw new BadRequestException('请先删除分组内的表单');
    }
    await this.groupRepo.remove(group);
  }

  async createForm(ownerId: number, appId: number, dto: CreateFormDto) {
    await this.access.requireConfigure(ownerId, appId);
    const groupId = dto.groupId ?? null;
    if (groupId != null) {
      const group = await this.groupRepo.findOne({
        where: { id: groupId, applicationId: appId },
      });
      if (!group) {
        throw new BadRequestException('分组不存在');
      }
    }
    const saved = await this.formRepo.save(
      this.formRepo.create({
        applicationId: appId,
        groupId,
        name: this.requireName(dto.name),
        formKind: dto.formKind ?? 'normal',
      }),
    );
    return this.toFormItem(saved);
  }

  async convertFormKind(
    ownerId: number,
    appId: number,
    formId: number,
    dto: ConvertFormKindDto,
  ) {
    await this.access.requireConfigure(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    if (form.formKind === 'workflow') {
      throw new BadRequestException('流程表单不能转回普通表单');
    }
    if (dto.formKind !== 'workflow') {
      throw new BadRequestException('请指定转为流程表单');
    }
    form.formKind = 'workflow';
    const saved = await this.formRepo.save(form);
    await this.formRecordStore.backfillApprovedMissing(formId);
    return this.toFormItem(saved);
  }

  async renameForm(
    ownerId: number,
    appId: number,
    formId: number,
    dto: NameDto,
  ) {
    await this.access.requireConfigure(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    form.name = this.requireName(dto.name);
    const saved = await this.formRepo.save(form);
    return this.toFormItem(saved);
  }

  async deleteForm(ownerId: number, appId: number, formId: number) {
    await this.access.requireConfigure(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    await this.deleteWorkflowByForm(formId);
    await this.formRepo.remove(form);
    try {
      await this.formRecordStore.dropFormCollection(formId);
    } catch (err) {
      this.logger.error(
        `drop form collection failed formId=${formId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async deleteWorkflowByForm(formId: number) {
    const instances = await this.workflowInstanceRepo.find({
      where: { formId },
      select: { id: true },
    });
    const instanceIds = instances.map((row) => row.id);
    if (instanceIds.length) {
      await this.workflowTaskRepo.delete({ instanceId: In(instanceIds) });
    }
    await this.workflowInstanceRepo.delete({ formId });
    await this.workflowVersionRepo.delete({ formId });
    await this.workflowDefinitionRepo.delete({ formId });
  }

  private async requireGroup(applicationId: number, groupId: number) {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, applicationId },
    });
    if (!group) {
      throw new NotFoundException('分组不存在');
    }
    return group;
  }

  private async requireForm(applicationId: number, formId: number) {
    const form = await this.formRepo.findOne({
      where: { id: formId, applicationId },
    });
    if (!form) {
      throw new NotFoundException('表单不存在');
    }
    return form;
  }

  private requireName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('请输入名称');
    }
    return trimmed;
  }

  private toAppItem(row: Application): { id: number; name: string; icon: string } {
    return { id: row.id, name: row.name, icon: row.icon };
  }

  private toWorkflowFlags(hasBeenEnabled: boolean, enabledNow: boolean) {
    return {
      workflowPublished: Boolean(hasBeenEnabled),
      workflowEnabled: Boolean(enabledNow),
    };
  }

  private toFormItem(row: AppForm): {
    id: number;
    name: string;
    groupId: number | null;
    formKind: 'normal' | 'workflow';
  } {
    return {
      id: row.id,
      name: row.name,
      groupId: row.groupId,
      formKind: row.formKind === 'workflow' ? 'workflow' : 'normal',
    };
  }

  private toFormDetail(row: AppForm) {
    const schema = parseFormSchema(row.fields);
    return {
      ...this.toFormItem(row),
      fields: schema.fields,
      columns: schema.columns,
    };
  }

  // 选择数据/关联数据的数据源只能指向本应用的表：不校验的话渲染接口会把别的应用的数据带出来
  private async assertSourceFormsInApp(appId: number, fields: FormField[]) {
    const ids = new Set<number>();
    for (const field of fields) {
      const raw = field as FormField & {
        sourceFormId?: unknown;
        linkage?: { sourceFormId?: unknown } | null;
      };
      for (const value of [raw.sourceFormId, raw.linkage?.sourceFormId]) {
        const id = Number(value);
        if (Number.isInteger(id) && id > 0) ids.add(id);
      }
    }
    if (!ids.size) return;
    const rows = await this.formRepo.find({ where: { id: In([...ids]) } });
    const owns = (id: number) =>
      rows.some((row) => row.id === id && row.applicationId === appId);
    if (![...ids].every(owns)) {
      throw new BadRequestException('选择数据、关联数据的数据源必须是本应用里的表');
    }
  }

  private normalizeFormConfig(value: unknown): Record<string, unknown> {
    return normalizeFormConfig(value);
  }

  private toFormConfig(value: Record<string, unknown> | null | undefined) {
    return this.normalizeFormConfig(value);
  }

  private toOptionFields(
    raw: Record<string, unknown>[] | null,
    includeSubform = false,
    includeRelate = false,
  ): OptionField[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const fields: OptionField[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const type = typeof item.type === 'string' ? item.type : '';
      const key = typeof item.key === 'string' ? item.key : '';
      if (!key) {
        continue;
      }
      if (type === 'subform' && includeSubform) {
        fields.push({
          key,
          title: typeof item.title === 'string' ? item.title : '',
          type,
          fields: this.toOptionFields(
            Array.isArray(item.fields)
              ? (item.fields as Record<string, unknown>[])
              : [],
            false,
            false,
          ),
        });
        continue;
      }
      if (type === 'relate') {
        if (!includeRelate) {
          continue;
        }
        const sourceFormId = Number(item.sourceFormId);
        if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
          continue;
        }
        fields.push({
          key,
          title: typeof item.title === 'string' ? item.title : '',
          type,
          sourceFormId,
        });
        continue;
      }
      if (!OPTION_FIELD_TYPES.has(type)) {
        continue;
      }
      const next: OptionField = {
        key,
        title: typeof item.title === 'string' ? item.title : '',
        type,
      };
      if (item.dictCode != null && item.dictCode !== '') {
        next.dictCode = String(item.dictCode);
      }
      if (typeof item.optionSource === 'string' && item.optionSource) {
        next.optionSource = item.optionSource;
      }
      fields.push(next);
    }
    return fields;
  }

  private pickIcon(name: string): string {
    let hash = 0;
    for (const ch of name) {
      hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
    return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
  }
}
