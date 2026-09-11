import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppForm } from '../app-form.entity';
import { parseFormSchema } from '../form-schema';
import { flattenFields } from './flatten-fields';
import { coerceRecordData, mergeRecordData } from './form-record.coerce';
import { assertRequiredFields } from './form-record.required';
import { FormRecordDoc, FormRecordStore } from './form-record.store';
import { FormField } from './form-record.types';
import { FormSerialSeqService } from './form-serial-seq.service';
import { applyFormulaValues } from './formula/evaluator';
import {
  findSerialField,
  periodKey,
  renderSerialValue,
} from './serial-number';

export type PersistRecordInput = {
  form: AppForm;
  actorId: number;
  data: Record<string, unknown>;
  recordId?: string;
  requiredKeys?: string[] | 'all';
  skipSerial?: boolean;
};

export function uniqueChildComparableValue(
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

export function uniqueComparableValue(
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

export function assertSubformConstraints(
  fields: FormField[] | null,
  data: Record<string, unknown>,
  keys: string[] | 'all' = 'all',
) {
  const wanted = keys === 'all' ? null : new Set(keys);
  for (const field of flattenFields(fields ?? [])) {
    if (field.type !== 'subform') {
      continue;
    }
    if (field.visible === false) {
      continue;
    }
    if (wanted && !wanted.has(field.key!)) {
      continue;
    }
    const rows = Array.isArray(data[field.key])
      ? (data[field.key] as Record<string, unknown>[])
      : [];
    if (field.required && rows.length === 0) {
      throw new BadRequestException(`[${field.title || '未命名'}]不能为空`);
    }
    const children = field.fields ?? [];
    for (const row of rows) {
      for (const child of children) {
        // 不可见子列在填报界面不渲染，不能按必填拦提交
        if (!child.required || child.visible === false || child.formula) {
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

@Injectable()
export class FormRecordPersistService {
  private readonly logger = new Logger(FormRecordPersistService.name);

  constructor(
    private readonly store: FormRecordStore,
    private readonly serialSeq: FormSerialSeqService,
  ) {}

  async persist(input: PersistRecordInput): Promise<FormRecordDoc> {
    const { form, actorId, recordId } = input;
    const fields = parseFormSchema(form.fields).fields;
    const existing = recordId
      ? await this.store.findById(form.id, recordId)
      : null;
    if (recordId && !existing) throw new NotFoundException('记录不存在');
    const data = existing
      ? mergeRecordData(existing.data ?? {}, input.data, fields)
      : coerceRecordData(fields, input.data);
    const now = new Date();
    this.applyFormulas(fields, data, now);
    if (input.requiredKeys) {
      assertRequiredFields(fields, data, input.requiredKeys);
    }
    assertSubformConstraints(fields, data, input.requiredKeys ?? 'all');
    await this.assertUniqueFields(form.id, fields, data, recordId);
    if (!existing && !input.skipSerial) {
      await this.applySerialNumber(form.id, fields, data);
    }
    if (existing) {
      const doc = await this.store.replaceData(
        form.id,
        recordId!,
        data,
        actorId,
      );
      if (!doc) throw new NotFoundException('记录不存在');
      return doc;
    }
    const inserted = await this.store.insert({
      appId: form.applicationId,
      formId: form.id,
      createdBy: actorId,
      createdAt: now,
      updatedBy: actorId,
      updatedAt: now,
      data,
    });
    const doc = await this.store.findById(form.id, inserted.id);
    if (!doc) throw new NotFoundException('记录不存在');
    return doc;
  }

  async applySerialNumber(
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

  applyFormulas(
    fields: FormField[] | null,
    data: Record<string, unknown>,
    now: Date,
  ) {
    for (const warning of applyFormulaValues(fields ?? [], data, now)) {
      this.logger.warn(warning);
    }
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
}
