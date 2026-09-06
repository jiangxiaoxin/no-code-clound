import { Injectable } from '@nestjs/common';
import { Collection, ObjectId } from 'mongodb';
import { MongoService } from '../../mongo/mongo.service';
import { flattenFields } from './flatten-fields';
import {
  collectionName,
  dataIndexName,
  FILTERABLE_TYPES,
  targetDataIndexNames,
} from './form-record.indexes';
import { FormField } from './form-record.types';

export type FormRecordDoc = {
  _id: ObjectId;
  appId: number;
  formId: number;
  createdBy: number;
  createdAt: Date;
  updatedBy: number;
  updatedAt: Date;
  data: Record<string, unknown>;
  workflowStatus?: string;
  workflowInstanceId?: number;
};

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

@Injectable()
export class FormRecordStore {
  constructor(private readonly mongo: MongoService) {}

  private col(formId: number): Collection<FormRecordDoc> {
    return this.mongo.getDb().collection(collectionName(formId));
  }

  private parseId(id: string): ObjectId | null {
    if (!OBJECT_ID_RE.test(id)) return null;
    return new ObjectId(id);
  }

  async ensureSystemIndexes(formId: number): Promise<void> {
    const col = this.col(formId);
    await col.createIndex({ createdAt: -1 }, { name: 'idx_createdAt' });
    await col.createIndex({ updatedAt: -1 }, { name: 'idx_updatedAt' });
    await col.createIndex({ createdBy: 1 }, { name: 'idx_createdBy' });
  }

  async syncIndexes(
    formId: number,
    fields: FormField[] | null | undefined,
  ): Promise<void> {
    await this.ensureSystemIndexes(formId);
    const col = this.col(formId);
    const wanted = new Set(targetDataIndexNames(fields));
    for (const field of flattenFields(fields)) {
      if (!FILTERABLE_TYPES.has(field.type)) continue;
      await col.createIndex(
        { [`data.${field.key}`]: 1 },
        { name: dataIndexName(field.key) },
      );
    }
    const existing = await col.indexes();
    for (const idx of existing) {
      const name = idx.name;
      if (name && name.startsWith('idx_data_') && !wanted.has(name)) {
        await col.dropIndex(name);
      }
    }
  }

  async dropFormCollection(formId: number): Promise<void> {
    try {
      await this.col(formId).drop();
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 26) {
        return;
      }
      throw err;
    }
  }

  async dropAppCollections(appId: number, formIds: number[]): Promise<void> {
    const dropped = new Set(formIds);
    for (const formId of formIds) {
      await this.dropFormCollection(formId);
    }
    const cols = await this.mongo.getDb().listCollections().toArray();
    for (const col of cols) {
      const match = /^frm_(\d+)$/.exec(col.name);
      if (!match) continue;
      const formId = Number(match[1]);
      if (dropped.has(formId)) continue;
      const leftover = await this.col(formId).findOne(
        { appId },
        { projection: { _id: 1 } },
      );
      if (leftover) {
        await this.dropFormCollection(formId);
      }
    }
  }

  async insert(doc: Omit<FormRecordDoc, '_id'>): Promise<{ id: string }> {
    await this.ensureSystemIndexes(doc.formId);
    const result = await this.col(doc.formId).insertOne(doc as FormRecordDoc);
    return { id: result.insertedId.toHexString() };
  }

  async insertMany(docs: Omit<FormRecordDoc, '_id'>[]): Promise<number> {
    if (!docs.length) return 0;
    await this.ensureSystemIndexes(docs[0].formId);
    const result = await this.col(docs[0].formId).insertMany(
      docs as FormRecordDoc[],
    );
    return result.insertedCount;
  }

  async findById(formId: number, id: string): Promise<FormRecordDoc | null> {
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.col(formId).findOne({ _id: objectId });
  }

  async existsByDataValue(
    formId: number,
    fieldKey: string,
    value: unknown,
    excludeId?: string,
  ): Promise<boolean> {
    const filter: Record<string, unknown> = {
      [`data.${fieldKey}`]: value,
    };
    if (excludeId) {
      const objectId = this.parseId(excludeId);
      if (objectId) {
        filter._id = { $ne: objectId };
      }
    }
    const found = await this.col(formId).findOne(filter, {
      projection: { _id: 1 },
    });
    return Boolean(found);
  }

  async replaceData(
    formId: number,
    id: string,
    data: Record<string, unknown>,
    updatedBy: number,
  ): Promise<FormRecordDoc | null> {
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.col(formId).findOneAndUpdate(
      { _id: objectId },
      { $set: { data, updatedBy, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }

  async backfillApprovedMissing(formId: number): Promise<number> {
    const col = this.col(formId);
    let total = 0;
    for (;;) {
      const ids = await col
        .find({ workflowStatus: { $exists: false } }, { projection: { _id: 1 } })
        .limit(500)
        .toArray();
      if (!ids.length) return total;
      const result = await col.updateMany(
        {
          _id: { $in: ids.map((item) => item._id) },
          workflowStatus: { $exists: false },
        },
        { $set: { workflowStatus: 'approved' } },
      );
      total += result.modifiedCount;
      if (result.modifiedCount === 0) return total;
    }
  }

  async deleteById(formId: number, id: string): Promise<boolean> {
    const objectId = this.parseId(id);
    if (!objectId) return false;
    const result = await this.col(formId).deleteOne({ _id: objectId });
    return result.deletedCount === 1;
  }

  async query(
    formId: number,
    built: {
      filter: Record<string, unknown>;
      sort: Record<string, 1 | -1>;
      skip: number;
      limit: number;
    },
  ): Promise<{ items: FormRecordDoc[]; total: number }> {
    const col = this.col(formId);
    const total = await col.countDocuments(built.filter);
    const items = await col
      .find(built.filter)
      .sort(built.sort)
      .skip(built.skip)
      .limit(built.limit)
      .toArray();
    return { items, total };
  }

  async setWorkflowMeta(
    formId: number,
    id: string,
    meta: {
      workflowStatus: string;
      workflowInstanceId?: number;
    },
  ): Promise<void> {
    const objectId = this.parseId(id);
    if (!objectId) return;
    const $set: Record<string, unknown> = {
      workflowStatus: meta.workflowStatus,
    };
    if (meta.workflowInstanceId != null) {
      $set.workflowInstanceId = meta.workflowInstanceId;
    }
    await this.col(formId).updateOne({ _id: objectId }, { $set });
  }
}
