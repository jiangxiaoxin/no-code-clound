# 下拉框拆分与其他表字段设计

日期：2026-08-23  
状态：待使用者确认  
相关：`docs/superpowers/specs/2026-08-24-mysql-mongodb-storage-design.md`（MySQL 存设计，MongoDB 存填报）  
范围：表单设计落库；下拉拆成单选/多选；数据源「其他表数据」选择本应用其他已保存表单的字段。不包含运行时查值和过滤条件。

## 1. 背景与目标

本项目用表单配置来管理应用数据，接近简道云。这里的「表」是本应用里**其他已经保存过设计**的表单，「字段」是那些表单里可作数据的控件。

当前缺口：

1. 表单设计点「保存」只提示成功，字段数组没有进后端。
2. 下拉仍是一个 `select`，「其他表数据」只是占位，不能选表和字段。
3. 还没有填报记录和填报页，不能按表查字段值。

本期要完成：

1. 把画布字段数组存进 `app_form`，打开设计页能还原。
2. 左侧拆成「下拉单选框」和「下拉多选框」。
3. 数据源为「其他表数据」时，用树选择器选其他表单的一个字段，并写入字段 JSON。
4. 画布和运行时**不**去查真实选项。

## 2. 本期边界

### 本期实现

- `app_form` 增加可空 JSON 列 `fields`。
- 打开表单返回 `fields`；保存设计用独立接口写入。
- 一份列表接口，返回本应用其他已保存表单及其可选字段（排除当前表单）。
- 组件库：`select`（下拉单选框）、`select-multiple`（下拉多选框）。
- 两者数据源仍为 `dictionary` | `table_data`。字典交互与现网下拉相同。
- `table_data` 记录 `sourceFormId` + `sourceFieldKey`。
- 选择器：`div` 模拟 select，下拉层内搜索表单名 + 树（表单 / 字段标题（类型））。
- 未配选项来源时，画布标题下提示「请配置选项来源」。
- 鉴权与现有应用接口相同：已登录且为该应用 `ownerId`。

### 本期不实现

- 运行时按表查字段值、填报页。填报如何落 MongoDB 见 2026-08-24 存储设计，不在本功能实现。
- 选项过滤条件（README 下一条单独做）。
- 把当前表单当作数据源。
- 跨应用引用表单。
- 选择器里展示分割线、上传、成员、部门、子表单、选择数据、关联数据。
- 目录接口附带 `fields`。
- 对保存的字段数组做逐字段校验。
- 引用完整性：源表单删除或字段改没后，不自动清理引用。

## 3. 核心决策

### 3.1 设计存在表单行上

```text
Application 1 ← app_form.fields → 字段数组（JSON，可空）
```

没保存过为 `null`。空画布保存为 `[]`。目录、分组、重命名不读不写这一列。

TypeORM `synchronize: false`。只新增脚本 `server/sql/2026-08-23-form-fields.sql`，使用者点名后才执行。

### 3.2 「其他表」= 本应用其他已保存表单

「已保存」指 `fields` 不是 `null`，且过滤后至少还有一个可选字段。当前正在设计的表单用查询参数排除。

可选字段类型（仅这些出现在树里）：

- `input` 单行文本
- `textarea` 多行文本
- `number` 数字
- `date` 日期选择
- `time` 时间选择
- `datetime` 日期时间
- `radio` 单选框
- `checkbox` 复选框
- `select` 下拉单选框
- `select-multiple` 下拉多选框

类型中文名由前端 `fieldTypes` 映射，接口只返回 `type`。

### 3.3 下拉拆成两个类型

| type | 左侧名称 | 画布 |
| --- | --- | --- |
| `select` | 下拉单选框 | `el-select` |
| `select-multiple` | 下拉多选框 | `el-select` 且 `multiple` |

旧配置 `type === 'select'` 仍按单选打开。两者都走同一套 `optionSource` / 字典 / 其他表选择器。

### 3.4 引用只存指针，不存选项快照

```json
{
  "type": "select",
  "optionSource": "dictionary",
  "dictCode": "leave_type"
}
```

```json
{
  "type": "select-multiple",
  "optionSource": "table_data",
  "sourceFormId": 12,
  "sourceFieldKey": "a1b2-..."
}
```

切换规则：

- 切到 `table_data`：删除 `dictCode`。
- 切到 `dictionary`：删除 `sourceFormId`、`sourceFieldKey`；若没有 `dictCode` 则补 `''`。
- 不写字段级 `options` 数组。
- 单选、复选不得为 `table_data`。

## 4. 数据与接口

### 4.1 列

`app_form.fields`：`json` 可空。不加默认值，旧行保持 `null`。

### 4.2 `GET /api/apps/:appId/forms/:formId`

在现有 `{ id, name, groupId }` 上增加 `fields`：`null` 或字段数组。

### 4.3 `PUT /api/apps/:appId/forms/:formId/fields`

Body：`{ "fields": [] }`。

- `fields` 必须是数组，否则 400「请提交字段列表」。
- 不做逐字段结构校验。
- 成功返回与 GET 表单相同的形状（含刚写入的 `fields`）。
- 表单不存在：404「表单不存在」。应用不存在或不属于当前用户：404「应用不存在」。

重命名仍走现有 `PATCH /api/apps/:appId/forms/:formId`。

### 4.4 `GET /api/apps/:appId/form-fields?excludeFormId=`

`excludeFormId` 可选。是正整数则排除该表单；缺省或不是正整数则不排除。

返回：

```json
[
  {
    "id": 12,
    "name": "客户",
    "fields": [
      { "key": "a1b2-...", "title": "客户名称", "type": "input" }
    ]
  }
]
```

规则：

- 只含本应用表单。
- 排除 `excludeFormId`。
- 排除 `fields` 为 `null` 的表单。
- 每张表只留下第 3.2 节的类型；过滤后 `fields` 为空则整张表不返回。
- 每项只含 `key`、`title`、`type`。`title` 缺省时用空字符串。
- 顺序与目录一致：表单按 `createdAt` 降序。表内字段保持保存时的数组顺序。

静态路径 `form-fields` 必须写在 `forms/:formId` 这类参数路由旁边且不冲突（挂在 `apps/:id` 下即可）。

## 5. 前端

### 5.1 打开与保存

- 设计页加载：`getFormApi` 带回 `fields`；`null` 或缺省当 `[]`。
- 工具栏「保存」调用 `PUT .../fields`，成功再提示「保存成功」；失败提示接口错误，画布不丢。
- 打开表单失败：仍退回工作台。

### 5.2 属性面板

`select` 与 `select-multiple` 共用：

1. 数据源：`dictionary` / `table_data`。
2. 字典：现有字典下拉。
3. `table_data`：其他表字段选择器（见 5.3）。不出现过滤条件。

### 5.3 其他表字段选择器

新组件（建议 `front/src/components/form-design/FormFieldSourcePicker.vue`），不用 `el-select`。

- 关闭态：像 select 的框。未选显示「请选择表字段」；已选且能在列表里解析到，显示「表单名 / 字段标题」；已选但表单或字段找不到，显示「已选字段不可用」。找不到时**不**改 JSON，等使用者重选再覆盖。
- 点击打开下拉层。层内顶部搜索框，只按表单名过滤；表单被过滤掉则其子字段一起隐藏。
- 树：父节点是表单名，子节点是「字段标题（类型）」，例如「客户名称（单行文本）」。只能选子节点。
- 打开时请求 `GET .../form-fields?excludeFormId=`（当前 `formId`）。失败时层内提示加载失败，不写假数据。
- 选中后关闭下拉，写入 `sourceFormId`、`sourceFieldKey`。

新 UI 不用 `el-text`、`el-space`。

### 5.4 画布

- `select`：单选 `el-select`。
- `select-multiple`：`el-select` `multiple`。
- 字典且已选 `dictCode`：继续用现有批量字典项接口预览（`select` 与 `select-multiple` 都算字典引用）。
- `table_data`，或未选字典/未选表字段：不渲染真实选项。
- `select` / `select-multiple` 在「字典但未选编码」或「其他表但未选字段」时，标题下提示「请配置选项来源」。单选、复选未选字典仍用现有「请配置选项字典」。

### 5.5 新建字段缺省

```js
{ optionSource: 'dictionary', dictCode: '' }
```

旧字段选中时只补缺省、不删其它键：没有 `optionSource` 则补 `dictionary`；字典模式下没有 `dictCode` 则补 `''`。

## 6. 错误与边界

| 情况 | 行为 |
| --- | --- |
| 保存失败 | 提示接口错误，画布不变 |
| 打开表单失败 | 退回工作台 |
| 选择器加载失败 | 下拉层提示失败，无假数据 |
| 源表单删除或字段改没 | 显示「已选字段不可用」，JSON 保留 |
| `fields` 不是数组 | 400「请提交字段列表」 |
| 空数组保存 | 允许 |
| 搜索 | 只过滤表单名 |
| 当前表单 | 不出现在选择器 |

## 7. 验证

后端（扩现有 `application.service.spec.ts`）：

- 保存后再 GET，`fields` 一致。
- `fields` 非数组 → 400。
- `form-fields` 排除当前表单、排除 `null`、排除过滤后无可用字段的表单，且只返回约定类型和 `key/title/type`。

前端手测：

- 保存后刷新仍在。
- 两种下拉都能拖入；字典预览仍可用。
- 选择器可搜索、可选字段、预览 JSON 含 `sourceFormId` / `sourceFieldKey`。
- 切数据源时 `dictCode` 与表字段指针互清。

## 8. 文件

- 改：`server/src/application/app-form.entity.ts`、`application.service.ts`、`application.controller.ts`、`application.service.spec.ts`
- 增：`server/src/application/dto/save-form-fields.dto.ts`、`server/sql/2026-08-23-form-fields.sql`
- 改：`front/src/api/apps.js`、`FormDesignView.vue`、`FormDesignPanel.vue`、`fieldTypes.js`、`FormDesignProps.vue`、`FormDesignCanvasField.vue`
- 增：`front/src/components/form-design/FormFieldSourcePicker.vue`
