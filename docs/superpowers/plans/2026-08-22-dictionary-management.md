# 应用字典管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在应用后台维护本应用字典，并让本应用表单的单选/复选引用字典、下拉可选字典或其他表占位。

**Architecture:** 字典挂在现有 `application` 模块下，不进组织 `admin`。鉴权复用应用 `ownerId`：服务里先 `requireOwnedApp`，再读写 `dictionary` / `dictionary_item`。前端新增 `/apps/:id/backend` 布局与字典页；表单设计按字段类型写 `optionSource`（`dictionary` | `table_data`）和 `dictCode`，画布按启用项预览，不保存选项快照。

**Tech Stack:** Vue 3、Vite、Vue Router、Element Plus、Axios、NestJS 11、TypeORM、MySQL、Jest。

**Spec:** `docs/superpowers/specs/2026-08-22-dictionary-management-design.md`

## Global Constraints

- 字典归属 `applicationId`；名称、编码在同一应用内唯一；不同应用允许同名同编码。
- 编码创建后不可改；格式 `/^[a-z0-9_]{2,64}$/`。
- 鉴权与 `GET /api/apps/:id/directory` 相同：JWT + `ownerId`。不新增组织权限码，不改 `server/src/admin/permissions.ts`。
- 应用不存在或不属于当前用户时 `404`「应用不存在」，不暴露他人应用。
- 删除/停用不检查引用，不因占用返回 `409`；只做确认提示。
- 单选、复选只有字典；下拉 `optionSource` 仅为 `dictionary` 或 `table_data`；`table_data` 本期只占位。
- 不保存字段 `options` 数组。
- TypeORM 保持 `synchronize: false`；SQL 脚本生成后必须停下，获得使用者点名该脚本的明确许可才能执行。
- 不新增 npm 依赖。
- 新建前端页面不使用 `el-text`、`el-space`。工作台已有 `el-text` 不要顺手改掉。
- 不删除、修改或移动使用者已有注释和日志输出。
- 未经使用者明确要求，不执行 git commit；每个任务只给出建议提交信息。
- 后端按 TDD：先写失败测试，再实现，再跑测试。
- 统一接口响应保持 `{ code, message, data }`。

---

## File Structure

```text
server/
  sql/
    2026-08-22-dictionary.sql
  src/application/
    application.module.ts
    dictionary/
      dictionary.entity.ts
      dictionary-item.entity.ts
      dictionary.service.ts
      dictionary.service.spec.ts
      dictionary.controller.ts
      dto/dictionary-item-input.dto.ts
      dto/create-dictionary.dto.ts
      dto/update-dictionary.dto.ts
      dto/list-dictionary.dto.ts
      dto/items-by-codes.dto.ts

front/src/
  api/apps.js
  layouts/AppBackendLayout.vue
  components/app-backend/DictionaryForm.vue
  views/app-backend/AppDictionariesView.vue
  views/AppWorkspaceView.vue
  views/FormDesignView.vue
  components/FormDesignPanel.vue
  components/form-design/FormDesignProps.vue
  components/form-design/FormDesignCanvas.vue
  components/form-design/FormDesignCanvasField.vue
  router/index.js
```

职责边界：

- `dictionary.service` 校验应用归属、字典头/项合法性、应用内唯一性；不统计表单引用。
- `dictionary.controller` 只做 HTTP 映射；`options`、`by-code`、`items-by-codes` 声明在 `/:id` 之前。
- 应用后台布局只负责返回工作台、显示应用名、左侧模块导航。
- 字典页编排查询和启停删除；`DictionaryForm` 维护字典头和项列表。
- 表单设计：属性面板改 `optionSource` / `dictCode`；画布用批量编码接口拉启用项预览。

不要改：`AdminLayout.vue` 菜单、`permissions.ts`、`RolesGuard`、现有注释和 `console.log`。

---

### Task 1: 数据实体与 SQL 脚本

**Files:**

- Create: `server/src/application/dictionary/dictionary.entity.ts`
- Create: `server/src/application/dictionary/dictionary-item.entity.ts`
- Create: `server/sql/2026-08-22-dictionary.sql`

**Interfaces:**

- `Dictionary.status`: `'active' | 'disabled'`
- `DictionaryItem.status`: `'active' | 'disabled'`
- 不设 TypeORM 关系装饰器，不设数据库外键；删除时由服务层先删项再删头。

- [ ] **Step 1: 写 Dictionary 实体**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dictionary')
@Index('uk_dictionary_app_code', ['applicationId', 'code'], { unique: true })
@Index('uk_dictionary_app_name', ['applicationId', 'name'], { unique: true })
@Index('IDX_dictionary_applicationId', ['applicationId'])
export class Dictionary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  applicationId: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'disabled';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: 写 DictionaryItem 实体**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dictionary_item')
@Index('uk_dictionary_item_value', ['dictionaryId', 'value'], { unique: true })
@Index('IDX_dictionary_item_dictionaryId', ['dictionaryId'])
export class DictionaryItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  dictionaryId: number;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ type: 'varchar', length: 64 })
  value: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'disabled';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: 写 SQL 脚本（只生成，不执行）**

`server/sql/2026-08-22-dictionary.sql`：

```sql
-- 应用字典迁移
-- 未获得使用者明确许可前不得执行。失败时整体回滚。

START TRANSACTION;

CREATE TABLE `dictionary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `name` varchar(32) NOT NULL,
  `code` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dictionary_app_code` (`applicationId`, `code`),
  UNIQUE KEY `uk_dictionary_app_name` (`applicationId`, `name`),
  KEY `IDX_dictionary_applicationId` (`applicationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `dictionary_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dictionaryId` int NOT NULL,
  `label` varchar(64) NOT NULL,
  `value` varchar(64) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dictionary_item_value` (`dictionaryId`, `value`),
  KEY `IDX_dictionary_item_dictionaryId` (`dictionaryId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
```

禁止：预置业务字典、改组织权限表、`synchronize: true`、对本脚本执行 mysql。

- [ ] **Step 4: 静态核对**

列名、长度、默认值、唯一索引与实体一致。本任务结束时 SQL 必须仍未执行。

**Verification:**

```powershell
npm run build --prefix server
```

Expected: 编译可能因实体尚未注册模块而仍通过（未引用的 ts 也会被 nest 编译进项目的话，确认无类型错误即可）。若 `nest build` 未收录未引用文件，至少保证这两个实体文件无 TS 错误。SQL 文件存在且未对数据库执行。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
新增应用字典表实体和迁移脚本
```

---

### Task 2: DictionaryService 管理接口（TDD）

**Files:**

- Create: `server/src/application/dictionary/dto/dictionary-item-input.dto.ts`
- Create: `server/src/application/dictionary/dto/create-dictionary.dto.ts`
- Create: `server/src/application/dictionary/dto/update-dictionary.dto.ts`
- Create: `server/src/application/dictionary/dto/list-dictionary.dto.ts`
- Create: `server/src/application/dictionary/dictionary.service.spec.ts`
- Create: `server/src/application/dictionary/dictionary.service.ts`

**Interfaces:**

- Consumes: `Application` 仓库（`findOne({ where: { id, ownerId } })`），找不到抛 `NotFoundException('应用不存在')`，与 `ApplicationService.requireOwnedApp` 文案一致。
- Produces:

```ts
export type DictionaryListItem = {
  id: number;
  applicationId: number;
  name: string;
  code: string;
  description: string;
  status: 'active' | 'disabled';
  itemCount: number;
};

export type DictionaryItemView = {
  id: number;
  label: string;
  value: string;
  sortOrder: number;
  status: 'active' | 'disabled';
};

export type DictionaryDetail = DictionaryListItem & {
  items: DictionaryItemView[];
};
```

方法：

```ts
list(ownerId: number, appId: number, query: ListDictionaryDto): Promise<DictionaryListItem[]>
getOne(ownerId: number, appId: number, id: number): Promise<DictionaryDetail>
create(ownerId: number, appId: number, dto: CreateDictionaryDto): Promise<DictionaryDetail>
update(ownerId: number, appId: number, id: number, dto: UpdateDictionaryDto): Promise<DictionaryDetail>
delete(ownerId: number, appId: number, id: number): Promise<void>
```

错误文案固定：

| 情况 | 异常 | message |
| --- | --- | --- |
| 应用不属于当前用户 | `NotFoundException` | `应用不存在` |
| 管理接口字典不存在或不属于该应用 | `NotFoundException` | `字典不存在` |
| 名称空/超长 | `BadRequestException` | `字典名称须为 1–32 个字` |
| 编码不合法 | `BadRequestException` | `字典编码须为 2–64 位小写字母、数字或下划线` |
| 项 label/value 不合法 | `BadRequestException` | `字典项名称须为 1–64 个字` / `字典项值须为 1–64 个字` |
| 同一请求 `value` 重复 | `BadRequestException` | `同一请求里选项值不能重复` |
| 同应用名称重复 | `ConflictException` | `同一应用内字典名称已存在` |
| 同应用编码重复 | `ConflictException` | `同一应用内字典编码已存在` |

DTO：

```ts
// dictionary-item-input.dto.ts
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class DictionaryItemInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64, { message: '字典项名称须为 1–64 个字' })
  label: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64, { message: '字典项值须为 1–64 个字' })
  value: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
```

```ts
// create-dictionary.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { DictionaryItemInputDto } from './dictionary-item-input.dto';

export class CreateDictionaryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32, { message: '字典名称须为 1–32 个字' })
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[a-z0-9_]{2,64}$/, {
    message: '字典编码须为 2–64 位小写字母、数字或下划线',
  })
  code: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 255)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DictionaryItemInputDto)
  items: DictionaryItemInputDto[];
}
```

```ts
// update-dictionary.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { DictionaryItemInputDto } from './dictionary-item-input.dto';

export class UpdateDictionaryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32, { message: '字典名称须为 1–32 个字' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 255)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DictionaryItemInputDto)
  items?: DictionaryItemInputDto[];
}
```

```ts
// list-dictionary.dto.ts
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListDictionaryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
```

- [ ] **Step 1: 写失败测试**

`dictionary.service.spec.ts` 用仓库 mock，模式对齐 `application.service.spec.ts` + `role.service.spec.ts` 的 `DataSource.transaction`。

`ownedApp = { id: 8, name: '进销存', icon: '#E8A317', ownerId: 1 }`。

必须覆盖：

1. `create`：非 owner → `NotFoundException('应用不存在')`，不写字典仓库。
2. `create`：编码 `LeaveType` → `BadRequestException`（编码格式）。
3. `create`：同应用已有同名 → `ConflictException('同一应用内字典名称已存在')`。
4. `create`：同应用已有同编码 → `ConflictException('同一应用内字典编码已存在')`。
5. `create`：应用 8 创建 `leave_type` 成功；应用 9 允许再创建同名同编码（`assertNameUnique` / `assertCodeUnique` 必须带 `applicationId`）。
6. `create`：`items: [{ label: '年假', value: 'annual' }, { label: '调休', value: 'annual' }]` → `BadRequestException('同一请求里选项值不能重复')`。
7. `create`：事务内先存字典头再存项；返回含 `itemCount` 和 `items`。
8. `list`：按 `applicationId` 过滤；`keyword` 匹配 name 或 code（`Like`）；`status` 过滤；每条带 `itemCount`（对每个字典 `itemRepo.count({ where: { dictionaryId } })`）。
9. `getOne`：含停用项；字典 id 属于其他应用 → `字典不存在`。
10. `update`：请求体即使带 `code` 也不能改编码（DTO 无 `code`；服务不读 `code`）。改名冲突 → 409。传入 `items` 则 `manager.delete(DictionaryItem, { dictionaryId })` 再插入新项。不传 `items` 则不删项。
11. `delete`：先删项再删头；字典不存在 → 404。删除成功不抛「被引用」。

示例（create 非 owner）：

```ts
it('rejects create when app is not owned', async () => {
  appRepo.findOne.mockResolvedValue(null);
  await expect(
    service.create(1, 8, {
      name: '请假类型',
      code: 'leave_type',
      items: [],
    }),
  ).rejects.toMatchObject({ message: '应用不存在' });
  expect(dictRepo.save).not.toHaveBeenCalled();
});
```

示例（跨应用同编码允许）：

```ts
it('allows the same code in another application', async () => {
  appRepo.findOne.mockResolvedValue({ id: 9, ownerId: 1 });
  dictRepo.findOne.mockResolvedValue(null);
  manager.create.mockImplementation((_e: unknown, value: unknown) => value);
  manager.save.mockImplementation(async (_e: unknown, value: unknown) => {
    if (Array.isArray(value)) return value;
    return { id: 2, status: 'active', description: '', ...(value as object) };
  });

  await expect(
    service.create(1, 9, { name: '请假类型', code: 'leave_type', items: [] }),
  ).resolves.toMatchObject({ applicationId: 9, code: 'leave_type' });

  expect(dictRepo.findOne).toHaveBeenCalledWith({
    where: { applicationId: 9, name: '请假类型' },
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm test --prefix server -- dictionary.service.spec.ts
```

Expected: FAIL（`DictionaryService` 未定义或方法不存在）。

- [ ] **Step 3: 最小实现**

`DictionaryService` 注入：

```ts
constructor(
  @InjectRepository(Application) private readonly appRepo: Repository<Application>,
  @InjectRepository(Dictionary) private readonly dictRepo: Repository<Dictionary>,
  @InjectRepository(DictionaryItem) private readonly itemRepo: Repository<DictionaryItem>,
  private readonly dataSource: DataSource,
) {}
```

要点：

- `requireOwnedApp`：`findOne({ where: { id: appId, ownerId } })`，没有则 `应用不存在`。
- `requireDict(appId, id)`：`findOne({ where: { id, applicationId: appId } })`，没有则 `字典不存在`。
- `assertCode(code)`：`/^[a-z0-9_]{2,64}$/`。
- `assertNameUnique(appId, name, excludeId?)` / `assertCodeUnique(...)`：命中且 id 不同则 409。
- `normalizeItems(items)`：trim；`sortOrder` 缺省 `0`；`status` 缺省 `'active'`；用 `Set` 查重复 `value`。
- `create` / `update`(含 items) / `delete` 走 `dataSource.transaction`。
- `list` 的 keyword 与角色列表相同：`where` 为 name Like 或 code Like 的数组，并带上 `applicationId`（以及可选 `status`）。
- `itemCount`：对当前页每条 `this.itemRepo.count({ where: { dictionaryId: row.id } })`。
- `getOne` 的项：`order: { sortOrder: 'ASC', id: 'ASC' }`，含 `disabled`。
- `update` 忽略任何 `code` 字段。

- [ ] **Step 4: 跑测试确认通过**

```powershell
npm test --prefix server -- dictionary.service.spec.ts
```

Expected: PASS。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
实现应用内字典的增删改查
```

---

### Task 3: 表单引用接口、Controller、模块注册（TDD）

**Files:**

- Modify: `server/src/application/dictionary/dictionary.service.ts`
- Modify: `server/src/application/dictionary/dictionary.service.spec.ts`
- Create: `server/src/application/dictionary/dto/items-by-codes.dto.ts`
- Create: `server/src/application/dictionary/dictionary.controller.ts`
- Modify: `server/src/application/application.module.ts`

**Interfaces:**

- Produces:

```ts
options(ownerId: number, appId: number): Promise<{ id: number; name: string; code: string }[]>
listEnabledItemsByCode(ownerId: number, appId: number, code: string): Promise<{ label: string; value: string }[]>
listEnabledItemsByCodes(
  ownerId: number,
  appId: number,
  codes: string[],
): Promise<{ code: string; items: { label: string; value: string }[] }[]>
```

- [ ] **Step 1: 追加失败测试**

测试文件引入 `import { In } from 'typeorm'`。

```ts
it('options returns only enabled dictionaries of this app by name', async () => {
  appRepo.findOne.mockResolvedValue(ownedApp);
  dictRepo.find.mockResolvedValue([
    { id: 2, name: '请假类型', code: 'leave_type' },
    { id: 1, name: '加班类型', code: 'ot_type' },
  ]);

  await expect(service.options(1, 8)).resolves.toEqual([
    { id: 2, name: '请假类型', code: 'leave_type' },
    { id: 1, name: '加班类型', code: 'ot_type' },
  ]);

  expect(dictRepo.find).toHaveBeenCalledWith({
    where: { applicationId: 8, status: 'active' },
    order: { name: 'ASC' },
  });
});

it('listEnabledItemsByCode returns empty when dictionary is missing', async () => {
  appRepo.findOne.mockResolvedValue(ownedApp);
  dictRepo.find.mockResolvedValue([]);
  await expect(service.listEnabledItemsByCode(1, 8, 'leave_type')).resolves.toEqual([]);
});

it('listEnabledItemsByCode returns enabled items even if dictionary is disabled', async () => {
  appRepo.findOne.mockResolvedValue(ownedApp);
  dictRepo.find.mockResolvedValue([
    { id: 4, applicationId: 8, code: 'leave_type', status: 'disabled' },
  ]);
  itemRepo.find.mockResolvedValue([
    { dictionaryId: 4, label: '年假', value: 'annual' },
  ]);

  await expect(service.listEnabledItemsByCode(1, 8, 'leave_type')).resolves.toEqual([
    { label: '年假', value: 'annual' },
  ]);
});

it('options rejects when app is not owned', async () => {
  appRepo.findOne.mockResolvedValue(null);
  await expect(service.options(1, 8)).rejects.toMatchObject({ message: '应用不存在' });
});

it('listEnabledItemsByCodes returns items aligned to unique codes', async () => {
  appRepo.findOne.mockResolvedValue(ownedApp);
  dictRepo.find.mockResolvedValue([
    { id: 4, code: 'leave_type', status: 'disabled' },
    { id: 5, code: 'ot_type', status: 'active' },
  ]);
  itemRepo.find.mockResolvedValue([
    { dictionaryId: 4, label: '年假', value: 'annual' },
    { dictionaryId: 5, label: '工作日', value: 'workday' },
  ]);

  await expect(
    service.listEnabledItemsByCodes(1, 8, ['leave_type', 'missing', 'leave_type', 'ot_type']),
  ).resolves.toEqual([
    { code: 'leave_type', items: [{ label: '年假', value: 'annual' }] },
    { code: 'missing', items: [] },
    { code: 'ot_type', items: [{ label: '工作日', value: 'workday' }] },
  ]);

  expect(dictRepo.find).toHaveBeenCalledWith({
    where: { applicationId: 8, code: In(['leave_type', 'missing', 'ot_type']) },
  });
});

it('listEnabledItemsByCodes returns empty for empty codes', async () => {
  appRepo.findOne.mockResolvedValue(ownedApp);
  await expect(service.listEnabledItemsByCodes(1, 8, [])).resolves.toEqual([]);
  expect(dictRepo.find).not.toHaveBeenCalled();
});
```

停用字典：`options` 的 `where.status = 'active'`，因此不会出现。按编码取项不要求字典本身 `active`。`listEnabledItemsByCode` 可复用 `listEnabledItemsByCodes([code])` 后取第一项的 `items`。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm test --prefix server -- dictionary.service.spec.ts
```

Expected: FAIL（`options` / `listEnabledItemsByCode` / `listEnabledItemsByCodes` 不存在）。

- [ ] **Step 3: 实现引用方法并写 Controller**

`listEnabledItemsByCodes`：先 `requireOwnedApp`；trim 后去掉空串，按首次出现顺序去重。空则 `[]`。`dictRepo.find({ where: { applicationId: appId, code: In(codes) } })`。对找到的字典一次 `itemRepo.find({ where: { dictionaryId: In(ids), status: 'active' }, order: { sortOrder: 'ASC', id: 'ASC' } })`，按 `dictionaryId` 分组后按入参编码组装。未找到的编码 `items: []`。

`listEnabledItemsByCode`：调用 `listEnabledItemsByCodes(ownerId, appId, [code])`，返回对应 `items`（无则 `[]`）。

`items-by-codes.dto.ts`：

```ts
import { Transform } from 'class-transformer';
import { IsArray, IsString } from 'class-validator';

export class ItemsByCodesDto {
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsArray()
  @IsString({ each: true })
  codes: string[];
}
```

在 Controller 的 `options` 之后、`by-code` 之前增加：

```ts
@Post('items-by-codes')
@HttpCode(200)
listEnabledItemsByCodes(
  @Req() req: { user: { id: number } },
  @Param('appId', ParseIntPipe) appId: number,
  @Body() dto: ItemsByCodesDto,
) {
  return this.dictionaryService.listEnabledItemsByCodes(
    req.user.id,
    appId,
    dto.codes,
  );
}
```

`options`、`by-code`、`items-by-codes` 必须写在 `@Get(':id')` 上面。`create` 仍是 `@Post()` 且 `@HttpCode(201)`，与 `items-by-codes` 路径不同。

`dictionary.controller.ts`：

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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { ItemsByCodesDto } from './dto/items-by-codes.dto';
import { ListDictionaryDto } from './dto/list-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { DictionaryService } from './dictionary.service';

@Controller('apps/:appId/dictionaries')
@UseGuards(JwtAuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get()
  list(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Query() query: ListDictionaryDto,
  ) {
    return this.dictionaryService.list(req.user.id, appId, query);
  }

  @Get('options')
  options(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
  ) {
    return this.dictionaryService.options(req.user.id, appId);
  }

  @Post('items-by-codes')
  @HttpCode(200)
  listEnabledItemsByCodes(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: ItemsByCodesDto,
  ) {
    return this.dictionaryService.listEnabledItemsByCodes(
      req.user.id,
      appId,
      dto.codes,
    );
  }

  @Get('by-code/:code/items')
  listEnabledItemsByCode(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('code') code: string,
  ) {
    return this.dictionaryService.listEnabledItemsByCode(
      req.user.id,
      appId,
      code,
    );
  }

  @Get(':id')
  getOne(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaryService.getOne(req.user.id, appId, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: CreateDictionaryDto,
  ) {
    return this.dictionaryService.create(req.user.id, appId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDictionaryDto,
  ) {
    return this.dictionaryService.update(req.user.id, appId, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaryService.delete(req.user.id, appId, id);
  }
}
```

`options`、`by-code`、`items-by-codes` 必须写在 `@Get(':id')` 上面。

`application.module.ts`：

```ts
imports: [
  TypeOrmModule.forFeature([
    Application,
    AppGroup,
    AppForm,
    Dictionary,
    DictionaryItem,
  ]),
  AuthModule,
],
controllers: [ApplicationController, DictionaryController],
providers: [ApplicationService, DictionaryService],
```

不要把字典控制器塞进 `admin` 模块。

- [ ] **Step 4: 跑测试与编译**

```powershell
npm test --prefix server -- dictionary.service.spec.ts
npm test --prefix server
npm run build --prefix server
```

Expected: 字典测试通过；全量服务测试通过；编译通过。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
暴露应用字典管理与表单引用接口
```

---

### Task 4: 应用后台布局与字典管理页

**Files:**

- Modify: `front/src/api/apps.js`
- Create: `front/src/layouts/AppBackendLayout.vue`
- Create: `front/src/components/app-backend/DictionaryForm.vue`
- Create: `front/src/views/app-backend/AppDictionariesView.vue`
- Modify: `front/src/router/index.js`
- Modify: `front/src/views/AppWorkspaceView.vue`

**Interfaces:**

- Consumes: `/api/apps/:appId/dictionaries` 全套管理接口；`getAppApi(id)` 取应用名。
- Produces: 路由

```text
/apps/:id/backend              → /apps/:id/backend/dictionaries
/apps/:id/backend/dictionaries
```

- [ ] **Step 1: 在 `front/src/api/apps.js` 追加**

```js
export function listDictionariesApi(appId, params) {
  return http.get(`/apps/${appId}/dictionaries`, { params })
}

export function getDictionaryApi(appId, id) {
  return http.get(`/apps/${appId}/dictionaries/${id}`)
}

export function createDictionaryApi(appId, payload) {
  return http.post(`/apps/${appId}/dictionaries`, payload)
}

export function updateDictionaryApi(appId, id, payload) {
  return http.patch(`/apps/${appId}/dictionaries/${id}`, payload)
}

export function deleteDictionaryApi(appId, id) {
  return http.delete(`/apps/${appId}/dictionaries/${id}`)
}

export function listDictionaryOptionsApi(appId) {
  return http.get(`/apps/${appId}/dictionaries/options`)
}

export function listDictionaryItemsByCodeApi(appId, code) {
  return http.get(`/apps/${appId}/dictionaries/by-code/${encodeURIComponent(code)}/items`)
}

export function listDictionaryItemsByCodesApi(appId, codes) {
  return http.post(`/apps/${appId}/dictionaries/items-by-codes`, { codes })
}
```

不要写到 `admin.js`。

- [ ] **Step 2: 写 `AppBackendLayout.vue`**

结构对齐 `AdminLayout.vue`，差异如下：

- 箭头 `@click` 到 `{ name: 'app-workspace', params: { id: appId } }`，`title="返回工作台"`。
- 标题用 `<h1 class="admin-title">{{ appName }}</h1>`，不要 `el-text`。
- `onMounted` / `watch appId` 调 `getAppApi`；失败且非 401 则 `router.replace('/')`。
- 左侧只有一项：`el-menu-item` `index` 为 `` `/apps/${appId}/backend/dictionaries` ``，文案「字典管理」，图标 `CollectionTag`。
- 右侧顶栏可省略组织后台那种头像（应用后台不需要账号区）；若加了也不要用 `el-space`。
- aside 的 `el-menu` 设 `border-right: none`，避免与 aside 双边框。
- 主区域同样 `padding: 12px`、`overflow: hidden`、白底。
- 不要出现人员/部门/角色菜单。

- [ ] **Step 3: 写 `DictionaryForm.vue`**

对话框：新建「新建字典」/ 编辑「编辑字典」。`label-position="left"` `label-width="100px"`。

字段：

- 名称：必填，1–32，placeholder「请输入字典名称」
- 编码：必填，`/^[a-z0-9_]{2,64}$/`；编辑时 `disabled`
- 说明：选填，textarea，0–255
- 字典项：表格列 名称、值、排序、状态、操作。底部「添加选项」。至少允许 0 项。状态用 `el-select`：启用 `active` / 停用 `disabled`。删除行用链接按钮。

提交 payload：

```js
{
  name: form.name.trim(),
  description: form.description.trim(),
  items: form.items.map((item, index) => ({
    label: item.label.trim(),
    value: item.value.trim(),
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status || 'active',
  })),
}
```

新建时额外带 `code`。编辑时始终带 `items`（整体替换）。打开时若是编辑，父组件已传入含 `items` 的详情。

项校验：每一行 label、value 必填；前端可用表单规则或提交前检查，重复 value 提示「同一请求里选项值不能重复」。

- [ ] **Step 4: 写 `AppDictionariesView.vue`**

复用 `front/src/styles/admin-page.less`（`@import '../../styles/admin-page.less'`）。交互对齐 `AdminRolesView.vue`：

- 标题「字典管理」，主按钮「新增字典」（owner 页不需要权限码判断）。
- 筛选：关键词 placeholder「搜索名称或编码」、状态、查询按钮 `type="primary" :icon="Search"`。
- `el-table` `border` `stripe` `height="100%"`，包在 `.table-wrap`。
- 列：名称、编码、状态（启用/停用 tag）、项数量 `itemCount`、操作（编辑 / 启用或停用 / 删除）。
- `appId` 来自 `route.params.id`。
- 编辑：先 `getDictionaryApi` 再打开表单（需要完整 `items`）。
- 停用确认文案：`停用后，已引用本字典的功能可能发生错误。确定停用吗？`
- 启用确认：`确定启用「${name}」？`
- 删除确认：`删除后不可恢复，本应用已引用该字典的表单可能显示为空。确定删除「${name}」？`
- 启停走 `updateDictionaryApi(appId, id, { status })`，不要因为引用失败拦截（后端也不会 409）。
- 错误交给 http 拦截器；`catch` 里不要再弹一次。

- [ ] **Step 5: 注册路由**

在 `front/src/router/index.js` 的 `/apps/:id` 与 `/apps/:id/forms/:formId` 附近增加：

```js
{
  path: '/apps/:id/backend',
  component: () => import('../layouts/AppBackendLayout.vue'),
  redirect: (to) => ({
    name: 'app-dictionaries',
    params: { id: to.params.id },
  }),
  children: [
    {
      path: 'dictionaries',
      name: 'app-dictionaries',
      component: () => import('../views/app-backend/AppDictionariesView.vue'),
    },
  ],
},
```

不要给这些路由加 `meta.permission`。不要改 `/admin` 子路由。

- [ ] **Step 6: 工作台左下入口**

改 `AppWorkspaceView.vue`：

1. aside 里 `.aside-tree` 之后增加页脚，不要改现有 `el-text` 和注释。
2. 页脚不要用 `el-text` / `el-space`：

```html
<div class="aside-footer">
  <button type="button" class="aside-backend" @click="goBackend">应用后台</button>
</div>
```

```js
function goBackend() {
  router.push({ name: 'app-dictionaries', params: { id: appId.value } })
}
```

3. 样式：`.workspace-aside` 已是 column；`.aside-tree` 保持 `flex: 1; min-height: 0`；页脚 `flex-shrink: 0`，顶部分隔线，按钮全宽、左对齐、透明底。

```less
.aside-footer {
  flex-shrink: 0;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color);
}

.aside-backend {
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-regular);
  text-align: left;
  font-size: 14px;
  cursor: pointer;
}

.aside-backend:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}
```

**Verification:**

```powershell
npm run build --prefix front
```

Expected: 前端编译通过。手工：登录后进某应用，左下「应用后台」进入字典页；箭头回工作台；`/admin` 菜单仍只有人员/部门/角色。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加应用后台入口和字典管理页
```

---

### Task 5: 表单设计引用字典与下拉占位

**Files:**

- Modify: `front/src/views/FormDesignView.vue`
- Modify: `front/src/components/FormDesignPanel.vue`
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/form-design/FormDesignCanvas.vue`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`

**Interfaces:**

- 字段 JSON：

```json
{ "type": "radio", "optionSource": "dictionary", "dictCode": "leave_type" }
{ "type": "select", "optionSource": "dictionary", "dictCode": "leave_type" }
{ "type": "select", "optionSource": "table_data" }
```

- `optionSource` 只允许 `dictionary` | `table_data`。单选/复选不得写成 `table_data`。
- 不写 `options` 数组。预览 JSON 含 `optionSource` 和（字典时）`dictCode`。

- [ ] **Step 1: 向下传递 `appId`**

`FormDesignView.vue` 已有 `appId`。设计页改为：

```html
<FormDesignPanel v-if="page === 'design'" :app-id="appId" />
```

不要顺手把该文件里现有 `el-text` 改掉。

`FormDesignPanel.vue`：

```js
const props = defineProps({
  appId: { type: Number, required: true },
})
```

把 `appId` 传给 `FormDesignProps`。画布不需要 `appId`：由面板按编码批量取项后，把每条字段的 `items` 传下去。

- [ ] **Step 2: 新建字段默认值**

`addField` 在现有字段对象上追加（不要删现有 number/date 等分支）：

```js
...(item.type === 'radio' || item.type === 'checkbox'
  ? { optionSource: 'dictionary', dictCode: '' }
  : {}),
...(item.type === 'select'
  ? { optionSource: 'dictionary', dictCode: '' }
  : {}),
```

复制字段时已有 `...field`，会带上这两个键。不要生成 `options`。

选中旧字段时，在 `selectField` 里补缺省（只补，不删使用者其它键）：

```js
if (field.type === 'radio' || field.type === 'checkbox') {
  if (!field.optionSource) field.optionSource = 'dictionary'
  if (field.dictCode == null) field.dictCode = ''
}
if (field.type === 'select') {
  if (!field.optionSource) field.optionSource = 'dictionary'
  if (field.optionSource === 'dictionary' && field.dictCode == null) {
    field.dictCode = ''
  }
}
```

- [ ] **Step 3: 属性面板**

`FormDesignProps.vue` 增加 `appId` prop。在「字段宽度」之前插入选项来源区。

单选、复选：只显示「选项字典」`el-select`，`v-model="field.dictCode"`，`clearable`，`placeholder="请选择字典"`。选项来自 `listDictionaryOptionsApi(appId)`，`label=name`，`value=code`。不要自定义选项编辑，不要「其他表」。

下拉：

1. 「数据源」`el-radio-group` `v-model="field.optionSource"`：
   - `dictionary` → 字典
   - `table_data` → 其他表数据
2. `optionSource === 'dictionary'` 时显示与单选相同的字典下拉。
3. `optionSource === 'table_data'` 时不渲染后续配置（不要选表、映射、过滤）。
4. 切换数据源：

```js
function onOptionSourceChange(value) {
  if (value === 'table_data') {
    delete field.dictCode
  } else if (field.dictCode == null) {
    field.dictCode = ''
  }
}
```

`table_data` 的 JSON 不要带 `dictCode`。`dictionary` 可带空字符串表示未选。

加载 options：`watch appId` + `onMounted`，失败交给拦截器。

- [ ] **Step 4: 画布预览**

`FormDesignPanel` 根据当前字段收集要用的编码：类型为 `radio` / `checkbox` / `select`，且 `(optionSource || 'dictionary') === 'dictionary'`，且 `dictCode` 非空。去重后调用一次 `listDictionaryItemsByCodesApi(appId, codes)`。得到 `{ code, items }[]` 后做成 `dictItemsByCode` 映射。`codes` 为空时不要请求，映射置 `{}`。`watch` 字段列表里的 `dictCode` / `optionSource` 以及 `appId`。

`FormDesignCanvas` 把每个字段对应的 `items` 传给 `FormDesignCanvasField`：`dictItemsByCode[field.dictCode] || []`。不要把项写进 `field` 对象。

`FormDesignCanvasField.vue`：

- 增加 prop `items`，默认 `[]`。字段自己不发请求。
- **单选**：删掉写死的「选项一/选项二」，改为：

```html
<el-radio-group v-else-if="field.type === 'radio'" disabled>
  <el-radio v-for="item in items" :key="item.value" :value="item.value">
    {{ item.label }}
  </el-radio>
</el-radio-group>
```

- **复选**：同样用 `items`，不要占位选项。
- **下拉**：从原来的「select 与 member/dept/data/relate 共用一个 el-select」里拆出 `field.type === 'select'`：

```html
<el-select
  v-else-if="field.type === 'select'"
  disabled
  class="canvas-full"
  :placeholder="field.placeholder"
>
  <el-option
    v-for="item in items"
    :key="item.value"
    :label="item.label"
    :value="item.value"
  />
</el-select>
```

`optionSource === 'table_data'` 或未选字典时 `items` 为空，下拉保持空。member/dept/data/relate 仍走原来的空 `el-select`。

画布字段上那三条使用者注释必须原样保留。

- [ ] **Step 5: 预览 JSON**

现有 `JSON.stringify(fields)` 即可。确认单选/复选没有 `optionSource: 'table_data'`，下拉 `table_data` 没有 `options`，字典模式没有把接口返回的项写进字段对象。

**Verification:**

```powershell
npm run build --prefix front
npm test --prefix server
npm run build --prefix server
```

Expected: 前后端编译通过；后端测试通过。手工：应用 A 建字典后，该应用表单能选到；应用 B 选不到。单选/复选只有字典；下拉可切到其他表且无后续配置、画布为空。停用字典后属性面板列表不再出现；已选编码的画布仍能拉到启用项（或字典删除后为空）。组织后台无字典菜单。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
表单设计改为引用应用字典
```

---

## SQL 执行闸门

全部代码可以先写完。`server/sql/2026-08-22-dictionary.sql` **不得**在本计划任何任务里执行。

只有使用者用明确语句点名该脚本（例如「执行 `server/sql/2026-08-22-dictionary.sql`」）之后，才能对目标库运行。执行前复述脚本路径并等待确认的规则与组织权限迁移相同。

---

## Self-Review

**Spec coverage:**

| 规格 | 任务 |
| --- | --- |
| 工作台左下应用后台 | Task 4 Step 6 |
| 应用后台布局、返回工作台、仅字典导航 | Task 4 Step 2 / 5 |
| dictionary + dictionary_item、应用内唯一、编码不可改 | Task 1–2 |
| owner 鉴权、非 owner 404 | Task 2–3 |
| options / by-code / items-by-codes，停用字典不在 options，按编码仍返回启用项，缺失返回 [] | Task 3 |
| 单选/复选仅字典；下拉 dictionary / table_data 占位 | Task 5 |
| 不保存 options 快照 | Task 5 |
| 删除/停用只确认不 409 | Task 2、Task 4 |
| SQL 只生成不执行、不改权限表、不预置字典 | Task 1 + SQL 闸门 |
| 不进 `/admin`、不加权限码 | Task 3–4 |
| 不改使用者注释和日志 | Global + Task 5 画布注释 |

**Placeholder scan:** 无 TBD；`table_data` 后续选表明确不实现。

**Type consistency:** `optionSource` 全程 `dictionary` | `table_data`（不是 `data`）。引用接口名 `listEnabledItemsByCode` / `listEnabledItemsByCodes` / `listDictionaryItemsByCodesApi`。列表字段 `itemCount`。批量结果形如 `{ code, items }[]`。
