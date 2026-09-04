# 关联数据 `relate` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 把调色板里禁用占位的「关联数据」做成真正的关系字段：设计器选主表（含当前表单）和显示字段，填报弹窗选一条主表数据、库里存这条数据的 id，控件、详情、数据管理列表都按 id 现查显示字段，源表改名刷新即跟进。

**Architecture:** 不做新组件、不新增接口。填报控件在现有 `FormDataSelect.vue` 上加 `mode="relate"`（收起态文本取 `titleKey`、弹窗标题不同、可排除自己、只读点开源数据详情），属性面板复用选择数据那三个弹框。后端只在记录查询上加两个可选参数：`ids`（按 id 批量取）、`excludeIds`（关联本表时排除自己）。

**Tech Stack:** Vue 3 + Element Plus；后端 NestJS + Mongo。前端纯函数用 `node --test` 跑 `*.spec.js`，后端用 Jest。

**Spec:** `docs/superpowers/specs/2026-09-04-relate-data-and-relate-subform-design.md`（第 4 节；第 7 节列了要动的后端口子）

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 的容器不加 `gap`；`el-dialog` 默认 `draggable`。
- 图标必须先确认 `@element-plus/icons-vue` 有该导出再 import。本计划不需要新图标。
- 不删不改使用者已有的注释和 `console.log`（`FormDataSelect.vue`、`FormRecordList.vue`、`FormRecordManage.vue` 里都有，原样保留）。
- 不新增 npm 依赖。
- 文件一律 UTF-8 无 BOM；写完中文要回读确认没变成乱码。
- **不要**把选择数据 `data` 改成关联语义，也不要把下拉「其他表数据」改成存 id。两套并存。
- 关联数据**不能**拖进子表单（`SUBFORM_CHILD_TYPES` 本来就没有它，别去加）。
- 本期不做：一次关联多条、关联子表单（另一份计划）、Excel 导入建立关系、按显示文本筛选、删源数据级联清空。

## File Structure

```text
server/src/application/form-record/form-record.query.ts        # 加 ids / excludeIds 两个 _id 条件
server/src/application/form-record/form-record.query.spec.ts   # 对应用例
server/src/application/form-record/dto/query-records.dto.ts    # 放行两个新字段
front/src/components/form-design/relateField.js                # 新建：关联数据纯函数
front/src/components/form-design/relateField.spec.js           # 新建
front/src/components/form-design/dataSelect.js                 # 「会受…影响」提示把 relate 算进去
front/src/components/form-fill/fillValues.js                   # relate 入库/回显/列表列/必填
front/src/components/form-fill/fillValues.spec.js
front/src/components/form-design/fieldTypes.js                 # relate 移出「未完成」区
front/src/components/form-design/FormDesignProps.vue           # relate 属性面板；改 loadSourceFields
front/src/components/form-design/FormDesignCanvasField.vue     # 画布占位换成 FormDataSelect preview
front/src/components/form-fill/FormDataSelect.vue              # mode / excludeRecordId / 源数据详情
front/src/components/form-fill/FormFillField.vue               # relate 分支换成 FormDataSelect
front/src/components/form-fill/FormFillGrid.vue                # 透传 recordId
front/src/components/form-workspace/FormRecordDetailDrawer.vue # 传 record-id
front/src/components/form-workspace/relateTitles.js            # 新建：列表批量取显示字段文本
front/src/components/form-workspace/relateTitles.spec.js       # 新建
front/src/components/form-workspace/FormRecordList.vue         # 拉标题、传给单元格
front/src/components/form-workspace/FormRecordCell.vue         # relate 列显示标题 / 已删除
```

职责划分：`relateField.js` 只放设计期判断（是不是关联数据、是不是关联本表、一表一个关联本表）；`relateTitles.js` 只放数据管理列表批量补标题；选记录弹窗**不复制**，一律走 `FormDataSelect.vue`。

---

### Task 1: 记录查询支持 `ids` 与 `excludeIds`

**Files:**
- Modify: `server/src/application/form-record/form-record.query.ts`
- Modify: `server/src/application/form-record/dto/query-records.dto.ts`
- Test: `server/src/application/form-record/form-record.query.spec.ts`

**Interfaces:**
- Produces: `RecordQueryBody` 新增可选 `ids?: string[]`、`excludeIds?: string[]`。`buildRecordQuery` 把它们翻译成 `_id` 的 `$in` / `$nin`。非法（不是 24 位十六进制）的 id 直接丢掉；传了 `ids` 但一个合法的都没有时，结果是查不到任何数据。
- `FormRecordService.query` 已经把 `...body` 摊进 `buildRecordQuery`，不用改。

- [ ] **Step 1: 写失败测试**

追加到 `form-record.query.spec.ts`：

```ts
describe('buildRecordQuery ids / excludeIds', () => {
  const idA = '64b7f9c2e3a1b2c3d4e5f601';
  const idB = '64b7f9c2e3a1b2c3d4e5f602';

  it('ids 只保留合法 ObjectId', () => {
    const built = buildRecordQuery([], { ids: [idA, 'not-an-id'] });
    const clause = built.filter as { _id: { $in: { toHexString(): string }[] } };
    expect(clause._id.$in.map((item) => item.toHexString())).toEqual([idA]);
  });

  it('ids 全非法时查不到数据', () => {
    const built = buildRecordQuery([], { ids: ['nope'] });
    const clause = built.filter as { _id: { $in: unknown[] } };
    expect(clause._id.$in).toEqual([]);
  });

  it('excludeIds 与其它条件并存', () => {
    const fields = [{ key: 'name', type: 'input' }] as never;
    const built = buildRecordQuery(fields, {
      filters: [{ key: 'name', op: 'eq', value: 'A' }],
      excludeIds: [idB],
    });
    const parts = built.filter.$and as Record<string, unknown>[];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ 'data.name': 'A' });
    const nin = (parts[1] as { _id: { $nin: { toHexString(): string }[] } })._id.$nin;
    expect(nin.map((item) => item.toHexString())).toEqual([idB]);
  });

  it('excludeIds 全非法时不加条件', () => {
    const built = buildRecordQuery([], { excludeIds: ['nope'] });
    expect(built.filter).toEqual({});
  });

  it('不传时行为不变', () => {
    const built = buildRecordQuery([], {});
    expect(built.filter).toEqual({});
    expect(built.sort).toEqual({ updatedAt: -1 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test --prefix server -- form-record.query.spec
```

Expected: FAIL，`ids` / `excludeIds` 被忽略，`filter` 还是 `{}`。

- [ ] **Step 3: 实现**

`form-record.query.ts` 顶部加 import 和常量：

```ts
import { ObjectId } from 'mongodb';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function toObjectIds(list: unknown): ObjectId[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is string =>
        typeof item === 'string' && OBJECT_ID_RE.test(item),
    )
    .map((item) => new ObjectId(item));
}
```

`RecordQueryBody` 增加两个可选字段：

```ts
export type RecordQueryBody = {
  filters?: RecordFilter[];
  match?: 'all' | 'any';
  groups?: RecordFilterGroup[];
  sort?: RecordSort | RecordSort[];
  page?: number;
  pageSize?: number;
  /** 只取这些数据（关联数据列表批量补显示字段用）；非法 id 丢弃 */
  ids?: string[];
  /** 排除这些数据（关联本表时排除正在编辑的自己） */
  excludeIds?: string[];
};
```

`buildRecordQuery` 里，在 `const filter = ...` 那一行**之前**插入：

```ts
  if (body.ids !== undefined) {
    parts.push({ _id: { $in: toObjectIds(body.ids) } });
  }
  const excluded = toObjectIds(body.excludeIds);
  if (excluded.length) {
    parts.push({ _id: { $nin: excluded } });
  }
```

`dto/query-records.dto.ts` 放行：

```ts
  @IsOptional()
  @IsArray()
  ids?: string[];

  @IsOptional()
  @IsArray()
  excludeIds?: string[];
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test --prefix server -- form-record.query.spec
```

Expected: PASS。

---

### Task 2: 关联数据纯函数与入库/回显规则

**Files:**
- Create: `front/src/components/form-design/relateField.js`
- Test: `front/src/components/form-design/relateField.spec.js`
- Modify: `front/src/components/form-fill/fillValues.js`
- Test: `front/src/components/form-fill/fillValues.spec.js`
- Modify: `front/src/components/form-design/dataSelect.js`

**Interfaces:**
- Produces：
  - `isRelateField(field): boolean`
  - `relateSourceFormId(field): number`（非正整数返回 0）
  - `isSelfRelate(field, formId): boolean`
  - `hasSelfRelateField(fields, formId, exceptKey = ''): boolean`（展开标签页）
  - `relateColumnFields(fields): field[]`（摊平后所有已选主表的关联数据字段，列表补标题用）
- `fillValues.js`：`relate` 与 `data` 一样入库、回显；`isListColumn(relate)` 为 true；`firstRequiredError` 认**关联数据和选择数据**的必填（选择数据的必填开关现在点了不生效，本次一并修好，两者行为一致）。
- `dataSelect.js`：`fillInfluencerTips` 把关联数据的填充规则也算进「会受 [ … ] 字段影响」。

- [ ] **Step 1: 写 `relateField.spec.js`**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasSelfRelateField,
  isRelateField,
  isSelfRelate,
  relateColumnFields,
  relateSourceFormId,
} from './relateField.js'

test('isRelateField 只认 relate', () => {
  assert.equal(isRelateField({ type: 'relate' }), true)
  assert.equal(isRelateField({ type: 'data' }), false)
  assert.equal(isRelateField(null), false)
})

test('relateSourceFormId 过滤非法值', () => {
  assert.equal(relateSourceFormId({ sourceFormId: 12 }), 12)
  assert.equal(relateSourceFormId({ sourceFormId: '12' }), 12)
  assert.equal(relateSourceFormId({ sourceFormId: 0 }), 0)
  assert.equal(relateSourceFormId({}), 0)
})

test('isSelfRelate 比较主表和当前表单', () => {
  assert.equal(isSelfRelate({ type: 'relate', sourceFormId: 30 }, 30), true)
  assert.equal(isSelfRelate({ type: 'relate', sourceFormId: 31 }, 30), false)
  assert.equal(isSelfRelate({ type: 'data', sourceFormId: 30 }, 30), false)
})

test('hasSelfRelateField 展开标签页并可排除自己', () => {
  const fields = [
    { key: 'a', type: 'input' },
    {
      key: 't',
      type: 'tabs',
      panes: [
        { id: 'p1', fields: [{ key: 'r1', type: 'relate', sourceFormId: 30 }] },
      ],
    },
  ]
  assert.equal(hasSelfRelateField(fields, 30), true)
  assert.equal(hasSelfRelateField(fields, 30, 'r1'), false)
  assert.equal(hasSelfRelateField(fields, 31), false)
})

test('relateColumnFields 只要配好主表的关联数据', () => {
  const fields = [
    { key: 'r1', type: 'relate', sourceFormId: 12 },
    { key: 'r2', type: 'relate' },
    { key: 'd1', type: 'data', sourceFormId: 12 },
  ]
  assert.deepEqual(
    relateColumnFields(fields).map((item) => item.key),
    ['r1'],
  )
})
```

- [ ] **Step 2: 补 `fillValues.spec.js` 用例**

```js
test('relate 存 id、回显 id、进列表列、必填生效', () => {
  const field = { key: 'r1', type: 'relate', sourceFormId: 12, required: true }
  assert.equal(isFillable(field), false)
  assert.equal(isListColumn(field), true)
  assert.equal(isInlineEditable(field), false)

  const cloned = cloneRecordValues([field], { r1: '64b7f9c2e3a1b2c3d4e5f601' })
  assert.equal(cloned.r1, '64b7f9c2e3a1b2c3d4e5f601')

  const payload = buildRecordData([field], { r1: '64b7f9c2e3a1b2c3d4e5f601' })
  assert.equal(payload.r1, '64b7f9c2e3a1b2c3d4e5f601')

  assert.equal(
    firstRequiredError([field], { r1: '' })?.key,
    'r1',
  )
  assert.equal(firstRequiredError([field], { r1: '64b7f9c2e3a1b2c3d4e5f601' }), null)
})

test('选择数据设了必填、没选时也要拦下来', () => {
  const field = { key: 'd1', type: 'data', sourceFormId: 12, required: true, title: '物料' }
  assert.equal(firstRequiredError([field], { d1: '' })?.key, 'd1')
  assert.equal(
    firstRequiredError([field], { d1: '' })?.message,
    '请填写「物料」',
  )
  assert.equal(firstRequiredError([field], { d1: '64b7f9c2e3a1b2c3d4e5f601' }), null)
  // 没勾必填就不该拦
  assert.equal(firstRequiredError([{ ...field, required: false }], { d1: '' }), null)
})
```

`isListColumn`、`isInlineEditable`、`firstRequiredError` 若还没在该 spec 顶部 import，一并补上。

- [ ] **Step 3: 跑两个测试确认失败**

```bash
node --test front/src/components/form-design/relateField.spec.js front/src/components/form-fill/fillValues.spec.js
```

Expected: FAIL（模块不存在；`isListColumn` 为 false；必填不报错）。

- [ ] **Step 4: 写 `relateField.js`**

```js
import { flattenFields } from './tabsField.js'

export function isRelateField(field) {
  return field?.type === 'relate'
}

export function relateSourceFormId(field) {
  const n = Number(field?.sourceFormId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export function isSelfRelate(field, formId) {
  return isRelateField(field) && relateSourceFormId(field) === Number(formId)
}

export function hasSelfRelateField(fields, formId, exceptKey = '') {
  return flattenFields(fields).some(
    (field) => field.key !== exceptKey && isSelfRelate(field, formId),
  )
}

export function relateColumnFields(fields) {
  return flattenFields(fields).filter(
    (field) => isRelateField(field) && relateSourceFormId(field) > 0,
  )
}
```

- [ ] **Step 5: 改 `fillValues.js`**

1. `persistsValue` 把关联数据也算作要入库：

```js
function persistsValue(field) {
  return (
    isFillable(field) ||
    field.type === 'data' ||
    field.type === 'relate' ||
    field.type === 'subform'
  )
}
```

2. `isListColumn` 加上关联数据：

```js
export function isListColumn(field) {
  return (
    isFillable(field) ||
    field?.type === 'subform' ||
    field?.type === 'relate' ||
    field?.type === 'serialNumber'
  )
}
```

3. `cloneRecordValues` 里把 `data` 那一支改成两种都走：

```js
    if (field.type === 'data' || field.type === 'relate') {
      const value = data?.[field.key]
      next[field.key] =
        typeof value === 'string' && value ? value : undefined
      continue
    }
```

4. `firstRequiredError` 在 `subform` 分支之后、`if (!isFillable(field) || !field.required) continue` 之前插入。关联数据和选择数据都存源数据 id，`isFillable` 都为 false，所以以前必填开关点了没用——这里一起补上：

```js
    // 关联数据、选择数据存的是源数据 id，不走普通填报校验，必填要单独判
    if (field.type === 'relate' || field.type === 'data') {
      const id = values[field.key]
      if (field.required && (typeof id !== 'string' || !id)) {
        return {
          message: `请填写「${field.title || '未命名'}」`,
          key: field.key,
        }
      }
      continue
    }
```

这会改变选择数据的可见行为：以前勾了必填也能空着保存，改完会被拦下。Task 7 里要补对应用例。

`SKIP_TYPES` 里的 `'relate'` **保留不动**（关联数据不是普通填报输入，`isFillable` 仍为 false，所以不会被内联编辑、不进快捷筛选）。

- [ ] **Step 6: 改 `dataSelect.js` 的 `fillInfluencerTips`**

把 `if (field.type !== 'data') continue` 改成：

```js
      if (field.type !== 'data' && field.type !== 'relate') continue
```

- [ ] **Step 7: 跑测试确认通过**

```bash
node --test front/src/components/form-design/relateField.spec.js front/src/components/form-fill/fillValues.spec.js
```

Expected: PASS。回读两个新文件确认中文正常。

---

### Task 3: 设计器——选主表、显示字段、画布占位

**Files:**
- Modify: `front/src/components/form-design/fieldTypes.js`
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`

**Interfaces:**
- Consumes: Task 2 的 `isRelateField`、`hasSelfRelateField`
- Produces: 关联数据字段 JSON 上出现 `sourceFormId`、`titleKey`、`displayFieldKeys`、`displayFieldLabels`、`fillMappings`、`pickerColumnKeys`、`optionFilters`（键名与选择数据一致）

- [ ] **Step 1: 调色板把关联数据移出「未完成」区**

`fieldTypes.js`：把 `{ type: 'relate', label: '关联数据', icon: Link, component: 'RelateData', placeholder: '请选择' }` 挪到 `{ type: 'tabs', ... }` 之后、`// -----------以下未完成------` 之前。`relate-subform` 留在未完成区（另一份计划处理）。图标继续用已导入的 `Link`。

- [ ] **Step 2: 属性面板加 relate 分支**

`FormDesignProps.vue` 模板里，`<template v-else-if="field.type === 'data'">…</template>` 之后加一段（`filter-trigger` 样式已有，直接复用）：

```vue
      <template v-else-if="field.type === 'relate'">
        <el-form-item label="数据源">
          <FormSourcePicker
            :app-id="appId"
            :form-id="formId"
            :source-form-id="field.sourceFormId"
            include-current
            @select="onRelateSourceSelect"
          />
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="显示字段">
          <el-select
            :model-value="field.titleKey || ''"
            class="relate-title-select"
            placeholder="请选择显示字段"
            @change="onRelateTitleKeyChange"
          >
            <el-option
              v-for="item in relateTitleOptions"
              :key="item.key"
              :label="item.title || item.key"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId && !field.titleKey" label=" ">
          <span class="relate-title-hint">选了显示字段，收起时和数据管理列表才有文字</span>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="显示在表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasDisplayFields }"
            @click="openDisplayFields"
          >
            {{ displayFieldsTriggerText }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="填充到表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasFillMappings(field.fillMappings) }"
            @click="openFillMapping"
          >
            {{
              hasFillMappings(field.fillMappings)
                ? `已添加 ${field.fillMappings.length} 条填充规则`
                : '设置填充字段'
            }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="选择过程设置">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasProcessSetup }"
            @click="openProcess"
          >
            {{ processTriggerText }}
          </div>
        </el-form-item>
      </template>
```

三个弹框（`DataSelectDisplayFieldsDialog` / `DataSelectFillMappingDialog` / `DataSelectProcessDrawer`）已经渲染在同一段模板里，不用再加。

样式区补两条：

```less
.relate-title-select {
  width: 100%;
}

.relate-title-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 20px;
}
```

- [ ] **Step 3: 脚本部分：选主表、选显示字段、源字段来源**

`FormDesignProps.vue` 的 `<script setup>`：

import 补上（`ElMessage` 已在文件里用过则不必重复 import；没有就从 `element-plus` 引）：

```js
import { hasSelfRelateField, isRelateField } from './relateField.js'
import { withSystemDisplayFields } from './dataSelect'
```

新增 computed：

```js
const relateTitleOptions = computed(() =>
  withSystemDisplayFields(sourceFields.value.filter(isFillable)),
)
```

新增两个处理函数（放在 `onSourceFormSelect` 旁边）：

```js
function onRelateSourceSelect({ formId }) {
  if (!props.field) {
    return
  }
  if (
    Number(formId) === Number(props.formId) &&
    hasSelfRelateField(props.fields, props.formId, props.field.key)
  ) {
    ElMessage.warning('已有关联本表字段')
    return
  }
  if (props.field.sourceFormId !== formId) {
    props.field.titleKey = ''
    props.field.displayFieldKeys = []
    props.field.fillMappings = []
    props.field.pickerColumnKeys = []
    delete props.field.displayFieldLabels
    delete props.field.optionFilters
  }
  props.field.sourceFormId = formId
  loadSourceFields()
}

function onRelateTitleKeyChange(value) {
  if (!props.field) {
    return
  }
  props.field.titleKey = value || ''
}
```

`loadSourceFields` 改成关联数据不排除当前表单，且选中的就是当前表单时直接用画布上的字段（设计中途改字段也能配）：

```js
async function loadSourceFields() {
  const field = props.field
  if (!props.appId || !field?.sourceFormId) {
    sourceFields.value = []
    return
  }
  if (isRelateField(field) && Number(field.sourceFormId) === Number(props.formId)) {
    sourceFields.value = flattenFields(props.fields).filter(isFillable)
    return
  }
  try {
    const params = isRelateField(field) ? {} : { excludeFormId: props.formId }
    const forms = (await listFormFieldsApi(props.appId, params)) || []
    const form = forms.find(
      (item) => Number(item.id) === Number(field.sourceFormId),
    )
    sourceFields.value = form?.fields || []
  } catch {
    sourceFields.value = []
  }
}
```

`flattenFields` 与 `isFillable` 该文件已 import，不要重复。

- [ ] **Step 4: 画布占位**

`FormDesignCanvasField.vue` 里把这段：

```vue
    <el-select
      v-else-if="field.type === 'relate'"
      disabled
      class="canvas-item"
      :placeholder="field.placeholder"
    />
```

换成：

```vue
    <div v-else-if="field.type === 'relate' && !field.sourceFormId" class="canvas-field-hint">
      请选择主表
    </div>
    <FormDataSelect
      v-else-if="field.type === 'relate'"
      class="canvas-item"
      :app-id="appId"
      :field="field"
      mode="relate"
      preview
      :compact="embedded"
    />
```

`FormDataSelect` 该文件已 import。`mode` 这个 prop 在 Task 4 里加；本步骤先写上，画布此时表现与选择数据占位一致，不报错。

- [ ] **Step 5: 手工看设计器**

`npm run dev`，打开一张表单设计：

1. 从调色板拖「关联数据」到画布，右侧出现「数据源」，点开能看到本应用表单，**包括当前表单**。
2. 选一张他表：出现「显示字段」「显示在表单中的字段」「填充到表单中的字段」「选择过程设置」。
3. 再拖一个关联数据、数据源选当前表单两次：第二次提示「已有关联本表字段」，数据源没被改掉。
4. 换数据源后，显示字段和三个弹框里的配置都被清空。
5. 未选数据源的关联数据，画布上显示「请选择主表」。

---

### Task 4: 填报控件——选一条、存 id、显示字段跟进

**Files:**
- Modify: `front/src/components/form-fill/FormDataSelect.vue`
- Modify: `front/src/components/form-fill/FormFillField.vue`
- Modify: `front/src/components/form-fill/FormFillGrid.vue`
- Modify: `front/src/components/form-workspace/FormRecordDetailDrawer.vue`

**Interfaces:**
- Consumes: Task 1 的 `excludeIds`
- Produces: `FormDataSelect` 新增 props `mode: 'data' | 'relate'`（默认 `'data'`）、`excludeRecordId: string`（默认 `''`）；`FormFillField`、`FormFillGrid` 新增 prop `recordId: string`（默认 `''`）

- [ ] **Step 1: `FormDataSelect.vue` 加 props 与关联态文本**

props 里追加（保留原有 props 与注释）：

```js
  mode: { type: String, default: 'data' }, // 'data'-选择数据 'relate'-关联数据
  excludeRecordId: { type: String, default: '' },
```

`<script setup>` 里新增：

```js
const missing = ref(false)

const isRelate = computed(() => props.mode === 'relate')
const pickerTitle = computed(() => (isRelate.value ? '选择关联数据' : '选择数据'))
const emptyHint = computed(() => (isRelate.value ? '请选择主表' : '请配置数据源'))

const relateTitleText = computed(() => {
  const id = typeof props.modelValue === 'string' ? props.modelValue.trim() : ''
  if (!id) return ''
  if (missing.value) return '已删除'
  if (!selected.value) return ''
  const key = props.field.titleKey
  const col = key ? findDisplaySourceField(sourceFields.value, key) : null
  if (!col) return id
  return formatRecordField({ key: col.key, field: col }, selected.value) || id
})
```

`triggerText` 改成：

```js
const triggerText = computed(() => {
  if (props.preview) {
    return ''
  }
  if (isRelate.value) {
    return relateTitleText.value
  }
  const first = previewRows.value.find((item) => item.text && item.text !== '—')
  return first?.text || (selected.value ? '已选择' : '')
})
```

`loadSelected` 里管好 `missing`：函数开头 `missing.value = false`；查不到 id 的分支也置 `false`；`catch` 分支里在 `selected.value = null` 之后加 `missing.value = true`。

- [ ] **Step 2: 弹窗标题、空数据源提示、排除自己**

模板改三处：

```vue
    <div v-if="!field.sourceFormId" class="data-select-hint">
      {{ emptyHint }}
    </div>
```

```vue
      <el-dialog v-if="!preview" v-model="pickerVisible" :title="pickerTitle" width="800px" align-center draggable
        destroy-on-close @open="onPickerOpen" :append-to-body="true">
```

`loadRecords` 里给查询体加排除条件：

```js
    const result = await queryFormRecordsApi(
      props.appId,
      props.field.sourceFormId,
      {
        page: page.value,
        pageSize: pageSize.value,
        // 关联本表时排除正在编辑的这条；关联他表时这个 id 不在源表里，排除不到任何数据
        ...(props.excludeRecordId ? { excludeIds: [props.excludeRecordId] } : {}),
        ...mergeFilterQueries(optionQuery, searchQuery),
      },
    )
```

- [ ] **Step 3: `FormFillField.vue` 换掉禁用下拉**

props 追加 `recordId: { type: String, default: '' }`。把这段：

```vue
    <el-select
      v-else-if="field.type === 'relate'"
      disabled
      class="fill-full"
      :placeholder="field.placeholder"
    />
```

换成：

```vue
    <FormDataSelect
      v-else-if="field.type === 'relate'"
      class="fill-full"
      :app-id="appId"
      :field="field"
      mode="relate"
      :disabled="isDisabled"
      :model-value="modelValue"
      :record-values="recordValues"
      :form-fields="formFields"
      :exclude-record-id="recordId"
      @update:model-value="onUpdateModelValue"
      @fill="onFill"
    />
```

- [ ] **Step 4: `FormFillGrid.vue` 透传 recordId**

props 追加 `recordId: { type: String, default: '' }`，两处 `<FormFillField>`（标签页内和标签页外）都加 `:record-id="recordId"`。

- [ ] **Step 5: 详情抽屉传入当前记录 id**

`FormRecordDetailDrawer.vue` 的 `<FormFillGrid>` 加一行：

```vue
        :record-id="record?.id || ''"
```

新增抽屉（`FormRecordCreateDrawer`）不传，保持默认空串——新建时本来就没有自己可排除。

- [ ] **Step 6: 手工验收填报主路径**

1. 人员表填报，「所属工厂」点开弹窗标题是「选择关联数据」，表格按「选择过程设置」的列显示，勾一条确定，收起态显示工厂的显示字段。
2. 保存后再打开这条数据，仍显示同一个工厂。
3. 去工厂表把该工厂改名，回来刷新详情，关联数据显示新名字；如果配了填充规则，被填充的字段**没变**。
4. 删掉那条工厂数据，刷新详情显示「已删除」。
5. 组织表里「上级」数据源选自己：编辑「华东分部」时弹窗里没有「华东分部」自己。
6. 非必填时收起态右侧有清空图标，点了只清这一格。
7. 详情只读态点控件不弹窗（跳转在 Task 5）。

---

### Task 5: 只读态点开源数据详情

**Files:**
- Modify: `front/src/components/form-fill/FormDataSelect.vue`

**Interfaces:**
- Consumes: Task 4 的 `isRelate`、`missing`、`selected`、`sourceFields`、`dictItemsByCode`
- Produces: 只读态点关联数据文本 → 打开主表那条数据的只读详情抽屉

- [ ] **Step 1: 异步引入详情抽屉，避免循环依赖**

`FormRecordDetailDrawer` → `FormFillGrid` → `FormFillField` → `FormDataSelect` 是一条环，必须用异步组件在运行时才解析：

```js
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const FormRecordDetailDrawer = defineAsyncComponent(
  () => import('../form-workspace/FormRecordDetailDrawer.vue'),
)

const sourceDetailVisible = ref(false)
```

- [ ] **Step 2: 点击行为分流**

```js
function openPicker() {
  if (props.preview) {
    return
  }
  if (props.disabled) {
    if (isRelate.value) {
      openSourceDetail()
    }
    return
  }
  if (!props.field.sourceFormId) {
    return
  }
  pickerVisible.value = true
}

function openSourceDetail() {
  const id = typeof props.modelValue === 'string' ? props.modelValue.trim() : ''
  if (!id) {
    return
  }
  if (missing.value || !selected.value) {
    ElMessage.warning('源数据已删除或无法查看')
    return
  }
  sourceDetailVisible.value = true
}
```

- [ ] **Step 3: 渲染只读抽屉**

模板里 `</el-dialog>` 之后、`</template>` 之前加：

```vue
      <FormRecordDetailDrawer
        v-if="sourceDetailVisible"
        v-model="sourceDetailVisible"
        :record="selected"
        :fields="sourceFields"
        :dict-items-by-code="dictItemsByCode"
        :app-id="appId"
        :form-id="field.sourceFormId"
        :can-edit="false"
      />
```

- [ ] **Step 4: 手工验收**

1. 数据管理点开人员详情（只读），点「所属工厂」显示的文字，弹出工厂那条数据的详情，底部只有「关闭」，没有「编辑」。
2. 关掉后回到人员详情，人员详情没被改动。
3. 人员详情点「编辑」后再点这一格，打开的是选择弹窗，不是跳转。
4. 把工厂删掉再点，提示「源数据已删除或无法查看」，不跳。

---

### Task 6: 数据管理列表显示关联标题

**Files:**
- Create: `front/src/components/form-workspace/relateTitles.js`
- Test: `front/src/components/form-workspace/relateTitles.spec.js`
- Modify: `front/src/components/form-workspace/FormRecordList.vue`
- Modify: `front/src/components/form-workspace/FormRecordCell.vue`

**Interfaces:**
- Consumes: Task 1 的 `ids`、Task 2 的 `relateColumnFields`
- Produces:
  - `relateTitleKey(formId, id): string`（形如 `'12:64b7…'`）
  - `relateIdsByForm(relateFields, records): { formId, ids: string[] }[]`
  - `chunkIds(ids, size = 100): string[][]`
  - `loadRelateTitles(appId, relateFields, records): Promise<Record<string, string>>`

- [ ] **Step 1: 写 `relateTitles.spec.js`（只测纯函数）**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chunkIds, relateIdsByForm, relateTitleKey } from './relateTitles.js'

test('relateTitleKey 拼表单和数据 id', () => {
  assert.equal(relateTitleKey(12, 'abc'), '12:abc')
})

test('relateIdsByForm 按主表归并且去重', () => {
  const fields = [
    { key: 'r1', type: 'relate', sourceFormId: 12 },
    { key: 'r2', type: 'relate', sourceFormId: 12 },
    { key: 'r3', type: 'relate', sourceFormId: 13 },
  ]
  const records = [
    { data: { r1: 'a', r2: 'a', r3: 'x' } },
    { data: { r1: 'b', r2: '', r3: null } },
  ]
  assert.deepEqual(relateIdsByForm(fields, records), [
    { formId: 12, ids: ['a', 'b'] },
    { formId: 13, ids: ['x'] },
  ])
})

test('chunkIds 按 100 切片', () => {
  const ids = Array.from({ length: 205 }, (_, i) => String(i))
  const chunks = chunkIds(ids)
  assert.deepEqual(
    chunks.map((item) => item.length),
    [100, 100, 5],
  )
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test front/src/components/form-workspace/relateTitles.spec.js
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 写 `relateTitles.js`**

```js
import { getFormApi, queryFormRecordsApi } from '../../api/apps'
import { formatCellValue, isFillable } from '../form-fill/fillValues.js'

export function relateTitleKey(formId, id) {
  return `${Number(formId)}:${id}`
}

export function relateIdsByForm(relateFields, records) {
  const byForm = new Map()
  for (const field of relateFields || []) {
    const formId = Number(field.sourceFormId)
    if (!Number.isInteger(formId) || formId <= 0) continue
    for (const row of records || []) {
      const id = row?.data?.[field.key]
      if (typeof id !== 'string' || !id) continue
      if (!byForm.has(formId)) byForm.set(formId, new Set())
      byForm.get(formId).add(id)
    }
  }
  return [...byForm].map(([formId, ids]) => ({ formId, ids: [...ids] }))
}

export function chunkIds(ids, size = 100) {
  const chunks = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

function titleFieldOf(relateFields, formId) {
  const field = (relateFields || []).find(
    (item) => Number(item.sourceFormId) === Number(formId) && item.titleKey,
  )
  return field?.titleKey || ''
}

export async function loadRelateTitles(appId, relateFields, records) {
  const titles = {}
  for (const { formId, ids } of relateIdsByForm(relateFields, records)) {
    const titleKey = titleFieldOf(relateFields, formId)
    let sourceFields = []
    try {
      const detail = await getFormApi(appId, formId)
      sourceFields = (detail?.fields || []).filter(isFillable)
    } catch {
      continue
    }
    const titleField = sourceFields.find((item) => item.key === titleKey)
    for (const chunk of chunkIds(ids)) {
      try {
        const result = await queryFormRecordsApi(appId, formId, {
          ids: chunk,
          pageSize: 100,
        })
        for (const row of result?.items || []) {
          const text = titleField
            ? formatCellValue(titleField, row.data?.[titleKey], {}, {}, {})
            : row.id
          titles[relateTitleKey(formId, row.id)] = text || row.id
        }
      } catch {
        // 这一批取不到就让单元格显示「已删除」，不阻塞整张列表
      }
    }
  }
  return titles
}
```

字典 / 人员 / 部门列不在显示字段的常见选择里，这里传空表，显示的是存储值；需要更精细的显示再另说（`formatCellValue` 的签名保持不变）。

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test front/src/components/form-workspace/relateTitles.spec.js
```

Expected: PASS。

- [ ] **Step 5: `FormRecordList.vue` 拉标题**

import 补：

```js
import { relateColumnFields } from '../form-design/relateField.js'
import { loadRelateTitles } from './relateTitles'
```

新增 ref 与 computed：

```js
const relateTitles = ref({})
const relateFields = computed(() => relateColumnFields(props.fields))
```

`loadRecords` 里，`userNames.value = result?.userNames || {}` 之后加：

```js
    const titles = relateFields.value.length
      ? await loadRelateTitles(props.appId, relateFields.value, records.value)
      : {}
    if (session !== loadSession.value) return
    relateTitles.value = titles
```

（先拿到结果再比对 `session`，避免切换表单时把上一张表的标题写进来。）

`catch` 分支里补 `relateTitles.value = {}`。

模板里 `<FormRecordCell>` 加一行：

```vue
                :relate-titles="relateTitles"
```

- [ ] **Step 6: `FormRecordCell.vue` 显示标题**

props 追加：

```js
  relateTitles: { type: Object, default: () => ({}) },
```

import 补 `import { relateTitleKey } from './relateTitles'`，`display` 改成：

```js
const display = computed(() => {
  const field = props.field
  if (field?.type === 'relate') {
    const id = props.row.data?.[field.key]
    if (typeof id !== 'string' || !id) return ''
    return (
      props.relateTitles[relateTitleKey(field.sourceFormId, id)] || '已删除'
    )
  }
  return formatCellValue(
    field,
    props.row.data?.[field.key],
    props.dictItemsByCode,
    props.userNames,
    props.deptNames,
  )
})
```

关联数据不可内联编辑（`isInlineEditable` 里 `isFillable` 已为 false），铅笔按钮不会出现，不用另加判断。

- [ ] **Step 7: 手工验收列表**

1. 人员表数据管理，「所属工厂」列显示工厂名称，不是一串 id。
2. 若这张表以前存过列设置，新列可能默认不显示：点右上「列设置」把它勾出来。
3. 改工厂名字后刷新列表，这一列跟着变。
4. 删掉工厂后刷新列表，这一列显示「已删除」。
5. 鼠标移到这一列的单元格上没有编辑铅笔；点行仍能打开详情。

---

### Task 7: 全流程手工验收与用例更新

**Files:**
- 无代码改动
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`
- Modify: `docs/testcases/2026-08-30-subform-test-cases.md`（仅在有过期期望时）
- Modify: `docs/testcases/README.md`（仅在有过期说明时）

- [ ] **Step 1: 造数据**

新建工厂表（工厂编码、工厂名称都是单行文本 `input`）和人员表（工人名、工人编号单行文本，所属工厂用关联数据 `relate`，数据源选工厂表，显示字段选工厂名称）。工厂表录 3 条。

- [ ] **Step 2: 逐条走规格第 8 节**

按顺序验：1 挑一条存关系、2 源表改名跟进、3 卡片不入库、4 弹窗列和搜索、5 没配数据源、6 源数据删了、7 关联本表选不到自己、8 候选表（这条属于关联子表单，本计划跳过）、13 不能进子表单（往子表单里拖关联数据应被拒绝）。

- [ ] **Step 3: 回归已有能力**

同一张人员表上再放一个**选择数据 `data`**指向工厂表，确认两者并存：选择数据仍是「挑一条来拷」，改工厂名不影响它拷出去的值；关联数据跟着变。数据管理列表两列都正常。

- [ ] **Step 4: 验选择数据必填（本次顺带修的行为变化）**

人员表上那个选择数据字段勾上「必填」，新增时空着直接保存：应提示「请填写「<字段标题>」」并停在表单上（改之前是能存进去的）。取消必填后能正常空着保存。子表单里的选择数据也照此验一遍（子表行内必填走同一套校验）。

- [ ] **Step 5: 补测试用例文档**

选择数据的必填从「不生效」变成「生效」，属于已有组件的核心行为改变，同一轮里要改用例：

1. `docs/testcases/2026-08-31-complex-form-manual-tests.md` 补一条：选择数据 `data` 勾必填、不选就保存 → 被拦；子表单 `subform` 里的选择数据同样被拦。
2. `docs/testcases/2026-08-30-subform-test-cases.md` 里若有「子表选择数据必填」相关的过期期望（写着能存下去），改成会被拦。
3. `docs/testcases/README.md` 的「容易误判」里如果记着「选择数据的必填不生效」，删掉或改写。

关联数据、关联子表单自己的专项用例放在关联子表单那份计划的收尾任务里一起写。

- [ ] **Step 6: 检查编码**

```bash
git diff --stat
```

打开本次改过的每个文件扫一眼中文，确认没有 `鏍囩`、`å¤æ` 这类乱码。

---

## Spec coverage

| 规格（第 4 节） | 任务 |
|---|---|
| 属性面板：数据源含当前表单、显示字段、三个复用弹框 | 3 |
| 一张表最多一个关联本表字段 | 2、3 |
| 换数据源清空附属配置 | 3 |
| 画布「请选择主表」/ 占位不查询 | 3 |
| 填报选一条、存 id、卡片、填充、清空、禁用 | 4 |
| 「会受 … 字段影响」把关联数据算进去 | 2 |
| 关联本表排除自己 | 1、4 |
| 显示字段刷新跟进、已删除、显示字段被删 | 4 |
| 只读跳源数据详情 | 5 |
| 数据管理列显示标题、不可内联编辑 | 2、6 |
| 导入不含这一列 | 无需改（`IMPORT_SKIP_TYPES` 已含 `relate`） |
| 必填生效 | 2 |
| 顺带修：选择数据 `data` 的必填开关以前不生效，现在与关联数据一致 | 2（用例见 Task 7） |
| 不能拖进子表单 | 无需改（`SUBFORM_CHILD_TYPES` 未含 `relate`） |
| 树形靠数据联动 + 多个下拉 | 无需改（现有能力） |

无 TBD。命名一致性检查：`relateField.js` 导出的 `relateColumnFields` 在 Task 6 中原名使用；`relateTitles.js` 的 `relateTitleKey(formId, id)` 在 `FormRecordCell.vue` 中同名同参使用；`FormDataSelect` 的 `mode` / `excludeRecordId` 在 Task 3（画布）、Task 4（填报）中拼写一致。
