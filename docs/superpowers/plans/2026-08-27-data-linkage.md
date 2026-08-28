# 数据联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 在 `master` 上改，不开分支。未经使用者要求不 commit。

**Goal:** 在字段数据源中配置数据联动，填报时按条件查询他表并写入当前字段（或生成下拉选项）。

**Architecture:** 联动配置存在字段 JSON 的 `optionSource: 'linkage'` 与 `linkage` 上。纯逻辑放 `front/src/components/form-design/linkage.js`，用现有 `optionFilters` + `buildSourceQuery` 查记录。设计器弹框复用 `FormSourcePicker` 与 `FormOptionFilterDialog`。运行时在 `FormFillGrid` 里监听条件字段变化后查询并写值；画布与单元格内联编辑不跑联动。

**Tech Stack:** Vue 3、Element Plus、现有 `queryFormRecordsApi`、前端 `node:test`。

**Spec:** `docs/superpowers/specs/2026-08-27-data-linkage-design.md`

## Global Constraints

- 开发在 `master`，不开分支、不建 worktree。
- 数据联动只出现在数据源里；单选 / 复选不做联动，不改它们的选项字典入口。
- 支持字段：`input` `textarea` `number` `date` `time` `datetime` `select` `select-multiple`。
- 配置形状：`linkage: { sourceFormId, match, conditions, sourceKey }`；条件形状与 `optionFilters` 相同；至少一条完整条件。
- 文本 / 数字 / 时间：0 条清空不提示；1 条写入；多条清空并用 `el-message` 提示 `[ 字段标题 ] 字段联动查询出多条数据`（有说明时为 `[ 标题，说明 ] 字段联动查询出多条数据`）。
- 下拉：0 清空；1 自动选；多条变选项让人再选，不弹多条提示。
- 不新增后端接口；查询 `POST .../records/query`。
- 不跑联动：设计画布、数据管理单元格内联编辑。
- 禁用字段仍允许联动写入；`updating && editable === false` 时不改该字段。
- 模板不写行内 JS；新 `el-dialog` 加 `draggable`；布局优先 flex；相邻 `el-button` 不加 `gap`。
- 不删不改使用者已有注释和 `console.log`。
- 不勾 `front/README.md`。
- 不自动 git commit。
- 不新增 npm 依赖。

---

## File Structure

```text
front/src/components/form-design/
  linkage.js                         # 新建：配置校验、类型对应、是否已设置
  linkage.spec.js                    # 新建
  DataLinkageDialog.vue              # 新建：选表 + 条件 + 触发字段
  FormSourcePicker.vue               # 改：允许包含当前表单
  FormDesignProps.vue                # 改：数据源选项与设置/清除
  FormDesignCanvasField.vue          # 改：下拉 linkage 不误提示「请配置选项来源」
  FormDesignPanel.vue                # 改：默认 optionSource、复制字段

front/src/components/form-fill/
  linkageRuntime.js                  # 新建：条件是否就绪、0/1/多条如何写值
  linkageRuntime.spec.js             # 新建
  FormFillGrid.vue                   # 改：查询并写入
  FormFillField.vue                  # 改：linkage 的选项来源提示
  fillValues.js                      # 改：linkage 字段不做单元格内联编辑
  fillValues.spec.js                 # 改：补 isInlineEditable 用例

front/src/components/form-workspace/
  FormRecordCell.vue                 # 不查联动（由 isInlineEditable 挡住编辑）
```

职责：

- `linkage.js` 只处理设计期配置，不发请求。
- `linkageRuntime.js` 只处理查询结果怎么变成值和选项，不碰 Vue。
- `FormFillGrid` 负责何时请求、何时跳过写入（详情首次进入、禁用、不可修改）。
- `DataLinkageDialog` 负责校验三项齐全后再 `confirm`。

---

## 自审时补上的漏洞（相对初稿）

1. **编辑已有记录首次打开会把库里的值覆盖成源表现状。** 规格说已提交记录不随源表改。实现：`updating === true` 时先记下条件快照，条件没变只刷新下拉选项、不写文本/数字/时间，也不自动改下拉选中值；条件变了才按 0/1/多条规则写。
2. **详情未点「编辑」时 `disabled`。** 此时不发联动查询、不写值，避免只读查看就改脏 `detailValues`。
3. **`buildSourceQuery` 会跳过空的字段引用，查询会变宽。** 联动在任一「字段」条件的当前值为空时整段不查，按 0 条处理（不清出多条提示）。
4. **多条按记录数，不去重。** 两条记录姓名相同也算多条，文本不填并提示。
5. **文本查询 `pageSize: 2`，用 `total` 判断是否多于 1 条。** 下拉仍 `pageSize: 100`，与其他表数据相同。
6. **当前表单。** `FormSourcePicker` 现在排除本表。联动加 `includeCurrent`；触发字段若选的是本表，用设计器里正在编的 `fields`。
7. **单元格。** linkage 字段 `isInlineEditable === false`，只能在新增/详情里靠联动改，避免内联改编号却不带出姓名。
8. **`needsOptionSourceHint`。** `optionSource === 'linkage'` 且未配完时才提示请配置；配完不提示。

---

### Task 1: 联动配置纯函数

**Files:**
- Create: `front/src/components/form-design/linkage.js`
- Test: `front/src/components/form-design/linkage.spec.js`

**Produces:**
- `LINKAGE_VALUE_TYPES` / `hasLinkageSource(type)` / `optionSourceChoices(type)`
- `cloneLinkage(raw)` / `hasLinkage(raw)` / `isCompleteCondition(item)`
- `sourceTypesFor(fieldType)` / `filterLinkageSourceFields(sourceFields, currentType)`

- [ ] **Step 1: 写失败测试并实现**

`hasLinkage`：`sourceFormId > 0`、`sourceKey` 非空、至少一条 `isCompleteCondition`。

完整条件：有 `key`、`op`；`empty`/`nempty` 不需要值；`valueType === 'field'` 要有字段 key；自定义要有值（`between` 至少一端，`dynamic` 起止 path 都有）。

类型对应：

- `input`/`textarea` → `input` `textarea` `radio` `select`
- `select-multiple` → `select-multiple` `checkbox`
- 其余必须类型相同

`optionSourceChoices('input')` → 自定义、数据联动；`optionSourceChoices('select')` → 字典、其他表数据、数据联动；`radio` 无数据源选项。

Run: `node --test front/src/components/form-design/linkage.spec.js`

---

### Task 2: 运行时纯函数

**Files:**
- Create: `front/src/components/form-fill/linkageRuntime.js`
- Test: `front/src/components/form-fill/linkageRuntime.spec.js`

**Produces:**
- `linkageConditionsReady(linkage, values)`
- `applyLinkageResult(field, result, currentValue)` → `{ value, items, message }`
- `linkageQueryPaging(field)` → 文本 `{ page: 1, pageSize: 2 }`，下拉 `{ page: 1, pageSize: 100 }`

规则：

- 条件未就绪：调用方不请求；测试 `linkageConditionsReady` 对字段引用为空返回 false。
- 值类型：`total > 1`（或无 total 时 `items.length > 1`）→ `value` 清空 + `message` 为 `[ 标题 ] 字段联动查询出多条数据`（有说明时把说明接在标题后，用中文逗号）；`total === 1` 写入 `items[0].data[sourceKey]`；0 条清空、无 message。
- 下拉：用 `recordsToSelectItems`；0 条空选项并清空；1 个去重选项自动选中；多个不自动选，当前值仍在选项里则保留，否则清空。下拉多选：1 个自动 `[v]`；多个则过滤已选。无 message。

Run: `node --test front/src/components/form-fill/linkageRuntime.spec.js`

---

### Task 3: 设计器 UI

**Files:**
- Create: `front/src/components/form-design/DataLinkageDialog.vue`
- Modify: `front/src/components/form-design/FormSourcePicker.vue`（`includeCurrent` 默认 false）
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/form-design/FormDesignPanel.vue`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`
- Modify: `front/src/components/form-fill/FormFillField.vue`（提示文案与画布同一判断）

交互：

- 值类型数据源：自定义 / 数据联动。选联动后按钮：未设置「设置数据联动」；已设置「已设置数据联动」+ 清除图标，二次确认后 `delete field.linkage`，数据源仍为 `linkage`。
- 下拉数据源增加「数据联动」，与字典 / 其他表互清：切到 linkage 时删 `dictCode` `sourceFormId` `sourceFieldKey` `optionFilters`；切走 linkage 时删 `linkage`。
- 弹框 `el-dialog` `draggable`：联动表单、联动条件（复用过滤弹框，文案改为限定匹配数据）、触发联动（当前标题只读 + 兼容类型下拉）。确定时三项缺一则 `ElMessage.warning` 且不关闭。
- `FormSourcePicker` 增加 `includeCurrent`；为 true 时不传 `excludeFormId`、列表含当前表。
- 触发字段：源表是当前表时用 `props.fields`，否则 `listFormFieldsApi` 不排除当前表后按 id 取 fields，再 `filterLinkageSourceFields`。
- 复制字段时 `cloneLinkage`。
- 旧值类型字段无 `optionSource` 视为 `custom`，点选时写上 `custom`。
- 画布 / 填报：`linkage` 未配完的下拉显示「请配置选项来源」；配完不查、选项为空。

---

### Task 4: 填报运行时

**Files:**
- Modify: `front/src/components/form-fill/FormFillGrid.vue`
- Modify: `front/src/components/form-fill/fillValues.js`
- Modify: `front/src/components/form-fill/fillValues.spec.js`

`FormFillGrid`：

- 识别 `hasLinkage(field)` 的字段，loadKey 含 `linkage.sourceFormId`、`sourceKey`、条件及引用字段当前值。
- `disabled` 时不请求。
- 条件未就绪：值类型按 0 条清空（若允许写入）；下拉空选项。不清多条提示。
- 请求：`buildSourceQuery({ match, conditions }, values, fields, linkageQueryPaging(field))`。
- 写入：`applyLinkageResult`；有 `message` 时 `ElMessage.warning`。
- `updating && editable === false`：不改该字段的值，下拉仍可更新 `items`。
- `updating` 首次进入（或从只读切到编辑且条件快照未变）：只更新下拉 `items`，不改任何联动字段的值。
- 与 `table_data` 共用 `queryRecordsOnce` 去重。
- 条件字段变化沿用现有 1s debounce。

`isInlineEditable`：`optionSource === 'linkage'` 返回 false。

---

### Task 5: 验证

Run:

```
node --test front/src/components/form-design/linkage.spec.js front/src/components/form-fill/linkageRuntime.spec.js front/src/components/form-fill/fillValues.spec.js
```

设计器：给单行文本选数据联动，缺条件不能保存；配齐后显示已设置；清除需确认。

填报：编号唯一带出姓名；编号匹配多条时姓名清空并提示；详情只读不改值；点编辑且不改编号时姓名保持入库值。
