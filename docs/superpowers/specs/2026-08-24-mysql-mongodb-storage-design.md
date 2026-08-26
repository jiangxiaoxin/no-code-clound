# MySQL + MongoDB 混合存储设计

日期：2026-08-24  
状态：已确认，实现计划见 `docs/superpowers/plans/2026-08-24-mysql-mongodb-storage.md`  
相关：`docs/superpowers/specs/2026-08-23-select-table-source-design.md`（表单设计 `fields` JSON）  
范围：后端数据存放的基础架构。MySQL 存表单目录与设计配置；MongoDB 按表单分集合存填报，并按可筛字段建索引。不包含填报页、列表页、选项运行时查值。

## 1. 背景与目标

表单设计是嵌套 JSON，适合整份读写；按设计填写的数据要按各字段筛选、排序、分页。二者不能共用一种表结构。

已决定：

- 配置留在现有 MySQL 8（TypeORM，`synchronize: false`）。
- 填报不用「所有表单一张 `form_record` + JSON」，因为无法按每个表单的每个字段建索引。
- 填报也不为每个表单 `CREATE TABLE`。
- 填报用 MongoDB：一张表单一套集合，可筛字段建索引。

本期把这套后端存储接进 NestJS，使后续填报页、列表筛选、其他表数据、关联数据有统一读写面。

## 2. 本期边界

### 本期实现

- NestJS 连接 MongoDB（与现有 MySQL 并存）。启动时两者都要连上，缺一不可。
- 明确两类数据分别落在哪个库（见第 4 节）。
- 填报：集合 `frm_{formId}`，文档形状固定，写入时按当前 `fields` 做类型转换。
- 保存表单 `fields` 成功后，同步该集合的字段索引。删除表单后删除对应集合。
- 填报 CRUD + 按字段筛选的 HTTP 接口（鉴权与现有应用接口相同：已登录且为该应用 `ownerId`）。
- 用官方 `mongodb` 驱动。不用 TypeORM 连 Mongo，不为每张表单建 Mongoose Schema。
- 可筛字段索引挂在「保存 `fields` 成功之后」。若该接口尚未落地，本任务仍先完成连接与记录接口；`syncIndexes` 作为可调用函数留下，等 2026-08-23 的保存接口接上。删除表单的 drop 本任务必须接上。

### 本期不实现

- 填报页、数据列表页、任何前端界面。
- 运行时下拉「其他表数据」查值、关联数据控件、子表单独立集合。
- 筛选条件 OR 分组、公式、权限到字段/行。
- 字段改名（`key` 一经生成不可改，只改标题）。
- 删字段后回写清理历史文档里的旧 key。
- 跨库事务、Mongo 副本集自动部署、按应用删除时批量 drop（应用删除仍未做）。

## 3. 核心决策

### 3.1 配置与填报分开

```text
MySQL                          MongoDB
user / department / role       frm_{formId}  （一条填报一篇文档）
application / app_group
app_form（含 fields JSON）
dictionary / dictionary_item
```

`app_form.fields` 的语义仍以 2026-08-23 为准：可空 JSON，没保存过为 `null`，空画布为 `[]`。本设计不改这份 JSON 的字段级约定。

### 3.2 一张表单一套集合

集合名：`frm_{formId}`，`formId` 为 `app_form.id`（全局自增，不带 `appId`）。

所有填报挤在一个 collection 时，Mongo 同样大约只能 64 个索引，无法给每个表单的每个字段建索引，筛选会退回全表扫 JSON。因此禁止共用集合。

同一集合内每篇文档的 `formId` 必须等于集合名所带 id，写入时由服务写入，客户端不能改。

### 3.3 系统字段在文档根上，用户字段在 `data`

```js
{
  _id: ObjectId,
  appId: 1,
  formId: 12,
  createdBy: 3,
  createdAt: ISODate,
  updatedAt: ISODate,
  data: {
    "字段key": 值
  }
}
```

接口里 `_id` 输出为 24 位十六进制字符串。`createdBy` 是 MySQL `user.id`。列表按创建人、部门筛时本期只支持 `createdBy`（eq / in）；部门筛选以后再加，文档里不预留未用字段。

### 3.4 索引跟设计走，不跟每一笔写入走

保存 `fields` 成功之后同步索引（见第 6 节）。创建/更新记录不再 `createIndex`。

跨库没有事务：先提交 MySQL 的 `fields`，再同步 Mongo 索引。索引同步失败则该次保存接口返回 500；MySQL 里的设计已经写上。客户端重试保存即可，同步过程必须幂等。

删除表单：先删 MySQL `app_form` 行，再 `drop` 集合。drop 失败只记日志，不回滚已删的表单行（自增 id 不会复用，残留集合可人工清）。禁止先 drop 再删行，以免 MySQL 删除失败时填报已被清掉。

### 3.5 驱动与模块

全局 `MongoModule`：`onModuleInit` 用 `MONGO_URI` 连接，`onModuleDestroy` 关闭。业务通过 `MongoService.getDb()` 拿到 `Db`，再 `db.collection('frm_' + formId)`。

填报读写、索引同步、筛选翻译放在 `server/src/application/form-record/`，不把 Mongo 细节堆进现有 `ApplicationService`。`ApplicationService` 只在保存 `fields`、删除表单两处调用。

## 4. 数据放哪

| 数据 | 库 | 存放 |
| --- | --- | --- |
| 用户、部门、角色、权限 | MySQL | 现有表 |
| 应用、分组、表单目录 | MySQL | `application`、`app_group`、`app_form` |
| 表单字段与控件配置 | MySQL | `app_form.fields` JSON |
| 字典头与项 | MySQL | `dictionary`、`dictionary_item` |
| 填报记录 | MongoDB | `frm_{formId}` |
| 下拉/单选等选项本身 | MySQL 或填报 | 字典走 MySQL；`table_data` 只在字段 JSON 里存 `sourceFormId` + `sourceFieldKey`，选项值来自源表单的 Mongo 文档（运行时查值不在本期） |

## 5. 写入与类型

`data` 的 key 必须是当前 `fields` 里出现的 `key`。多出来的 key 丢弃。`fields` 为 `null` 或 `[]` 时，`data` 只能是 `{}`。

分割线、图片、文件、子表单本期写入规则：

- `divider`：不写入 `data`。
- `image` / `file`：若客户端传了值，原样存（字符串或字符串数组），不建索引。本期不做上传。
- `subform`：若为数组则存数组，否则当空数组。不建索引，不支持按子表字段筛选。

其余类型写入 Mongo 前转换：

| type | 存成 |
| --- | --- |
| `input`、`textarea`、`time`、`radio`、`select` | 字符串 |
| `number` | 数字；`null` / `''` / 缺省不写该 key |
| `date` | `YYYY-MM-DD` 字符串 |
| `datetime` | 请求为 ISO 8601 字符串，入库为 UTC 的 `Date`；空值不写该 key |
| `checkbox`、`select-multiple` | 字符串数组 |
| `member`、`dept` | 数字（对应 MySQL id）；空值不写该 key |
| `data`、`relate` | 字符串（对方记录 id） |

无法转换（例如数字字段给了对象）→ 400「字段值类型不正确」。

`key` 由前端 `crypto.randomUUID()` 生成，只含十六进制和连字符，可直接做 `data.{key}` 路径。禁止改已有字段的 `key`。

## 6. 索引

每个集合固定有：

- `_id`（默认）
- `idx_createdAt`：`{ createdAt: -1 }`
- `idx_createdBy`：`{ createdBy: 1 }`

可筛字段再加 `idx_data_{fieldKey}`，键为 `{ "data.{fieldKey}": 1 }`。`checkbox` / `select-multiple` 走 Mongo 多键索引，同一规则即可。

可筛类型：`input`、`textarea`、`number`、`date`、`time`、`datetime`、`radio`、`checkbox`、`select`、`select-multiple`、`member`、`dept`、`data`、`relate`。

不可筛（不建 `data.*` 索引）：`divider`、`image`、`file`、`subform`。

同步步骤：

1. 确保集合存在（对需要的索引 `createIndex`，集合会随索引创建）。
2. 按上面规则得到目标索引名集合。
3. 列出当前索引；缺的 `createIndex`，名称符合 `idx_data_*` 但不在目标里的 `dropIndex`。不要删除 `_id_`、`idx_createdAt`、`idx_createdBy`。

`fields` 为 `null` 时不建任何 `idx_data_*`（表单尚未保存设计）。首次写入记录时若集合不存在，先建三条系统索引再 insert。

## 7. 筛选接口语义

列表用 `POST .../records/query`，避免把复杂条件塞进 query string。条件之间只有 AND，没有 OR。

```json
{
  "filters": [
    { "key": "createdBy", "op": "eq", "value": 3 },
    { "key": "<字段key>", "op": "contains", "value": "张" }
  ],
  "sort": { "key": "createdAt", "order": "desc" },
  "page": 1,
  "pageSize": 20
}
```

- `filters`、`sort` 可缺省。缺省排序：`createdAt desc`。
- `page` 从 1 起，缺省 1。`pageSize` 缺省 20，最大 100。
- `key` 为 `createdAt` / `createdBy` 时筛文档根字段；否则必须是当前 `fields` 里的可筛字段，条件落到 `data.{key}`。
- 不可筛字段、未知 `key`、未知 `op` → 400「不支持该筛选」。

`op` 仅允许：

| op | Mongo | 适用 |
| --- | --- | --- |
| `eq` | `{ field: value }` | 全部可筛；数组字段表示包含该元素 |
| `ne` | `$ne` | 同上 |
| `in` | `$in` | `value` 必须是数组 |
| `contains` | 转义后的正则，忽略大小写 | 仅字符串字段：`input`、`textarea`、`time`、`radio`、`select`、`date` |
| `gt` / `gte` / `lt` / `lte` | `$gt` 等 | 仅 `number`、`date`、`datetime`；`createdAt` 也允许 |

`contains` 按字面量转义，禁止客户端传入正则。

### 时间字段筛选

前端按控件类型和 format 传递本地格式字符串，不传 ISO，也不传 `precision`。后端根据字段类型和字符串形状决定匹配粒度：

| `value` 示例 | 含义 |
|---|---|
| `"2026"` | 日期：该年 |
| `"2026-08"` | 日期：该月 |
| `"2026-08-01"` | 日期：该日 |
| `"14:30"` / `"14:30:00"` | 时间：按字符串比较 |
| `"2026-08-01 14:30"` | 日期时间：该分钟 |
| `"2026-08-01 14:30:00"` | 日期时间：该秒 |

日期时间仍可额外携带 `precision`（`year` / `month` / `day` / `hour` / `minute` / `second`）和带时区的 ISO，用于兼容旧调用；未带 `precision` 的本地格式字符串由服务端自行推断。`precision` 仅适用于 `datetime` 类字段的 `eq`、`ne`、`in`。

返回：

```json
{
  "items": [ { "id": "...", "appId": 1, "formId": 12, "createdBy": 3, "createdAt": "...", "updatedAt": "...", "data": {} } ],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

`items` 里用 `id` 对应 `_id` 字符串，不输出 `_id`。

## 8. HTTP 接口

前缀均为 `/api/apps/:appId/forms/:formId`。应用不存在或不属于当前用户：404「应用不存在」。表单不存在或不属于该应用：404「表单不存在」。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/records` | 新建。Body：`{ "data": {} }`。`createdBy` 为当前用户。201，返回一条记录（同列表项形状）。 |
| `POST` | `/records/query` | 筛选分页。Body 见第 7 节。 |
| `GET` | `/records/:recordId` | 单条。`recordId` 不是合法 ObjectId → 400「记录不存在」与 404 相同文案处理：一律 404「记录不存在」。 |
| `PATCH` | `/records/:recordId` | 更新 `data`（与新建同一套转换）。不改 `createdBy` / `createdAt`。刷新 `updatedAt`。 |
| `DELETE` | `/records/:recordId` | 删除。成功 200 `{ "ok": true }`。 |

`POST /records/query` 必须写在 `GET /records/:recordId` 之前，避免路由把 `query` 当成 id。

更新时 `data` 仍按「当前 fields」过滤 key；未出现在请求里的已有 key **保留**（PATCH 合并），请求里显式 `null` 的 key 从 `data` 中删掉。

## 9. 配置与本地依赖

`.env` / `.env.example` 增加：

```text
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=no_code_cloud
```

Mongo 库不存在时，驱动会在首次写入时创建。使用者自行安装并启动 MongoDB；应用不负责安装。

`MONGO_URI` 或 `MONGO_DB_NAME` 为空：启动失败，行为与 MySQL 配错一致（不要在没配 Mongo 时降级成只读 MySQL）。

## 10. 错误与边界

| 情况 | 行为 |
| --- | --- |
| Mongo 连接失败 | 进程起不来 |
| `data` 不是对象 | 400「请提交记录数据」 |
| 字段值类型不对 | 400「字段值类型不正确」 |
| 不支持的筛选 | 400「不支持该筛选」 |
| `pageSize` > 100 | 400「分页大小不正确」 |
| 记录不存在 | 404「记录不存在」 |
| 保存 fields 后索引同步失败 | 500，设计已写入 MySQL，重试保存 |
| 删表单后 drop 集合失败 | 表单已删，记日志 |
| 源表单有记录时改设计（加字段） | 旧文档缺新 key，合法；筛新字段时旧行不匹配 |
| 删字段 | 掉对应索引；旧文档仍可带该 key，接口输出仍带上，直到被 PATCH 掉 |

## 11. 测试

后端单测（mock `Db` / collection，CI 不强制起 Mongo）：

- 可筛类型 → 目标索引名；`divider` / `image` / `file` / `subform` 不进 `idx_data_*`。
- `filters` 译成的 Mongo 条件：`eq` 走 `data.key`；`contains` 已转义；未知 key / 不可筛 → 抛 400。
- 写入转换：数字、多选数组、多余 key 丢弃。
- 删除表单会调用 `drop`（mock）。

不在本期做真实 Mongo 的 e2e。手测（有本地 Mongo 时）：启动后端、建一条记录、按字段 query、删表单后集合消失。

## 12. 成功标准

1. 配好 MySQL 与 Mongo 后，后端可以启动；只配其中一个则不能当作正常启动。
2. 保存表单设计后，对应 `frm_{id}` 具备系统索引和可筛字段索引。
3. 能为该表单新建、查询（含按字段筛选）、更新、删除记录。
4. 删除表单后，MySQL 不再有该行，Mongo 集合被 drop（或 drop 失败仅留日志）。
5. 前端设计器、填报页行为不变（本期无前端改动）。

## 13. 文件

- 改：`server/src/app.module.ts`、`server/.env.example`、`server/package.json`
- 改：`server/src/application/application.module.ts`、`application.service.ts`、`application.service.spec.ts`
- 增：`server/src/mongo/mongo.module.ts`、`mongo.service.ts`
- 增：`server/src/application/form-record/`（store、service、controller、dto、筛选/索引纯函数及 spec）
