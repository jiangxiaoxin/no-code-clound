# 字典管理设计

日期：2026-08-22  
状态：已确认，实现计划见 `docs/superpowers/plans/2026-08-22-dictionary-management.md`  
范围：应用后台中的字典模块，以及本应用表单里单选、复选对字典的引用，和下拉框的数据源（字典 / 其他表占位）。

## 1. 背景与目标

组织管理后台（人员、部门、角色）已经存在。表单设计里的单选、复选、下拉仍使用占位选项，字段 JSON 也不保存选项来源。

字典不是平台级配置，而是**某个应用建好之后**，在该应用的「应用后台」里维护。默认只供本应用的表单使用。

本设计要完成：

1. 工作台左侧下方增加「应用后台」入口。
2. 应用后台提供字典管理：字典头 + 字典项。
3. 字典带 `applicationId`，名称和编码在应用内唯一。
4. 本应用表单里：单选、复选只引用本应用字典；下拉框数据源可选「字典」或「其他表数据」（其他表本期只占位）。
5. 删除或停用只提示可能影响本应用已有表单，不检查引用、不拦截。

## 2. 本期边界

### 本期实现

- 工作台侧栏底部「应用后台」入口。
- 应用后台布局（返回工作台、当前应用名、左侧模块导航、主区域）。
- 字典头和字典项两张表，归属当前应用。
- 字典新增、编辑、启停、删除，以及项的维护。
- 表单设计：单选、复选只选本应用字典；下拉框先选数据源（字典 / 其他表数据），选字典后再选本应用启用字典。
- 画布在数据源为字典且已选编码时，用启用项渲染预览。
- 接口鉴权与现有应用目录一致：已登录且为该应用 `ownerId`。

### 本期不实现

- 平台级 / 跨应用共享字典（「默认本应用」为以后留口，本期不做共享开关）。
- 把字典放进组织管理后台（`/admin` 的人员、部门、角色）。
- 字典项树、级联、多语言。
- 按引用计数拦截删除或停用。
- 字段上同时支持「自定义选项」和「引用字典」。
- 下拉框「其他表数据」的表选择、字段映射、过滤条件等后续配置。
- 应用内细粒度权限（目前应用能力都归 owner）。
- 运行时填报页（当前预览仍是 JSON 配置预览）。
- 批量导入导出、操作审计。

## 3. 核心决策

### 3.1 入口在应用后台，不在组织管理后台

用户从应用工作台左侧树底部进入应用后台，再管理字典。组织管理后台继续只处理人、部门、角色。

```text
首页 → 应用工作台 → 应用后台 → 字典管理
```

### 3.2 字典默认只属于本应用

```text
Application 1 ← dictionary → N Dictionary
Dictionary 1 ← dictionary_item → N DictionaryItem
```

表单字段保存 `dictCode`。读取时必须带当前 `applicationId`，避免应用 A 的 `leave_type` 被应用 B 用到。

### 3.3 选项数据源按字段类型区分

- **单选、复选**：只有「字典」一种方式。属性面板只选本应用启用字典，不提供字段级选项增删。
- **下拉框**：数据源为「字典」或「其他表数据」，对应 `optionSource` 为 `dictionary` 或 `table_data`。选字典后的交互与单选相同。选「其他表数据」只作为方式占位，本期不出现选表、映射字段等后续配置，画布不渲染真实选项。

`radio`、`checkbox` 新建时 `optionSource` 固定为 `dictionary`，`dictCode` 为空。  
`select` 新建时 `optionSource` 为 `dictionary`，`dictCode` 为空。切到 `table_data` 时清空 `dictCode`。

未选字典（或下拉选了其他表）时画布为空状态。旧字段没有 `dictCode` 且未标明 `optionSource` 时，单选/复选按字典空引用处理；下拉默认 `optionSource = dictionary`。

### 3.4 删除和停用不检查引用

- 停用或删除前确认：可能影响本应用里已经引用该字典的表单。
- 后端不统计引用，不因「被占用」返回 `409`。
- 停用字典不出现在属性面板可引用列表。
- 已引用字段仍按「应用 + 编码」读取启用项；字典删除或不存在时返回空列表。

### 3.5 鉴权跟应用走，不新增组织权限码

本期不增加 `dictionaries.read` 等组织权限。能打开该应用工作台的人（owner）就能管理该应用字典，也能在该应用的表单设计里引用。

与现有 `GET /api/apps/:id/directory` 同一套：JWT + `ownerId === 当前用户`。

### 3.6 不改动使用者注释和日志

不修改现有注释和日志输出。TypeORM 保持 `synchronize: false`。SQL 只生成，明确许可后才能执行。

## 4. 数据模型

### 4.1 `dictionary`

- `id int`：自增主键。
- `applicationId int`：非空，索引。
- `name varchar(32)`：非空，trim 后 1–32 字。同一应用内唯一。
- `code varchar(64)`：非空，`/^[a-z0-9_]{2,64}$/`。同一应用内唯一。
- `description varchar(255)`：默认空字符串。
- `status varchar(16)`：`active` 或 `disabled`，默认 `active`。
- `createdAt`、`updatedAt`。
- 唯一约束：`(applicationId, code)`、`(applicationId, name)`。

编码创建后不可改。不同应用可以各有一个 `leave_type`。

### 4.2 `dictionary_item`

- `id int`：自增主键。
- `dictionaryId int`：非空，索引。
- `label varchar(64)`：非空，trim 后 1–64 字。
- `value varchar(64)`：非空，trim 后 1–64 字。
- `sortOrder int`：默认 0，越小越靠前；同序再按 `id ASC`。
- `status varchar(16)`：`active` 或 `disabled`，默认 `active`。
- `createdAt`、`updatedAt`。
- 唯一约束：`(dictionaryId, value)`。

不设数据库外键。删除字典时同时删除其项。

### 4.3 表单字段 JSON

单选、复选：

```json
{
  "type": "radio",
  "optionSource": "dictionary",
  "dictCode": "leave_type"
}
```

下拉框：

```json
{
  "type": "select",
  "optionSource": "dictionary",
  "dictCode": "leave_type"
}
```

或占位：

```json
{
  "type": "select",
  "optionSource": "table_data"
}
```

`optionSource` 仅允许 `dictionary` 或 `table_data`。单选、复选不得为 `table_data`。不保存 `options` 数组。`dictCode` 只在 `optionSource` 为 `dictionary` 时有意义，且只在所属应用内解释。

## 5. 后端架构

字典放在现有 `application` 模块下，因为必须校验应用归属，不塞进组织 `admin` 模块。

```text
server/src/application/dictionary/
  dictionary.entity.ts
  dictionary-item.entity.ts
  dictionary.service.ts
  dictionary.service.spec.ts
  dictionary.controller.ts
  dto/
```

`ApplicationModule` 注册实体、服务和控制器。写操作前 `requireApp(ownerId, appId)`，与分组/表单相同。

## 6. HTTP 接口

前缀 `/api/apps/:appId/dictionaries`。均需 JWT，且当前用户为该应用所有者。`appId` 不存在或不属于当前用户时 `404`（与现有应用接口一致，不暴露他人应用）。

- `GET /api/apps/:appId/dictionaries?keyword=&status=`  
  管理列表，含 `itemCount`。
- `GET /api/apps/:appId/dictionaries/:id`  
  详情，含全部项（含停用项）。
- `POST /api/apps/:appId/dictionaries`  
  `{ name, code, description, items }`，`items` 可为 `[]`。
- `PATCH /api/apps/:appId/dictionaries/:id`  
  `{ name, description, status, items }`。出现 `items` 则整体替换。不能改 `code`。
- `DELETE /api/apps/:appId/dictionaries/:id`  
  删除字典及其项。

引用（表单设计，同一鉴权）：

- `GET /api/apps/:appId/dictionaries/options`  
  仅启用字典的 `id`、`name`、`code`，按名称排序。
- `GET /api/apps/:appId/dictionaries/by-code/:code/items`  
  该应用下按单个编码取启用项。不存在返回 `[]`，不报 `404`。
- `POST /api/apps/:appId/dictionaries/items-by-codes`  
  传入编码数组，批量返回对应启用项。请求 `{ codes: string[] }`。按入参去重后的顺序返回：

```json
[
  { "code": "leave_type", "items": [{ "label": "年假", "value": "annual" }] },
  { "code": "missing", "items": [] }
]
```

  某个编码不存在、或字典已删，该项 `items` 为 `[]`，不报 `404`。停用字典仍返回其启用项。空数组返回 `[]`。重复编码只返回一次。

`options`、`by-code`、`items-by-codes` 放在 `/:id` 之前，避免被当成 id。

列表项示例：

```json
{
  "id": 1,
  "applicationId": 8,
  "name": "请假类型",
  "code": "leave_type",
  "description": "",
  "status": "active",
  "itemCount": 3
}
```

## 7. 错误语义

- `400`：名称/编码/项不合法；同一请求里 `value` 重复。
- `401`：未登录或账号停用。
- `404`：应用不属于当前用户，或管理接口上字典不存在。
- `409`：同一应用内名称或编码重复。

前端继续用现有拦截器显示 `message`。

## 8. 前端信息架构

### 工作台入口

`AppWorkspaceView` 左侧树下方固定「应用后台」。点击进入当前应用的应用后台，不离开该应用上下文。

### 路由

```text
/apps/:id                      应用工作台
/apps/:id/backend              重定向到 /apps/:id/backend/dictionaries
/apps/:id/backend/dictionaries 字典管理
/apps/:id/forms/:formId        表单设计（单选/复选引用本应用字典；下拉可选字典或其他表占位）
```

应用后台使用独立布局：

- 顶栏左侧箭头返回工作台（`/apps/:id`），旁边显示应用名称。
- 左侧导航本期只有「字典管理」。
- 主区域复用 `admin-page.less` 的满高表格布局。
- 不使用 `el-text`、`el-space`。

### 字典管理页

与组织后台列表页同一套交互：关键词、状态、查询主按钮、`border` + `stripe` 表格、对话框维护字典和项。停用/删除确认文案写明可能影响本应用已引用该字典的表单。

### 表单设计

- 单选、复选：属性为「选项字典」，请求 `GET /api/apps/:appId/dictionaries/options`。
- 下拉框：先选「数据源」：字典 / 其他表数据。选字典后出现与单选相同的字典下拉。选其他表数据时不展示后续配置，画布保持空选项。
- 数据源为字典且已选 `dictCode` 时，画布收集当前表单里用到的编码，一次请求 `POST /api/apps/:appId/dictionaries/items-by-codes`，按编码把启用项分给各字段。不把项写入字段 JSON。
- `appId` 来自当前路由。预览 JSON 含 `optionSource` 和（若有）`dictCode`，不含选项快照。

## 9. 数据迁移

脚本 `server/sql/2026-08-22-dictionary.sql`，只生成不执行：

1. 创建 `dictionary`、`dictionary_item`。
2. 不预置业务字典。
3. 不改组织角色权限表。

未获针对该脚本的明确许可前不得执行。

## 10. 测试策略

### 后端

- 同一应用内名称、编码唯一；不同应用允许同名同编码。
- 编码格式；创建后不能改编码。
- 非 owner 访问返回 `404`。
- 项 `value` 唯一；更新 `items` 事务整体替换。
- 停用后不出现在 `options`；按编码取项仍返回启用项。
- 批量按编码取项：缺编码返回空数组；重复编码去重。
- 删除字典同时删除项。

### 前端

- 工作台左下能进入应用后台并看到字典页。
- 箭头返回工作台。
- 表单设计：单选/复选只能选当前应用启用字典；下拉能切换数据源，其他表仅为占位。
- 组织管理后台菜单不出现字典管理。
- 人员、部门、角色、应用目录无回归。

## 11. 验收标准

1. 从某应用工作台左下进入应用后台，能维护该应用字典。
2. 字典只出现在本应用的表单设计里。
3. 另一应用即使编码相同也看不到这份字典。
4. 单选、复选只通过本应用 `dictCode` 引用字典；下拉可选字典或其他表数据（其他表无后续配置）。
5. 删除/停用不因引用失败，只做确认提示。
6. SQL 在明确批准前不执行。
7. 不删除或改写使用者已有注释和日志。

## 12. 待审阅结论

相对上一版，改为：

- 入口是应用后台，不是 `/admin`。
- 字典归属 `applicationId`，默认仅本应用使用。
- 鉴权复用应用 owner，不新增组织权限码。
- 表单引用必须带当前应用 id。

仍保留：字典头 + 字典项、编码创建后不可改、删除/停用不做引用保护。

表单选项来源：

- 单选、复选：只有字典。
- 下拉：`dictionary` 或 `table_data`；`table_data` 本期只占位。

实现计划：`docs/superpowers/plans/2026-08-22-dictionary-management.md`。
