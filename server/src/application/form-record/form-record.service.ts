import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppForm } from '../app-form.entity';
import { Application } from '../application.entity';
import { coerceRecordData, mergeRecordData } from './form-record.coerce';
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
import { FormSerialSeqService } from './form-serial-seq.service';
import {
  findSerialField,
  periodKey,
  renderSerialValue,
} from './serial-number';

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
  };

@Injectable()
export class FormRecordService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly store: FormRecordStore,
    private readonly dictionaryService: DictionaryService,
    private readonly serialSeq: FormSerialSeqService,
  ) {}

  async create(
    ownerId: number,
    appId: number,
    formId: number,
    data: Record<string, unknown>,
  ): Promise<FormRecordView> {
    const form = await this.requireForm(ownerId, appId, formId);
    const fields = this.readFields(form);
    const coerced = coerceRecordData(fields, data); // 强制转换
    this.assertSubformConstraints(fields, coerced);
    await this.assertUniqueFields(formId, fields, coerced);
    await this.applySerialNumber(formId, fields, coerced);
    const now = new Date();
    const inserted = await this.store.insert({
      appId,
      formId,
      createdBy: ownerId,
      createdAt: now,
      updatedBy: ownerId,
      updatedAt: now,
      data: coerced,
    });
    const doc = await this.store.findById(formId, inserted.id);
    if (!doc) throw new NotFoundException('记录不存在');
    return this.toView(doc, await this.loadUserNames([doc], fields));
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
    return {
      items: items.map((item) => this.toView(item, names)),
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
    return this.toView(
      doc,
      await this.loadUserNames([doc], this.readFields(form)),
    );
  }

  async update(
    ownerId: number,
    appId: number,
    formId: number,
    recordId: string,
    data: Record<string, unknown>,
  ): Promise<FormRecordView> {
    const form = await this.requireForm(ownerId, appId, formId);
    const existing = await this.store.findById(formId, recordId);
    if (!existing) throw new NotFoundException('记录不存在');
    const fields = this.readFields(form);
    const merged = mergeRecordData(existing.data ?? {}, data, fields);
    this.assertSubformConstraints(fields, merged);
    await this.assertUniqueFields(formId, fields, merged, recordId);
    const doc = await this.store.replaceData(formId, recordId, merged, ownerId);
    if (!doc) throw new NotFoundException('记录不存在');
    return this.toView(doc, await this.loadUserNames([doc], fields));
  }

  async remove(
    ownerId: number,
    appId: number,
    formId: number,
    recordId: string,
  ): Promise<{ ok: true }> {
    await this.requireForm(ownerId, appId, formId);
    const deleted = await this.store.deleteById(formId, recordId);
    if (!deleted) throw new NotFoundException('记录不存在');
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
      await this.applySerialNumber(formId, fields, data);
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

  private assertSubformConstraints(
    fields: FormField[] | null,
    data: Record<string, unknown>,
  ) {
    for (const field of flattenFields(fields ?? [])) {
      if (field.type !== 'subform') {
        continue;
      }
      const rows = Array.isArray(data[field.key])
        ? (data[field.key] as Record<string, unknown>[])
        : [];
      if (field.required && rows.length === 0) {
        throw new BadRequestException(
          `[${field.title || '未命名'}]不能为空`,
        );
      }
      const children = field.fields ?? [];
      for (const row of rows) {
        for (const child of children) {
          if (!child.required) {
            continue;
          }
          if (isSubformChildEmpty(child, row[child.key])) {
            throw new BadRequestException(
              `[${field.title || '未命名'}.${child.title || '未命名'}]不能为空`,
            );
          }
        }
      }
      for (const child of children) {
        if (!child.unique && !child.uniqueInRows) {
          continue;
        }
        const seen = new Set<string | number>();
        for (const row of rows) {
          const value = uniqueChildComparableValue(child, row[child.key]);
          if (value === undefined) {
            continue;
          }
          if (seen.has(value)) {
            throw new ConflictException(
              `[${child.title || '未命名'}]同一子表内不允许重复值`,
            );
          }
          seen.add(value);
        }
      }
    }
  }

  private async applySerialNumber(
    formId: number,
    fields: FormField[] | null,
    data: Record<string, unknown>,
  ) {
    const field = findSerialField(fields);
    if (!field?.key) return;
    const rule = Array.isArray(field.serialRule) ? field.serialRule : [];
    const counter = rule.find((item) => item.kind === 'counter');
    const now = new Date();
    let counterValue: number | undefined;
    if (counter) {
      const rawStart = Number(counter.start);
      const start = Number.isInteger(rawStart) && rawStart >= 0 ? rawStart : 1;
      const bucket = periodKey(Boolean(counter.reset), counter.resetPeriod, now);
      counterValue = await this.serialSeq.takeNext(
        formId,
        field.key,
        bucket,
        start,
      );
    }
    data[field.key] = renderSerialValue(field, data, now, counterValue);
  }

  private async assertUniqueFields(
    formId: number,
    fields: FormField[] | null,
    data: Record<string, unknown>,
    excludeRecordId?: string,
  ) {
    for (const field of flattenFields(fields ?? [])) {
      if (field.type === 'subform') {
        const rows = Array.isArray(data[field.key])
          ? (data[field.key] as Record<string, unknown>[])
          : [];
        for (const child of field.fields ?? []) {
          if (!child.unique) {
            continue;
          }
          for (const row of rows) {
            const value = uniqueComparableValue(child, row[child.key]);
            if (value === undefined) {
              continue;
            }
            const exists = await this.store.existsByDataValue(
              formId,
              `${field.key}.${child.key}`,
              value,
              excludeRecordId,
            );
            if (exists) {
              throw new ConflictException(
                `[${child.title || '未命名'}]不允许重复值`,
              );
            }
          }
        }
        continue;
      }
      // 目前进对[单行文本]进行重复值检测
      const value = uniqueComparableValue(field, data[field.key]);
      if (value === undefined) {
        continue;
      }
      const exists = await this.store.existsByDataValue(
        formId,
        field.key,
        value,
        excludeRecordId,
      );
      if (exists) {
        throw new ConflictException(
          `[${field.title || '未命名'}]不允许重复值`,
        );
      }
    }
  }

  private async requireForm(ownerId: number, appId: number, formId: number) {
    const app = await this.appRepo.findOne({ where: { id: appId, ownerId } });
    if (!app) throw new NotFoundException('应用不存在');
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

  private toView(
    doc: FormRecordDoc,
    names: Map<number, string>,
  ): FormRecordView {
    const updatedBy = doc.updatedBy ?? doc.createdBy;
    return {
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
  }
}

function collectMemberIds(
  fields: FormField[],
  data: Record<string, unknown>,
  ids: Set<number>,
) {
  for (const field of flattenFields(fields)) {
    if (field.type === 'subform') {
      const rows = Array.isArray(data[field.key]) ? data[field.key] : [];
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

function uniqueChildComparableValue(
  field: FormField,
  value: unknown,
): string | number | undefined {
  if (field.type === 'input' || field.type === 'data') {
    if (typeof value !== 'string' || value === '') return undefined;
    return value;
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value;
  }
  return undefined;
}

function uniqueComparableValue(
  field: FormField,
  value: unknown,
): string | number | undefined {
  if (!field.unique) return undefined;
  return uniqueChildComparableValue(field, value);
}

function isSubformChildEmpty(field: FormField, value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (
    field.type === 'checkbox' ||
    field.type === 'select-multiple' ||
    field.type === 'image' ||
    field.type === 'file' ||
    field.type === 'member-multiple' ||
    field.type === 'dept-multiple'
  ) {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'member' || field.type === 'dept') {
    return typeof value !== 'number' || !Number.isInteger(value) || value <= 0;
  }
  if (field.type === 'address') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return true;
    }
    const ids = (value as { ids?: unknown }).ids;
    return !Array.isArray(ids) || ids.length === 0;
  }
  return false;
}
