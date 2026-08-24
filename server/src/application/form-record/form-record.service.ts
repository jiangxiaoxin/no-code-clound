import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppForm } from '../app-form.entity';
import { Application } from '../application.entity';
import { coerceRecordData, mergeRecordData } from './form-record.coerce';
import { buildRecordQuery, RecordQueryBody } from './form-record.query';
import { FormRecordDoc, FormRecordStore } from './form-record.store';
import { parseFormSchema } from '../form-schema';
import { FormField } from './form-record.types';

export type FormRecordView = {
  id: string;
  appId: number;
  formId: number;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
  data: Record<string, unknown>;
};

@Injectable()
export class FormRecordService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    private readonly store: FormRecordStore,
  ) {}

  async create(
    ownerId: number,
    appId: number,
    formId: number,
    data: Record<string, unknown>,
  ): Promise<FormRecordView> {
    const form = await this.requireForm(ownerId, appId, formId);
    const fields = this.readFields(form);
    const coerced = coerceRecordData(fields, data);
    const now = new Date();
    const inserted = await this.store.insert({
      appId,
      formId,
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
      data: coerced,
    });
    const doc = await this.store.findById(formId, inserted.id);
    if (!doc) throw new NotFoundException('记录不存在');
    return this.toView(doc);
  }

  async query(
    ownerId: number,
    appId: number,
    formId: number,
    body: RecordQueryBody,
  ) {
    const form = await this.requireForm(ownerId, appId, formId);
    const built = buildRecordQuery(this.readFields(form), body);
    const { items, total } = await this.store.query(formId, built);
    return {
      items: items.map((item) => this.toView(item)),
      total,
      page: built.page,
      pageSize: built.pageSize,
    };
  }

  async getOne(
    ownerId: number,
    appId: number,
    formId: number,
    recordId: string,
  ): Promise<FormRecordView> {
    await this.requireForm(ownerId, appId, formId);
    const doc = await this.store.findById(formId, recordId);
    if (!doc) throw new NotFoundException('记录不存在');
    return this.toView(doc);
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
    const merged = mergeRecordData(
      existing.data ?? {},
      data,
      this.readFields(form),
    );
    const doc = await this.store.replaceData(formId, recordId, merged);
    if (!doc) throw new NotFoundException('记录不存在');
    return this.toView(doc);
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

  private toView(doc: FormRecordDoc): FormRecordView {
    return {
      id: doc._id.toHexString(),
      appId: doc.appId,
      formId: doc.formId,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      data: doc.data ?? {},
    };
  }
}
