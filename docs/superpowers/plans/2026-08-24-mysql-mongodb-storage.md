# MySQL + MongoDB 混合存储 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端同时连接 MySQL 与 MongoDB：表单配置仍在 MySQL，填报按表单写入 Mongo 集合，并提供按字段筛选的记录接口。

**Architecture:** 全局 `MongoModule` 用官方 `mongodb` 驱动连接。`form-record` 目录负责集合命名、类型转换、筛选翻译、索引同步和 HTTP。`ApplicationService.deleteForm` 在 MySQL 删行之后 drop 对应集合。不在本期做填报页，也不实现 `PUT .../fields`（索引同步函数先导出，留给 2026-08-23）。

**Tech Stack:** NestJS 11、TypeORM、MySQL 8、mongodb 驱动、Jest。

**Spec:** `docs/superpowers/specs/2026-08-24-mysql-mongodb-storage-design.md`

## Global Constraints

- 接口前缀 `/api`，JWT + 应用 `ownerId`。应用不存在或不属于当前用户：404「应用不存在」；表单不存在：404「表单不存在」。
- 统一响应仍是 `{ code, message, data }`，不要改 `ResponseInterceptor`。
- TypeORM `synchronize: false`。`app_form.fields` 的 SQL 写好后必须停下，获得使用者点名该脚本的明确许可才能执行。
- 只用官方 `mongodb` 包。不用 TypeORM 连 Mongo，不用 Mongoose，不为每张表单写 Schema。
- 集合名固定 `frm_{formId}`。禁止所有表单共用一个 collection。
- 本期无前端改动。
- 不删除、修改或移动使用者已有注释和 `console.log`。
- 未经使用者明确要求，不执行 git commit；每个任务只给出建议提交信息。
- 后端按 TDD：先写失败测试，再实现，再跑测试。CI 不启动真实 Mongo，一律 mock。
- 错误文案必须与 spec 一致，不要改写成别的中文。

---

## File Structure

```text
server/
  .env.example
  package.json                          # 增加 mongodb
  sql/2026-08-24-app-form-fields.sql    # ALTER app_form 增加 fields
  src/app.module.ts                     # 导入 MongoModule
  src/mongo/
    mongo.env.ts                        # 校验 MONGO_URI / MONGO_DB_NAME
    mongo.env.spec.ts
    mongo.module.ts                     # @Global
    mongo.service.ts                    # 连接、getDb()
  src/application/
    app-form.entity.ts                  # 增加可空 fields
    application.module.ts               # 注册 form-record
    application.service.ts              # deleteForm 后 drop 集合
    application.service.spec.ts
    form-record/
      form-record.types.ts
      form-record.indexes.ts
      form-record.indexes.spec.ts
      form-record.coerce.ts
      form-record.coerce.spec.ts
      form-record.query.ts
      form-record.query.spec.ts
      form-record.store.ts
      form-record.store.spec.ts
      form-record.service.ts
      form-record.service.spec.ts
      form-record.controller.ts
      dto/create-record.dto.ts
      dto/patch-record.dto.ts
      dto/query-records.dto.ts
```

职责：

- `mongo.*`：只负责连上库。不知道表单、不知道索引。
- `form-record.indexes / coerce / query`：无 I/O 纯函数，单测覆盖 spec 第 5–7 节。
- `form-record.store`：对某个 `formId` 的 collection 做增删改查和 `syncIndexes` / `dropFormCollection`。
- `form-record.service`：鉴权（自查 Application / AppForm）、读 `fields`、调 coerce/query/store。
- `form-record.controller`：HTTP 映射。`POST query` 写在 `:recordId` 旁边即可（方法不同，不冲突）。
- `ApplicationService` 只新增删除表单后的 drop 调用，不把 Mongo 查询写进去。

不要改：前端任何文件、`PUT .../fields`、字典模块、组织权限、现有注释和日志。

---

### Task 1: 集合名与索引目标

**Files:**
- Create: `server/src/application/form-record/form-record.types.ts`
- Create: `server/src/application/form-record/form-record.indexes.ts`
- Test: `server/src/application/form-record/form-record.indexes.spec.ts`

**Interfaces:**
- Produces: `FormField = { key: string; type: string }`
- Produces: `FILTERABLE_TYPES: ReadonlySet<string>`
- Produces: `collectionName(formId: number): string` → `frm_${formId}`
- Produces: `dataIndexName(fieldKey: string): string` → `idx_data_${fieldKey}`
- Produces: `targetDataIndexNames(fields: FormField[] | null | undefined): string[]`
- Produces: `SYSTEM_INDEX_NAMES = ['idx_createdAt', 'idx_createdBy']`

- [ ] **Step 1: 写失败测试**

```ts
import {
  collectionName,
  dataIndexName,
  targetDataIndexNames,
} from './form-record.indexes';

describe('form-record.indexes', () => {
  it('names collection by form id', () => {
    expect(collectionName(12)).toBe('frm_12');
  });

  it('builds data index name from field key', () => {
    expect(dataIndexName('a1b2-c3')).toBe('idx_data_a1b2-c3');
  });

  it('indexes only filterable types and skips layout/media/subform', () => {
    const names = targetDataIndexNames([
      { key: 't1', type: 'input' },
      { key: 't2', type: 'number' },
      { key: 't3', type: 'select-multiple' },
      { key: 'd1', type: 'divider' },
      { key: 'i1', type: 'image' },
      { key: 'f1', type: 'file' },
      { key: 's1', type: 'subform' },
    ]);
    expect(names).toEqual([
      'idx_data_t1',
      'idx_data_t2',
      'idx_data_t3',
    ]);
  });

  it('returns no data indexes when fields is null', () => {
    expect(targetDataIndexNames(null)).toEqual([]);
    expect(targetDataIndexNames(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest application/form-record/form-record.indexes.spec.ts`

Expected: FAIL（模块不存在）

工作目录：`server/`

- [ ] **Step 3: 最小实现**

`form-record.types.ts`：

```ts
export type FormField = {
  key: string;
  type: string;
};
```

`form-record.indexes.ts`：

```ts
import { FormField } from './form-record.types';

export const FILTERABLE_TYPES: ReadonlySet<string> = new Set([
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
  'member',
  'dept',
  'data',
  'relate',
]);

export const SYSTEM_INDEX_NAMES = ['idx_createdAt', 'idx_createdBy'] as const;

export function collectionName(formId: number): string {
  return `frm_${formId}`;
}

export function dataIndexName(fieldKey: string): string {
  return `idx_data_${fieldKey}`;
}

export function targetDataIndexNames(
  fields: FormField[] | null | undefined,
): string[] {
  if (!fields) {
    return [];
  }
  return fields
    .filter((field) => FILTERABLE_TYPES.has(field.type))
    .map((field) => dataIndexName(field.key));
}
```

- [ ] **Step 4: 再跑测试**

Run: `npx jest application/form-record/form-record.indexes.spec.ts`

Expected: PASS

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 增加填报集合命名与可筛字段索引规则
```

---

### Task 2: 写入类型转换

**Files:**
- Create: `server/src/application/form-record/form-record.coerce.ts`
- Test: `server/src/application/form-record/form-record.coerce.spec.ts`

**Interfaces:**
- Consumes: `FormField`
- Produces: `coerceRecordData(fields, input): Record<string, unknown>`（新建）
- Produces: `mergeRecordData(existing, patchInput, fields): Record<string, unknown>`（PATCH）
- 非法 `input`：`BadRequestException('请提交记录数据')`
- 类型不对：`BadRequestException('字段值类型不正确')`

- [ ] **Step 1: 写失败测试**

```ts
import { BadRequestException } from '@nestjs/common';
import {
  coerceRecordData,
  mergeRecordData,
} from './form-record.coerce';

const fields = [
  { key: 'name', type: 'input' },
  { key: 'age', type: 'number' },
  { key: 'tags', type: 'select-multiple' },
  { key: 'split', type: 'divider' },
  { key: 'kids', type: 'subform' },
];

describe('coerceRecordData', () => {
  it('drops unknown keys and divider, keeps coerced values', () => {
    const data = coerceRecordData(fields, {
      name: '张三',
      age: 18,
      tags: ['a', 'b'],
      split: 'x',
      extra: 'no',
    });
    expect(data).toEqual({
      name: '张三',
      age: 18,
      tags: ['a', 'b'],
    });
  });

  it('returns empty object when fields is null', () => {
    expect(coerceRecordData(null, { name: '张三' })).toEqual({});
  });

  it('stores empty array when subform is not an array', () => {
    expect(coerceRecordData(fields, { kids: 'nope' })).toEqual({ kids: [] });
  });

  it('omits empty number', () => {
    expect(coerceRecordData(fields, { age: null })).toEqual({});
    expect(coerceRecordData(fields, { age: '' })).toEqual({});
  });

  it('throws when payload is not an object', () => {
    try {
      coerceRecordData(fields, null);
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('请提交记录数据');
    }
  });

  it('throws when number is not finite', () => {
    try {
      coerceRecordData(fields, { age: '18' });
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('字段值类型不正确');
    }
  });
});

describe('mergeRecordData', () => {
  it('keeps unmentioned keys and deletes explicit null', () => {
    const next = mergeRecordData(
      { name: '旧', age: 1 },
      { age: null, tags: ['x'] },
      fields,
    );
    expect(next).toEqual({ name: '旧', tags: ['x'] });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest application/form-record/form-record.coerce.spec.ts`

Expected: FAIL

- [ ] **Step 3: 最小实现**

`form-record.coerce.ts` 按 spec 第 5 节转换：

- `input` / `textarea` / `time` / `radio` / `select`：必须是 string
- `number`：必须是有限数字；`null` / `''` / 缺省不写
- `date`：`/^\d{4}-\d{2}-\d{2}$/`
- `datetime`：string，且 `Date.parse` 不是 NaN，入库 `new Date(value)`；空值不写
- `checkbox` / `select-multiple`：字符串数组
- `member` / `dept`：整数；空值不写
- `data` / `relate`：string
- `image` / `file`：string 或 string[]
- `subform`：是数组则原样存，否则 `[]`
- `divider`：跳过
- 缺省 key：不写
- `coerceRecordData` 只遍历 `fields`，因此多余 key 被丢弃
- `mergeRecordData`：从 `existing` 浅拷贝，只处理 patch 里出现且属于当前 fields 的 key；值为 `null` 则 `delete`

```ts
import { BadRequestException } from '@nestjs/common';
import { FormField } from './form-record.types';

function requireObject(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('请提交记录数据');
  }
  return input as Record<string, unknown>;
}

function invalid(): never {
  throw new BadRequestException('字段值类型不正确');
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function coerceFieldValue(field: FormField, value: unknown): unknown {
  switch (field.type) {
    case 'divider':
      return undefined;
    case 'input':
    case 'textarea':
    case 'time':
    case 'radio':
    case 'select':
    case 'data':
    case 'relate':
      return typeof value === 'string' ? value : invalid();
    case 'number':
      if (isEmpty(value)) return undefined;
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : invalid();
    case 'date':
      if (isEmpty(value)) return undefined;
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value
        : invalid();
    case 'datetime':
      if (isEmpty(value)) return undefined;
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        invalid();
      }
      return new Date(value);
    case 'checkbox':
    case 'select-multiple':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? value
        : invalid();
    case 'member':
    case 'dept':
      if (isEmpty(value)) return undefined;
      return typeof value === 'number' && Number.isInteger(value)
        ? value
        : invalid();
    case 'image':
    case 'file':
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value;
      }
      invalid();
    case 'subform':
      return Array.isArray(value) ? value : [];
    default:
      return value;
  }
}

export function coerceRecordData(
  fields: FormField[] | null | undefined,
  input: unknown,
): Record<string, unknown> {
  const src = requireObject(input);
  const out: Record<string, unknown> = {};
  for (const field of fields ?? []) {
    if (!(field.key in src)) continue;
    const coerced = coerceFieldValue(field, src[field.key]);
    if (coerced !== undefined) {
      out[field.key] = coerced;
    }
  }
  return out;
}

export function mergeRecordData(
  existing: Record<string, unknown>,
  patchInput: unknown,
  fields: FormField[] | null | undefined,
): Record<string, unknown> {
  const patch = requireObject(patchInput);
  const fieldMap = new Map((fields ?? []).map((field) => [field.key, field]));
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    const field = fieldMap.get(key);
    if (!field) continue;
    if (value === null) {
      delete next[key];
      continue;
    }
    const coerced = coerceFieldValue(field, value);
    if (coerced === undefined) {
      delete next[key];
    } else {
      next[key] = coerced;
    }
  }
  return next;
}
```

- [ ] **Step 4: 再跑测试**

Run: `npx jest application/form-record/form-record.coerce.spec.ts`

Expected: PASS

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 按表单字段类型转换填报 data
```

---

### Task 3: 筛选翻译

**Files:**
- Create: `server/src/application/form-record/form-record.query.ts`
- Test: `server/src/application/form-record/form-record.query.spec.ts`

**Interfaces:**
- Consumes: `FormField`、`FILTERABLE_TYPES`
- Produces: `buildRecordQuery(fields, body) => { filter, sort, skip, limit, page, pageSize }`
- `body`: `{ filters?: { key: string; op: string; value: unknown }[]; sort?: { key: string; order?: string }; page?: number; pageSize?: number }`
- 缺省：`page=1`、`pageSize=20`、`sort={ createdAt: -1 }`
- `pageSize > 100` 或 `page < 1` 或 `pageSize < 1`：`BadRequestException('分页大小不正确')`
- 不支持的 key / op：`BadRequestException('不支持该筛选')`

- [ ] **Step 1: 写失败测试**

```ts
import { BadRequestException } from '@nestjs/common';
import { buildRecordQuery } from './form-record.query';

const fields = [
  { key: 'name', type: 'input' },
  { key: 'age', type: 'number' },
  { key: 'pic', type: 'image' },
];

describe('buildRecordQuery', () => {
  it('defaults page sort and empty filter', () => {
    expect(buildRecordQuery(fields, {})).toEqual({
      filter: {},
      sort: { createdAt: -1 },
      skip: 0,
      limit: 20,
      page: 1,
      pageSize: 20,
    });
  });

  it('maps eq to data path and contains to escaped regex', () => {
    const result = buildRecordQuery(fields, {
      filters: [
        { key: 'name', op: 'contains', value: 'a.c+' },
        { key: 'age', op: 'eq', value: 18 },
        { key: 'createdBy', op: 'eq', value: 3 },
      ],
    });
    expect(result.filter).toEqual({
      'data.name': { $regex: 'a\\.c\\+', $options: 'i' },
      'data.age': 18,
      createdBy: 3,
    });
  });

  it('rejects unknown or non-filterable field', () => {
    for (const key of ['missing', 'pic']) {
      try {
        buildRecordQuery(fields, {
          filters: [{ key, op: 'eq', value: 'x' }],
        });
        throw new Error('expected 400');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toBe('不支持该筛选');
      }
    }
  });

  it('rejects oversized pageSize', () => {
    try {
      buildRecordQuery(fields, { pageSize: 101 });
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('分页大小不正确');
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest application/form-record/form-record.query.spec.ts`

Expected: FAIL

- [ ] **Step 3: 最小实现**

规则（必须全部实现，不要只写测试里出现的分支）：

- 系统 key：`createdAt`、`createdBy` 落到文档根
- 其它 key：必须在 `fields` 里且 type ∈ `FILTERABLE_TYPES`，路径 `data.${key}`
- `op`：`eq` `{ field: value }`；`ne` `$ne`；`in` 且 `value` 为数组否则 400；`contains` 仅 `input|textarea|time|radio|select|date`（`createdAt`/`createdBy` 不行）；`gt|gte|lt|lte` 仅 `number|date|datetime` 以及 `createdAt`
- `contains`：`value` 必须是 string，用 `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` 转义
- `createdBy` 只允许 `eq` / `in`（`ne`、范围、`contains` 都 400）
- `sort.key` 同样只允许 `createdAt` / `createdBy` / 可筛字段；`order` 缺省 `desc`；仅 `asc|desc`
- `datetime` 与 `createdAt` 的比较值若是 ISO 字符串，转成 `Date`

```ts
import { BadRequestException } from '@nestjs/common';
import { FILTERABLE_TYPES } from './form-record.indexes';
import { FormField } from './form-record.types';

export type RecordFilter = { key: string; op: string; value: unknown };
export type RecordSort = { key: string; order?: string };
export type RecordQueryBody = {
  filters?: RecordFilter[];
  sort?: RecordSort;
  page?: number;
  pageSize?: number;
};

const STRING_CONTAINS_TYPES = new Set([
  'input',
  'textarea',
  'time',
  'radio',
  'select',
  'date',
]);
const RANGE_TYPES = new Set(['number', 'date', 'datetime']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unsupported(): never {
  throw new BadRequestException('不支持该筛选');
}

function resolvePath(
  key: string,
  fields: FormField[] | null | undefined,
): { path: string; type: string } {
  if (key === 'createdAt') return { path: 'createdAt', type: 'createdAt' };
  if (key === 'createdBy') return { path: 'createdBy', type: 'createdBy' };
  const field = (fields ?? []).find((item) => item.key === key);
  if (!field || !FILTERABLE_TYPES.has(field.type)) unsupported();
  return { path: `data.${key}`, type: field.type };
}

function asDateIfNeeded(type: string, value: unknown): unknown {
  if (
    (type === 'datetime' || type === 'createdAt') &&
    typeof value === 'string'
  ) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) unsupported();
    return date;
  }
  return value;
}

function buildClause(
  type: string,
  path: string,
  op: string,
  value: unknown,
): Record<string, unknown> {
  if (type === 'createdBy' && op !== 'eq' && op !== 'in') unsupported();
  const prepared = asDateIfNeeded(type, value);
  if (op === 'eq') return { [path]: prepared };
  if (op === 'ne') return { [path]: { $ne: prepared } };
  if (op === 'in') {
    if (!Array.isArray(value)) unsupported();
    const items = value.map((item) => asDateIfNeeded(type, item));
    return { [path]: { $in: items } };
  }
  if (op === 'contains') {
    if (type === 'createdAt' || type === 'createdBy') unsupported();
    if (!STRING_CONTAINS_TYPES.has(type) || typeof value !== 'string') {
      unsupported();
    }
    return { [path]: { $regex: escapeRegex(value), $options: 'i' } };
  }
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (type !== 'createdAt' && !RANGE_TYPES.has(type)) unsupported();
    return { [path]: { [`$${op}`]: prepared } };
  }
  unsupported();
}

export function buildRecordQuery(
  fields: FormField[] | null | undefined,
  body: RecordQueryBody,
): {
  filter: Record<string, unknown>;
  sort: Record<string, 1 | -1>;
  skip: number;
  limit: number;
  page: number;
  pageSize: number;
} {
  const page = body.page ?? 1;
  const pageSize = body.pageSize ?? 20;
  if (!Number.isInteger(page) || !Number.isInteger(pageSize) || page < 1 || pageSize < 1 || pageSize > 100) {
    throw new BadRequestException('分页大小不正确');
  }

  const filter: Record<string, unknown> = {};
  for (const item of body.filters ?? []) {
    const resolved = resolvePath(item.key, fields);
    Object.assign(filter, buildClause(resolved.type, resolved.path, item.op, item.value));
  }

  const sortKey = body.sort?.key ?? 'createdAt';
  const orderRaw = body.sort?.order ?? 'desc';
  if (orderRaw !== 'asc' && orderRaw !== 'desc') unsupported();
  const resolvedSort = resolvePath(sortKey, fields);
  const sort = { [resolvedSort.path]: orderRaw === 'asc' ? 1 : -1 } as Record<
    string,
    1 | -1
  >;

  return {
    filter,
    sort,
    skip: (page - 1) * pageSize,
    limit: pageSize,
    page,
    pageSize,
  };
}
```

注意：多个 filter 若落到同一 path，后写覆盖前写。本期条件是 AND 且产品不会对同一 key 给两个 op；不要为此引入 `$and`。

- [ ] **Step 4: 再跑测试**

Run: `npx jest application/form-record/form-record.query.spec.ts`

Expected: PASS

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 将填报筛选条件翻译为 Mongo 查询
```

---

### Task 4: Mongo 连接

**Files:**
- Create: `server/src/mongo/mongo.env.ts`
- Test: `server/src/mongo/mongo.env.spec.ts`
- Create: `server/src/mongo/mongo.service.ts`
- Create: `server/src/mongo/mongo.module.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/.env.example`
- Modify: `server/package.json`（`npm install mongodb`）

**Interfaces:**
- Produces: `requireMongoEnv(uri?: string, dbName?: string): { uri: string; dbName: string }`
- 缺一则 `throw new Error('MONGO_URI 和 MONGO_DB_NAME 必须配置')`
- Produces: `MongoService.getDb(): Db`；未连接则 `Error('MongoDB 未连接')`
- Produces: `MongoService.onModuleInit` 连接；`onModuleDestroy` `client.close()`
- `MongoModule` 加 `@Global()`，`AppModule` `imports` 加入 `MongoModule`

- [ ] **Step 1: 写失败测试**

```ts
import { requireMongoEnv } from './mongo.env';

describe('requireMongoEnv', () => {
  it('returns uri and db name', () => {
    expect(requireMongoEnv('mongodb://localhost:27017', 'no_code_cloud')).toEqual({
      uri: 'mongodb://localhost:27017',
      dbName: 'no_code_cloud',
    });
  });

  it('throws when missing', () => {
    expect(() => requireMongoEnv('', 'no_code_cloud')).toThrow(
      'MONGO_URI 和 MONGO_DB_NAME 必须配置',
    );
    expect(() => requireMongoEnv('mongodb://localhost:27017', '')).toThrow(
      'MONGO_URI 和 MONGO_DB_NAME 必须配置',
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest mongo/mongo.env.spec.ts`

Expected: FAIL

- [ ] **Step 3: 实现 env 校验、安装驱动、接线**

`mongo.env.ts`：

```ts
export function requireMongoEnv(
  uri?: string,
  dbName?: string,
): { uri: string; dbName: string } {
  if (!uri || !dbName) {
    throw new Error('MONGO_URI 和 MONGO_DB_NAME 必须配置');
  }
  return { uri, dbName };
}
```

在 `server/` 执行：`npm install mongodb`

`mongo.service.ts`：

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient } from 'mongodb';
import { requireMongoEnv } from './mongo.env';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const { uri, dbName } = requireMongoEnv(
      this.config.get<string>('MONGO_URI'),
      this.config.get<string>('MONGO_DB_NAME'),
    );
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
  }

  async onModuleDestroy() {
    await this.client?.close();
    this.client = null;
    this.db = null;
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB 未连接');
    }
    return this.db;
  }
}
```

`mongo.module.ts`：

```ts
import { Global, Module } from '@nestjs/common';
import { MongoService } from './mongo.service';

@Global()
@Module({
  providers: [MongoService],
  exports: [MongoService],
})
export class MongoModule {}
```

`app.module.ts` 的 `imports` 在 `ConfigModule.forRoot` 之后加入 `MongoModule`。

`.env.example` 追加：

```text
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=no_code_cloud
```

不要改使用者自己的 `.env`。不要在没配 Mongo 时跳过连接。

- [ ] **Step 4: 再跑 env 测试，并确认工程能编译**

Run:

```text
npx jest mongo/mongo.env.spec.ts
npx nest build
```

Expected: 测试 PASS；`nest build` 成功。尚未配置真实 Mongo 时不要 `nest start` 去连库。

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 接入 MongoDB 连接并与 MySQL 并存
```

---

### Task 5: FormRecordStore

**Files:**
- Create: `server/src/application/form-record/form-record.store.ts`
- Test: `server/src/application/form-record/form-record.store.spec.ts`

**Interfaces:**
- Consumes: `MongoService.getDb()`、`collectionName`、`dataIndexName`、`targetDataIndexNames`、`SYSTEM_INDEX_NAMES`、`buildRecordQuery` 的返回值
- Produces:
  - `syncIndexes(formId: number, fields: FormField[] | null | undefined): Promise<void>`
  - `ensureSystemIndexes(formId: number): Promise<void>`
  - `dropFormCollection(formId: number): Promise<void>`（集合不存在则忽略）
  - `insert(doc): Promise<{ id: string }>`（insert 前 `ensureSystemIndexes`）
  - `findById(formId, id: string): Promise<文档 | null>`
  - `replaceData(formId, id, data): Promise<文档 | null>`
  - `deleteById(formId, id): Promise<boolean>`
  - `query(formId, built): Promise<{ items, total }>`
- 文档字段：`appId, formId, createdBy, createdAt, updatedAt, data`
- 非法 24 位 hex 的 id：`findById` / `replaceData` / `deleteById` 直接返回 `null` / `false`，不要抛 400

- [ ] **Step 1: 写失败测试（mock collection）**

```ts
import { FormRecordStore } from './form-record.store';

describe('FormRecordStore', () => {
  const collection = {
    createIndex: jest.fn(),
    indexes: jest.fn(),
    dropIndex: jest.fn(),
    drop: jest.fn(),
    insertOne: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  const mongo = {
    getDb: () => ({
      collection: jest.fn(() => collection),
    }),
  };

  let store: FormRecordStore;

  beforeEach(() => {
    jest.resetAllMocks();
    collection.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            toArray: async () => [],
          }),
        }),
      }),
    });
    store = new FormRecordStore(mongo as never);
  });

  it('syncs filterable indexes and drops stale data indexes', async () => {
    collection.indexes.mockResolvedValue([
      { name: '_id_' },
      { name: 'idx_createdAt' },
      { name: 'idx_createdBy' },
      { name: 'idx_data_old' },
    ]);
    collection.createIndex.mockResolvedValue('ok');
    collection.dropIndex.mockResolvedValue('ok');

    await store.syncIndexes(12, [{ key: 'name', type: 'input' }]);

    expect(collection.createIndex).toHaveBeenCalledWith(
      { 'data.name': 1 },
      { name: 'idx_data_name' },
    );
    expect(collection.dropIndex).toHaveBeenCalledWith('idx_data_old');
    expect(collection.dropIndex).not.toHaveBeenCalledWith('idx_createdAt');
  });

  it('ignores missing collection on drop', async () => {
    collection.drop.mockRejectedValue(Object.assign(new Error('ns'), { code: 26 }));
    await expect(store.dropFormCollection(12)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest application/form-record/form-record.store.spec.ts`

Expected: FAIL

- [ ] **Step 3: 实现 store**

```ts
import { Injectable } from '@nestjs/common';
import { Collection, ObjectId } from 'mongodb';
import { MongoService } from '../../mongo/mongo.service';
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
  updatedAt: Date;
  data: Record<string, unknown>;
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
    await col.createIndex({ createdBy: 1 }, { name: 'idx_createdBy' });
  }

  async syncIndexes(
    formId: number,
    fields: FormField[] | null | undefined,
  ): Promise<void> {
    await this.ensureSystemIndexes(formId);
    const col = this.col(formId);
    const wanted = new Set(targetDataIndexNames(fields));
    for (const field of fields ?? []) {
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

  async insert(
    doc: Omit<FormRecordDoc, '_id'>,
  ): Promise<{ id: string }> {
    await this.ensureSystemIndexes(doc.formId);
    const result = await this.col(doc.formId).insertOne(doc as FormRecordDoc);
    return { id: result.insertedId.toHexString() };
  }

  async findById(formId: number, id: string): Promise<FormRecordDoc | null> {
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.col(formId).findOne({ _id: objectId });
  }

  async replaceData(
    formId: number,
    id: string,
    data: Record<string, unknown>,
  ): Promise<FormRecordDoc | null> {
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.col(formId).findOneAndUpdate(
      { _id: objectId },
      { $set: { data, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
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
}
```

`toView` 放在 service。mongodb 驱动 6 的 `findOneAndUpdate` 直接返回文档或 `null`，不要再取 `.value`。

- [ ] **Step 4: 再跑测试**

Run: `npx jest application/form-record/form-record.store.spec.ts`

Expected: PASS

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 按表单分集合读写填报并同步索引
```

---

### Task 6: 记录服务与 HTTP

**Files:**
- Create: `server/src/application/form-record/dto/create-record.dto.ts`
- Create: `server/src/application/form-record/dto/patch-record.dto.ts`
- Create: `server/src/application/form-record/dto/query-records.dto.ts`
- Create: `server/src/application/form-record/form-record.service.ts`
- Test: `server/src/application/form-record/form-record.service.spec.ts`
- Create: `server/src/application/form-record/form-record.controller.ts`
- Modify: `server/src/application/application.module.ts`
- Modify: `server/src/application/app-form.entity.ts`（加 `fields`，供 service 读取；不要改 GET 表单的返回形状）

**Interfaces:**
- Produces: `FormRecordView = { id, appId, formId, createdBy, createdAt, updatedAt, data }`
- Produces: `create(ownerId, appId, formId, data) => FormRecordView`，HTTP 201
- Produces: `query(ownerId, appId, formId, body) => { items, total, page, pageSize }`
- Produces: `getOne` / `update` / `remove`
- 记录不存在：`NotFoundException('记录不存在')`
- `fields`：`form.fields` 不是数组时当 `null`（含 TypeORM 读出的 `null`）
- DTO：`data` 用 `@IsObject({ message: '请提交记录数据' })`；query 的 `filters` / `sort` / `page` / `pageSize` 均可选，精细校验走 `buildRecordQuery`

- [ ] **Step 1: 写 service 失败测试**

```ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { AppForm } from '../app-form.entity';
import { Application } from '../application.entity';
import { FormRecordService } from './form-record.service';
import { FormRecordStore } from './form-record.store';

describe('FormRecordService', () => {
  let service: FormRecordService;
  const appRepo = { findOne: jest.fn() };
  const formRepo = { findOne: jest.fn() };
  const store = {
    insert: jest.fn(),
    findById: jest.fn(),
    replaceData: jest.fn(),
    deleteById: jest.fn(),
    query: jest.fn(),
  };
  const ownedApp = { id: 8, ownerId: 1 };
  const form = {
    id: 12,
    applicationId: 8,
    name: '客户',
    fields: [{ key: 'name', type: 'input' }],
  };
  const now = new Date('2026-08-24T03:00:00.000Z');
  const doc = {
    _id: new ObjectId('64b64c4c4c4c4c4c4c4c4c4c'),
    appId: 8,
    formId: 12,
    createdBy: 1,
    createdAt: now,
    updatedAt: now,
    data: { name: '张三' },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FormRecordService,
        { provide: getRepositoryToken(Application), useValue: appRepo },
        { provide: getRepositoryToken(AppForm), useValue: formRepo },
        { provide: FormRecordStore, useValue: store },
      ],
    }).compile();
    service = module.get(FormRecordService);
  });

  it('throws when app is missing', async () => {
    appRepo.findOne.mockResolvedValue(null);
    try {
      await service.create(1, 8, 12, { name: '张三' });
      throw new Error('expected 404');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).message).toBe('应用不存在');
    }
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('throws when form is missing', async () => {
    appRepo.findOne.mockResolvedValue(ownedApp);
    formRepo.findOne.mockResolvedValue(null);
    try {
      await service.create(1, 8, 12, { name: '张三' });
      throw new Error('expected 404');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).message).toBe('表单不存在');
    }
  });

  it('creates a record view without _id', async () => {
    appRepo.findOne.mockResolvedValue(ownedApp);
    formRepo.findOne.mockResolvedValue(form);
    store.insert.mockResolvedValue({ id: doc._id.toHexString() });
    store.findById.mockResolvedValue(doc);

    const result = await service.create(1, 8, 12, {
      name: '张三',
      extra: 'drop',
    });

    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 8,
        formId: 12,
        createdBy: 1,
        data: { name: '张三' },
      }),
    );
    expect(result).toEqual({
      id: '64b64c4c4c4c4c4c4c4c4c4c',
      appId: 8,
      formId: 12,
      createdBy: 1,
      createdAt: now,
      updatedAt: now,
      data: { name: '张三' },
    });
    expect(result).not.toHaveProperty('_id');
  });

  it('throws when record id is missing', async () => {
    appRepo.findOne.mockResolvedValue(ownedApp);
    formRepo.findOne.mockResolvedValue(form);
    store.findById.mockResolvedValue(null);
    try {
      await service.getOne(1, 8, 12, 'not-an-id');
      throw new Error('expected 404');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).message).toBe('记录不存在');
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest application/form-record/form-record.service.spec.ts`

Expected: FAIL

- [ ] **Step 3: 实现 entity 列、service、controller、module**

`app-form.entity.ts` 增加：

```ts
@Column({ type: 'json', nullable: true })
fields: Record<string, unknown>[] | null;
```

不要改 `toFormItem`。

`dto/create-record.dto.ts` 与 `dto/patch-record.dto.ts` 均为：

```ts
import { IsObject } from 'class-validator';

export class CreateRecordDto {
  @IsObject({ message: '请提交记录数据' })
  data: Record<string, unknown>;
}
```

patch 类名 `PatchRecordDto`，字段相同。

`dto/query-records.dto.ts`：

```ts
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryRecordsDto {
  @IsOptional()
  @IsArray()
  filters?: { key: string; op: string; value: unknown }[];

  @IsOptional()
  sort?: { key: string; order?: string };

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '分页大小不正确' })
  @Min(1, { message: '分页大小不正确' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '分页大小不正确' })
  @Min(1, { message: '分页大小不正确' })
  @Max(100, { message: '分页大小不正确' })
  pageSize?: number;
}
```

`buildRecordQuery` 仍保留同样校验，防止 service 被内部直接调用。

`form-record.service.ts`：

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppForm } from '../app-form.entity';
import { Application } from '../application.entity';
import { coerceRecordData, mergeRecordData } from './form-record.coerce';
import { buildRecordQuery, RecordQueryBody } from './form-record.query';
import { FormRecordDoc, FormRecordStore } from './form-record.store';
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
    return Array.isArray(form.fields) ? (form.fields as FormField[]) : null;
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
```

`form-record.controller.ts`：

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateRecordDto } from './dto/create-record.dto';
import { PatchRecordDto } from './dto/patch-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { FormRecordService } from './form-record.service';

@Controller('apps/:appId/forms/:formId/records')
@UseGuards(JwtAuthGuard)
export class FormRecordController {
  constructor(private readonly formRecordService: FormRecordService) {}

  @Post()
  @HttpCode(201)
  create(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: CreateRecordDto,
  ) {
    return this.formRecordService.create(req.user.id, appId, formId, dto.data);
  }

  @Post('query')
  query(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: QueryRecordsDto,
  ) {
    return this.formRecordService.query(req.user.id, appId, formId, dto);
  }

  @Get(':recordId')
  getOne(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('recordId') recordId: string,
  ) {
    return this.formRecordService.getOne(req.user.id, appId, formId, recordId);
  }

  @Patch(':recordId')
  update(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('recordId') recordId: string,
    @Body() dto: PatchRecordDto,
  ) {
    return this.formRecordService.update(
      req.user.id,
      appId,
      formId,
      recordId,
      dto.data,
    );
  }

  @Delete(':recordId')
  remove(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('recordId') recordId: string,
  ) {
    return this.formRecordService.remove(req.user.id, appId, formId, recordId);
  }
}
```

`application.module.ts`：`controllers` 加 `FormRecordController`；`providers` 加 `FormRecordStore`、`FormRecordService`。

- [ ] **Step 4: 再跑测试并编译**

Run:

```text
npx jest application/form-record/form-record.service.spec.ts
npx nest build
```

Expected: PASS；build 成功

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 提供表单填报的增删改查与筛选接口
```

---

### Task 7: 删除表单时 drop 集合，并准备 fields 列 SQL

**Files:**
- Modify: `server/src/application/application.service.ts`
- Modify: `server/src/application/application.service.spec.ts`
- Modify: `server/src/application/application.module.ts`（确保 `ApplicationService` 能注入 `FormRecordStore`）
- Create: `server/sql/2026-08-24-app-form-fields.sql`

**Interfaces:**
- Consumes: `FormRecordStore.dropFormCollection(formId)`
- `deleteForm`：先 `formRepo.remove(form)`，再 `dropFormCollection(form.id)`
- drop 抛错：用 `Logger` 记 error，不抛给客户端，不回滚已删行
- 集合不存在（store 已吞 code 26）：对 service 来说就是成功
- `syncIndexes` 本任务不接到任何 HTTP。保存 `fields` 的接口属于 2026-08-23；实现那个接口时在 MySQL 保存成功后 `await this.formRecordStore.syncIndexes(formId, fields)`，失败则 500。

- [ ] **Step 1: 扩展 deleteForm 测试**

在现有 `ApplicationService` spec 的 `providers` 增加：

```ts
const formRecordStore = {
  dropFormCollection: jest.fn(),
};
```

`{ provide: FormRecordStore, useValue: formRecordStore }`

现有 `removes form in this app` 增加：

```ts
expect(formRecordStore.dropFormCollection).toHaveBeenCalledWith(10);
```

并保证 `formRepo.remove` 先于 drop 被调用。

新增：

```ts
it('keeps form deleted when drop fails', async () => {
  repo.findOne.mockResolvedValue(ownedApp);
  formRepo.findOne.mockResolvedValue({
    id: 10,
    name: '入职登记',
    applicationId: 8,
    groupId: 2,
  });
  formRecordStore.dropFormCollection.mockRejectedValue(new Error('mongo down'));

  await expect(service.deleteForm(1, 8, 10)).resolves.toBeUndefined();
  expect(formRepo.remove).toHaveBeenCalled();
});
```

表单 404 时 `dropFormCollection` 不应被调用。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest application.service.spec.ts`

Expected: FAIL（未注入 FormRecordStore 或未调用 drop）

- [ ] **Step 3: 改 deleteForm，写 SQL，不要执行**

`ApplicationService` 构造函数增加 `private readonly formRecordStore: FormRecordStore` 和 `private readonly logger = new Logger(ApplicationService.name)`。

```ts
async deleteForm(ownerId: number, appId: number, formId: number) {
  await this.requireOwnedApp(ownerId, appId);
  const form = await this.requireForm(appId, formId);
  await this.formRepo.remove(form);
  try {
    await this.formRecordStore.dropFormCollection(form.id);
  } catch (err) {
    this.logger.error(
      `drop form collection failed formId=${form.id}`,
      err instanceof Error ? err.stack : String(err),
    );
  }
}
```

`2026-08-24-app-form-fields.sql`：

```sql
ALTER TABLE `app_form`
  ADD COLUMN `fields` json NULL COMMENT '表单设计字段数组' AFTER `name`;
```

**停下来问使用者是否执行该 SQL。** 未点名该文件、未明确同意，不得对数据库执行 `ALTER TABLE`。

- [ ] **Step 4: 再跑相关测试**

Run:

```text
npx jest application.service.spec.ts application/form-record
```

Expected: PASS

- [ ] **Step 5: 建议提交（未要求则不执行）**

```text
feat: 删除表单时丢弃 Mongo 填报集合
```

---

## 手工验证（有本地 Mongo 时）

1. `.env` 填入真实 `MONGO_URI`、`MONGO_DB_NAME`，并已执行 `fields` 列 SQL。
2. `npm run dev`：MySQL 或 Mongo 任缺一个都应起不来。
3. 登录后对已有 `formId`：`POST /api/apps/:appId/forms/:formId/records` body `{ "data": {} }`，201 且 `data` 为 `{}`（尚未保存设计时）。
4. `POST .../records/query` body `{}` 能看到刚建的行。
5. `DELETE .../records/:id` 后 query 不再包含它。
6. 删除该表单后，用 mongo shell `listCollections` 确认没有 `frm_{id}`（若从未写入过，集合可能本来就不存在）。

不在本期做真实 Mongo 的 Jest e2e。

---

## Spec 覆盖核对

| Spec | Task |
| --- | --- |
| Mongo 连接、缺配置起不来 | 4 |
| 集合 `frm_{formId}` | 1, 5 |
| 文档形状与类型转换 | 2, 5, 6 |
| 可筛索引 / `fields==null` 不建 data 索引 | 1, 5 |
| `syncIndexes` 可调用，不实现 PUT fields | 5, 7 说明 |
| 删除表单后 drop，失败只打日志 | 7 |
| 记录 CRUD + query | 6 |
| 官方驱动、无 Mongoose | 4 |
| 无前端 | Global |
| 单测 mock Mongo | 1–3, 5–7 |
