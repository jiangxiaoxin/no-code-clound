# 关联子表单 `relate-subform` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**前置依赖：** 必须先完成 `docs/superpowers/plans/2026-09-04-relate-data.md`（关联数据）。本计划要用到它的两样东西：字段里存在 `relate` 类型且配好了 `sourceFormId`；`FormFillGrid` / `FormFillField` 已经能透传 `recordId`。

**Goal:** 在被关联的主表上做一块只读表格：查看主表某条数据的详情时，列出「哪些表的哪些数据用关联数据指向了我」，可翻页、可点开子表数据的只读详情。

**Architecture:** 这个字段**不入库**，只是详情里的一个查询视图。拖入时弹框从「已经用关联数据指向本表单」的表单里选一条，字段上记下 `childFormId` + `childRelateKey`。运行时直接用子表的记录查询接口，条件是「那个关联数据字段 = 当前主表数据 id」，分页照常。后端只需让表单字段清单能返回 `relate` 字段。

**Tech Stack:** Vue 3 + Element Plus；后端 NestJS。前端纯函数用 `node --test`，后端用 Jest。

**Spec:** `docs/superpowers/specs/2026-09-04-relate-data-and-relate-subform-design.md`（第 5 节；第 7 节第 3 条是唯一要动的后端口子）

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 的容器不加 `gap`；`el-dialog` 默认 `draggable`。
- 图标先确认 `@element-plus/icons-vue` 有该导出再 import。本计划不需要新图标。
- 不删不改使用者已有的注释和 `console.log`。
- 不新增 npm 依赖；文件 UTF-8 无 BOM，写完回读确认中文没乱码。
- 这个字段**不参与**：入库、必填校验、数据管理列表列、快捷筛选、排序、导入模版、导出。
- 拖入只支持「从已有关联表选择」，**不做**新建空白关联表。
- 表格里**不做**新增 / 编辑 / 删除子表数据，也不做「可新增 / 可编辑 / 可删除」开关。
- 不能拖进子表单 `subform`，也不能嵌在另一个关联子表单里。

## File Structure

```text
server/src/application/dto/list-form-fields.dto.ts                  # include 放行 'relate'
server/src/application/application.service.ts                       # 字段清单可带 relate + sourceFormId
server/src/application/application.service.spec.ts
front/src/components/form-design/relateSubform.js                   # 新建：候选项、默认列、查询体
front/src/components/form-design/relateSubform.spec.js              # 新建
front/src/components/form-design/dataSelect.js                      # 抽出 sourceDictCodes 供两处用
front/src/components/form-fill/FormDataSelect.vue                   # 改用 sourceDictCodes
front/src/components/form-fill/fillValues.js                        # 该字段不填报、不入库、不进列表
front/src/components/form-fill/fillValues.spec.js
server/src/application/form-record/form-record.coerce.ts            # 入库丢弃该 key
server/src/application/form-record/form-record.coerce.spec.ts
server/src/application/form-record/form-record.import.ts            # 导入跳过
front/src/components/form-design/fieldTypes.js                      # 移出「未完成」区
front/src/components/form-design/RelateSubformPickerDialog.vue      # 新建：拖入时选关联表单
front/src/components/FormDesignPanel.vue                            # 拖入流程 + 重复拦截 + 抽出 placeField
front/src/components/form-design/FormDesignProps.vue                # 属性面板
front/src/components/form-design/FormDesignCanvasField.vue          # 画布空表格占位
front/src/components/form-fill/FormRelateSubform.vue                # 新建：详情里的只读表格
front/src/components/form-fill/FormFillField.vue                    # 渲染分支
```

职责划分：`relateSubform.js` 只放不依赖组件的判断和拼装（候选项、默认列、查询体）；拉数据和渲染都在 `FormRelateSubform.vue`；拖入选表只在 `RelateSubformPickerDialog.vue`。

---

### Task 1: 表单字段清单能返回关联数据字段

**Files:**
- Modify: `server/src/application/dto/list-form-fields.dto.ts`
- Modify: `server/src/application/application.service.ts`
- Test: `server/src/application/application.service.spec.ts`

**Interfaces:**
- Produces: `GET /apps/:appId/form-fields?include=relate` 的每张表单里，除原有可选字段外，还会带上该表单里**配好了主表**的关联数据字段：`{ key, title, type: 'relate', sourceFormId }`。不传 `include=relate` 时返回内容与现在完全一样。

- [ ] **Step 1: 写失败测试**

追加到 `application.service.spec.ts`（沿用该文件已有的 repo mock 写法；下面是断言部分，mock 的表单 `fields` 存成 JSON 字符串时按该文件现有 helper 处理）：

```ts
it('include=relate 时返回关联数据字段和它指向的主表', async () => {
  const forms = [
    {
      id: 30,
      name: '人员表',
      applicationId: 1,
      fields: JSON.stringify({
        fields: [
          { key: 'name', type: 'input', title: '工人名' },
          { key: 'r1', type: 'relate', title: '所属工厂', sourceFormId: 12 },
          { key: 'r2', type: 'relate', title: '没配主表' },
        ],
      }),
    },
  ];
  formRepo.find.mockResolvedValue(forms);

  const withRelate = await service.listFormFields(1, 1, undefined, 'relate');
  expect(withRelate[0].fields).toEqual([
    { key: 'name', title: '工人名', type: 'input' },
    { key: 'r1', title: '所属工厂', type: 'relate', sourceFormId: 12 },
  ]);

  const plain = await service.listFormFields(1, 1);
  expect(plain[0].fields).toEqual([
    { key: 'name', title: '工人名', type: 'input' },
  ]);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test --prefix server -- application.service.spec
```

Expected: FAIL，`relate` 被 `OPTION_FIELD_TYPES` 过滤掉了。

- [ ] **Step 3: 实现**

`list-form-fields.dto.ts`：

```ts
  @IsOptional()
  @IsIn(['subform', 'relate'])
  include?: string;
```

`application.service.ts`：

1. `OptionField` 类型加一个可选键：

```ts
export type OptionField = {
  key: string;
  title: string;
  type: string;
  dictCode?: string;
  optionSource?: string;
  /** 关联数据指向的主表，仅 include=relate 时返回 */
  sourceFormId?: number;
  fields?: OptionField[];
};
```

2. `listFormFields` 里加一行并传参：

```ts
    const includeSubform = include === 'subform';
    const includeRelate = include === 'relate';
```

```ts
      const fields = this.toOptionFields(
        flattenFields(parseFormSchema(form.fields).fields),
        includeSubform,
        includeRelate,
      );
```

3. `toOptionFields` 加第三个参数，并在 `if (!OPTION_FIELD_TYPES.has(type))` **之前**插入分支：

```ts
  private toOptionFields(
    raw: Record<string, unknown>[] | null,
    includeSubform = false,
    includeRelate = false,
  ): OptionField[] {
```

```ts
      if (type === 'relate') {
        if (!includeRelate) {
          continue;
        }
        const sourceFormId = Number(item.sourceFormId);
        if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
          continue;
        }
        fields.push({
          key,
          title: typeof item.title === 'string' ? item.title : '',
          type,
          sourceFormId,
        });
        continue;
      }
```

子表单递归那一处继续传 `false, false`，子表里本来就不会有关联数据。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test --prefix server -- application.service.spec
```

Expected: PASS。

---

### Task 2: 纯函数与「不填报、不入库」的边界

**Files:**
- Create: `front/src/components/form-design/relateSubform.js`
- Test: `front/src/components/form-design/relateSubform.spec.js`
- Modify: `front/src/components/form-design/dataSelect.js`
- Modify: `front/src/components/form-fill/FormDataSelect.vue`
- Modify: `front/src/components/form-fill/fillValues.js`
- Test: `front/src/components/form-fill/fillValues.spec.js`
- Modify: `server/src/application/form-record/form-record.coerce.ts`
- Test: `server/src/application/form-record/form-record.coerce.spec.ts`
- Modify: `server/src/application/form-record/form-record.import.ts`

**Interfaces:**
- Produces：
  - `isRelateSubformField(field): boolean`
  - `relateSubformOptions(forms, currentFormId): { formId, formName, relateKey, relateTitle, fields, label }[]`
  - `hasRelateSubformField(fields, childFormId, childRelateKey): boolean`
  - `defaultRelateSubformColumns(childFields): string[]`（前 5 个）
  - `relateSubformReady(field): boolean`
  - `relateSubformQuery(field, recordId, page): { page, pageSize, filters, sort }`
  - `sourceDictCodes(fields): string[]`（从 `dataSelect.js` 导出，`FormDataSelect.vue` 与新组件共用）
- 边界：前端 `isFillable`/`isListColumn`/`persistsValue` 都对该类型为假；后端 `coerce` 丢弃该 key，导入模版不含该列。

- [ ] **Step 1: 写 `relateSubform.spec.js`**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultRelateSubformColumns,
  hasRelateSubformField,
  isRelateSubformField,
  relateSubformOptions,
  relateSubformQuery,
  relateSubformReady,
} from './relateSubform.js'

const forms = [
  {
    id: 30,
    name: '人员表',
    fields: [
      { key: 'name', type: 'input', title: '工人名' },
      { key: 'no', type: 'input', title: '工人编号' },
      { key: 'r1', type: 'relate', title: '所属工厂', sourceFormId: 12 },
      { key: 'r2', type: 'relate', title: '常驻工厂', sourceFormId: 12 },
      { key: 'r3', type: 'relate', title: '所属仓库', sourceFormId: 13 },
    ],
  },
  {
    id: 31,
    name: '设备表',
    fields: [{ key: 'code', type: 'input', title: '设备编码' }],
  },
]

test('isRelateSubformField 只认 relate-subform', () => {
  assert.equal(isRelateSubformField({ type: 'relate-subform' }), true)
  assert.equal(isRelateSubformField({ type: 'relate' }), false)
})

test('候选项按「表单 + 关联字段」拆开，只留指向当前表单的', () => {
  const options = relateSubformOptions(forms, 12)
  assert.deepEqual(
    options.map((item) => item.label),
    ['人员表 · 所属工厂', '人员表 · 常驻工厂'],
  )
  assert.equal(options[0].formId, 30)
  assert.equal(options[0].relateKey, 'r1')
  assert.deepEqual(
    options[0].fields.map((item) => item.key),
    ['name', 'no'],
  )
})

test('没有表单关联本表单时候选为空', () => {
  assert.deepEqual(relateSubformOptions(forms, 99), [])
})

test('同一个表单 + 关联字段只能加一个', () => {
  const fields = [
    { key: 'rs1', type: 'relate-subform', childFormId: 30, childRelateKey: 'r1' },
  ]
  assert.equal(hasRelateSubformField(fields, 30, 'r1'), true)
  assert.equal(hasRelateSubformField(fields, 30, 'r2'), false)
  assert.equal(hasRelateSubformField(fields, 31, 'r1'), false)
})

test('默认取前 5 个可展示字段当列', () => {
  const childFields = Array.from({ length: 7 }, (_, i) => ({
    key: `f${i}`,
    type: 'input',
    title: `字段${i}`,
  }))
  assert.deepEqual(defaultRelateSubformColumns(childFields), [
    'f0',
    'f1',
    'f2',
    'f3',
    'f4',
  ])
  assert.deepEqual(defaultRelateSubformColumns([]), [])
})

test('配好关联表单才算就绪', () => {
  assert.equal(relateSubformReady({ childFormId: 30, childRelateKey: 'r1' }), true)
  assert.equal(relateSubformReady({ childFormId: 30 }), false)
  assert.equal(relateSubformReady({}), false)
})

test('查询体按关联字段等于当前数据 id', () => {
  const field = { childFormId: 30, childRelateKey: 'r1', pageSize: 20 }
  assert.deepEqual(relateSubformQuery(field, 'abc', 2), {
    page: 2,
    pageSize: 20,
    filters: [{ key: 'r1', op: 'eq', value: 'abc' }],
    sort: { key: 'updatedAt', order: 'desc' },
  })
  assert.equal(relateSubformQuery({ childRelateKey: 'r1' }, 'abc', 1).pageSize, 10)
})
```

- [ ] **Step 2: 补 `fillValues.spec.js` 用例**

```js
test('relate-subform 不填报、不入库、不进列表', () => {
  const field = { key: 'rs1', type: 'relate-subform', childFormId: 30, childRelateKey: 'r1' }
  assert.equal(isFillable(field), false)
  assert.equal(isListColumn(field), false)
  assert.equal(isInlineEditable(field), false)
  assert.deepEqual(emptyRecordValues([field]), {})
  assert.deepEqual(buildRecordData([field], { rs1: 'x' }), {})
  assert.equal(firstRequiredError([{ ...field, required: true }], {}), null)
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
node --test front/src/components/form-design/relateSubform.spec.js front/src/components/form-fill/fillValues.spec.js
```

Expected: FAIL（模块不存在；`isFillable` 现在会返回 true，因为 `SKIP_TYPES` 里没有它）。

- [ ] **Step 4: 写 `relateSubform.js`**

```js
import { flattenFields } from './tabsField.js'

const DEFAULT_PAGE_SIZE = 10
const DEFAULT_COLUMN_COUNT = 5

export function isRelateSubformField(field) {
  return field?.type === 'relate-subform'
}

export function relateSubformOptions(forms, currentFormId) {
  const options = []
  for (const form of forms || []) {
    const fields = form?.fields || []
    const plain = fields.filter((item) => item.type !== 'relate')
    for (const item of fields) {
      if (item.type !== 'relate') continue
      if (Number(item.sourceFormId) !== Number(currentFormId)) continue
      const formName = form.name || ''
      const relateTitle = item.title || item.key
      options.push({
        formId: Number(form.id),
        formName,
        relateKey: item.key,
        relateTitle,
        fields: plain,
        label: `${formName} · ${relateTitle}`,
      })
    }
  }
  return options
}

export function hasRelateSubformField(fields, childFormId, childRelateKey) {
  return flattenFields(fields).some(
    (field) =>
      isRelateSubformField(field) &&
      Number(field.childFormId) === Number(childFormId) &&
      field.childRelateKey === childRelateKey,
  )
}

export function defaultRelateSubformColumns(childFields) {
  return (childFields || [])
    .slice(0, DEFAULT_COLUMN_COUNT)
    .map((field) => field.key)
}

export function relateSubformReady(field) {
  return Boolean(Number(field?.childFormId) > 0 && field?.childRelateKey)
}

export function relateSubformQuery(field, recordId, page) {
  const size = Number(field?.pageSize)
  return {
    page,
    pageSize: Number.isInteger(size) && size > 0 ? size : DEFAULT_PAGE_SIZE,
    filters: [{ key: field.childRelateKey, op: 'eq', value: recordId }],
    sort: { key: 'updatedAt', order: 'desc' },
  }
}
```

- [ ] **Step 5: 把字典编码收集抽到 `dataSelect.js`**

在 `dataSelect.js` 末尾加（逻辑与 `FormDataSelect.vue` 里现有的 `dictCodesOf` 完全一致，只是挪到公共处给两个组件用）：

```js
import { isSelectType } from './fieldTypes'

export function sourceDictCodes(fields) {
  const codes = []
  const seen = new Set()
  for (const field of fields || []) {
    const usesDict =
      (field.type === 'radio' ||
        field.type === 'checkbox' ||
        isSelectType(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) continue
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  }
  return codes
}
```

`FormDataSelect.vue`：删掉本地的 `function dictCodesOf(fields) {…}`，改成从 `../form-design/dataSelect` 里 import `sourceDictCodes`，调用处 `const codes = sourceDictCodes(sourceFields.value)`。**只改这一处**，其它逻辑和注释别动。

- [ ] **Step 6: 前端边界**

`fillValues.js` 的 `SKIP_TYPES` 加一行：

```js
  'relate-subform',
```

这样 `isFillable` 为假 → 不进 `emptyRecordValues` / `buildRecordData`、不做必填校验、不可内联编辑；`isListColumn` 也不会带上它（那里只额外放行 `subform` / `relate` / `serialNumber`）。

- [ ] **Step 7: 后端边界**

`form-record.coerce.ts` 的 `coerceFieldValue`，把它并进「直接丢弃」那一组：

```ts
    case 'divider':
    case 'tabs':
    case 'relate-subform':
    case 'currentUser':
```

`form-record.import.ts` 的 `IMPORT_SKIP_TYPES` 加一行 `'relate-subform',`。

`form-record.coerce.spec.ts` 补：

```ts
it('relate-subform 不入库', () => {
  const fields = [
    { key: 'name', type: 'input' },
    { key: 'rs1', type: 'relate-subform' },
  ];
  expect(coerceRecordData(fields, { name: 'A', rs1: 'x' })).toEqual({ name: 'A' });
});
```

- [ ] **Step 8: 跑全部相关测试**

```bash
node --test front/src/components/form-design/relateSubform.spec.js front/src/components/form-fill/fillValues.spec.js
npm test --prefix server -- form-record.coerce.spec
```

Expected: 全部 PASS。回读新文件确认中文正常。

---

### Task 3: 设计器——拖入选关联表单、属性面板、画布占位

**Files:**
- Modify: `front/src/components/form-design/fieldTypes.js`
- Create: `front/src/components/form-design/RelateSubformPickerDialog.vue`
- Modify: `front/src/components/FormDesignPanel.vue`
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`

**Interfaces:**
- Consumes: Task 1 的 `include=relate`；Task 2 的 `relateSubformOptions`、`hasRelateSubformField`、`defaultRelateSubformColumns`、`isRelateSubformField`、`relateSubformReady`
- Produces: 字段 JSON 形如 `{ type: 'relate-subform', key, title, width: '1', childFormId, childRelateKey, columnKeys: [], pageSize: 10 }`

- [ ] **Step 1: 调色板移出「未完成」区**

`fieldTypes.js` 把 `relate-subform` 那一行挪到 `// -----------以下未完成------` 之前（关联数据已在前一份计划里挪过）。占位保持 `'请选择'`，图标继续 `Link`。移完这个注释行下面如果空了就留着注释，不要删。

- [ ] **Step 2: 写选表弹框**

`front/src/components/form-design/RelateSubformPickerDialog.vue`：

```vue
<template>
  <el-dialog
    :model-value="modelValue"
    title="选择关联表单"
    width="520px"
    align-center
    draggable
    destroy-on-close
    @update:model-value="onVisibleChange"
    @open="loadOptions"
  >
    <div v-loading="loading" class="relate-subform-picker">
      <div v-if="!loading && !options.length" class="relate-subform-empty">
        还没有表单关联本表单，请先在其他表单里添加「关联数据」并选择本表单
      </div>
      <el-radio-group v-else v-model="picked" class="relate-subform-options">
        <el-radio
          v-for="item in options"
          :key="`${item.formId}:${item.relateKey}`"
          :value="`${item.formId}:${item.relateKey}`"
        >
          {{ item.label }}
        </el-radio>
      </el-radio-group>
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" :disabled="!picked" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { listFormFieldsApi } from '../../api/apps'
import { relateSubformOptions } from './relateSubform.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const loading = ref(false)
const options = ref([])
const picked = ref('')

async function loadOptions() {
  picked.value = ''
  loading.value = true
  try {
    const forms = (await listFormFieldsApi(props.appId, { include: 'relate' })) || []
    options.value = relateSubformOptions(forms, props.formId)
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
}

function onVisibleChange(value) {
  emit('update:modelValue', value)
  if (!value) {
    emit('cancel')
  }
}

function onCancel() {
  emit('update:modelValue', false)
}

function onConfirm() {
  const found = options.value.find(
    (item) => `${item.formId}:${item.relateKey}` === picked.value,
  )
  if (!found) return
  emit('confirm', found)
  emit('update:modelValue', false)
}
</script>

<style scoped lang="less">
.relate-subform-picker {
  min-height: 80px;
}

.relate-subform-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 20px;
}

.relate-subform-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
</style>
```

- [ ] **Step 3: `FormDesignPanel.vue` 接上拖入流程**

import 补：

```js
import RelateSubformPickerDialog from './form-design/RelateSubformPickerDialog.vue'
import {
  defaultRelateSubformColumns,
  hasRelateSubformField,
} from './form-design/relateSubform.js'
```

新增状态：

```js
const relateSubformVisible = ref(false)
let pendingRelateSubform = null
```

把 `addField` 末尾那段插入逻辑抽成函数（原逻辑不变，只是挪位置），放在 `addField` 之前：

```js
function placeField(field, { beforeKey, paneId, fromCanvas, fromPalette }) {
  if (!(fromCanvas && !paneId)) {
    const targetPaneId = resolveTargetPaneId(paneId)
    const pane = findPane(targetPaneId)
    if (pane) {
      if (!pane.fields) pane.fields = []
      insertIntoList(pane.fields, field, beforeKey)
      activePaneId.value = pane.id
      selectField(field)
      return
    }
  }
  insertIntoRoot(field, beforeKey, fromPalette)
  selectField(field)
}
```

`addField` 的结尾改成：

```js
  placeField(field, { beforeKey, paneId, fromCanvas, fromPalette })
}
```

在 `addField` 里 `tabs` 那一段之后、`findParentSubform` 之前插入：

```js
  if (item.type === 'relate-subform') {
    pendingRelateSubform = { item, beforeKey, paneId, fromCanvas, fromPalette }
    relateSubformVisible.value = true
    return
  }
```

新增两个处理函数：

```js
function onRelateSubformConfirm(option) {
  const pending = pendingRelateSubform
  pendingRelateSubform = null
  if (!pending || !option) {
    return
  }
  if (hasRelateSubformField(fields.value, option.formId, option.relateKey)) {
    ElMessage.warning('已添加该关联表单')
    return
  }
  const field = createFieldFromItem(pending.item)
  field.title = option.formName
  field.width = '1'
  field.placeholder = ''
  field.childFormId = option.formId
  field.childRelateKey = option.relateKey
  field.columnKeys = defaultRelateSubformColumns(option.fields)
  field.pageSize = 10
  placeField(field, pending)
}

function onRelateSubformCancel() {
  pendingRelateSubform = null
}
```

模板里（和其它对话框放一起）加：

```vue
    <RelateSubformPickerDialog
      v-model="relateSubformVisible"
      :app-id="appId"
      :form-id="formId"
      @confirm="onRelateSubformConfirm"
      @cancel="onRelateSubformCancel"
    />
```

拖进子表单不用另加判断：`SUBFORM_CHILD_TYPES` 里没有 `relate-subform`，`addChildField` 已经会拒绝。

- [ ] **Step 4: 属性面板**

`FormDesignProps.vue`：

1. 顶部 import 补：

```js
import { isRelateSubformField } from './relateSubform.js'
import { listFormFieldsApi } from '../../api/apps'  // 已 import 则跳过
```

2. 新增状态与 computed：

```js
const isRelateSubform = computed(() => isRelateSubformField(props.field))
const relateSubformForms = ref([])

const relateSubformLabel = computed(() => {
  const field = props.field
  const form = relateSubformForms.value.find(
    (item) => Number(item.id) === Number(field?.childFormId),
  )
  if (!form) return '关联表单已删除'
  const relate = (form.fields || []).find(
    (item) => item.key === field.childRelateKey,
  )
  if (!relate) return `${form.name} · 关联字段已删除`
  return `${form.name} · ${relate.title || relate.key}`
})

const relateSubformColumnOptions = computed(() => {
  const form = relateSubformForms.value.find(
    (item) => Number(item.id) === Number(props.field?.childFormId),
  )
  return (form?.fields || []).filter((item) => item.type !== 'relate')
})

async function loadRelateSubformForms() {
  if (!props.appId || !isRelateSubform.value) {
    relateSubformForms.value = []
    return
  }
  try {
    relateSubformForms.value =
      (await listFormFieldsApi(props.appId, { include: 'relate' })) || []
  } catch {
    relateSubformForms.value = []
  }
}

function onRelateSubformColumnsChange(value) {
  if (!props.field) return
  props.field.columnKeys = Array.isArray(value) ? [...value] : []
}

function onRelateSubformPageSizeChange(value) {
  if (!props.field) return
  props.field.pageSize = Number(value) || 10
}
```

监听字段切换时加载：

```js
watch(
  () => [props.appId, props.field?.key, props.field?.type],
  () => {
    loadRelateSubformForms()
  },
  { immediate: true },
)
```

3. 模板：`占位文字`（第 35 行那条 `el-form-item`）的 `v-if` 末尾追加 `&& field.type !== 'relate-subform'`；`校验设置`（第 42 行）的 `v-if` 改成 `v-if="!isSerialField && !isRelateSubform"`。

4. 在 relate 那段之后加：

```vue
      <template v-else-if="field.type === 'relate-subform'">
        <el-form-item label="关联表单">
          <span class="relate-subform-label">{{ relateSubformLabel }}</span>
        </el-form-item>
        <el-form-item label="显示的列">
          <el-select
            :model-value="field.columnKeys || []"
            class="relate-subform-select"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择要显示的列"
            @change="onRelateSubformColumnsChange"
          >
            <el-option
              v-for="item in relateSubformColumnOptions"
              :key="item.key"
              :label="item.title || item.key"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="每页条数">
          <el-select
            :model-value="field.pageSize || 10"
            class="relate-subform-select"
            @change="onRelateSubformPageSizeChange"
          >
            <el-option v-for="size in PAGE_SIZES" :key="size" :label="size" :value="size" />
          </el-select>
        </el-form-item>
      </template>
```

`PAGE_SIZES` 从 `../../utils/pagination` import。样式补：

```less
.relate-subform-select {
  width: 100%;
}

.relate-subform-label {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 32px;
}
```

- [ ] **Step 5: 画布占位**

`FormDesignCanvasField.vue`，在 relate 分支之后加：

```vue
    <div v-else-if="field.type === 'relate-subform'" class="relate-subform-preview">
      <div class="relate-subform-preview-head">
        <span v-for="key in field.columnKeys || []" :key="key" class="relate-subform-preview-col">
          {{ key }}
        </span>
      </div>
      <div class="relate-subform-preview-body">保存数据后，在数据详情里查看关联数据</div>
    </div>
```

样式（flex，不要 grid）：

```less
.relate-subform-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
}

.relate-subform-preview-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

.relate-subform-preview-body {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
```

列名这里显示的是字段 key（画布上拿不到子表标题）。若嫌不直观，可在 Step 4 的属性面板里把选中的列标题写进 `field.columnTitles`，本期不做，保持简单。

- [ ] **Step 6: 手工看设计器**

1. 先在人员表里放好「所属工厂」（关联数据，数据源=工厂表）并保存。
2. 打开工厂表设计，拖「关联子表单」到画布：弹出「选择关联表单」，能看到「人员表 · 所属工厂」。
3. 选中确定：画布出现一块空表格占位，标题是「人员表」。
4. 再拖一次并选同一条：提示「已添加该关联表单」，画布不多出字段。
5. 属性面板：关联表单是只读文本；「显示的列」默认已勾上人员表前几个字段，可改；「每页条数」可选 10/20/50/100；**没有**必填、禁用、可修改、占位文字。
6. 往子表单里拖「关联子表单」：被拒绝。
7. 把工厂表的关联子表单拖进标签页某个页签：可以放。

---

### Task 4: 详情里的只读表格

**Files:**
- Create: `front/src/components/form-fill/FormRelateSubform.vue`
- Modify: `front/src/components/form-fill/FormFillField.vue`

**Interfaces:**
- Consumes: Task 2 的 `relateSubformReady`、`relateSubformQuery`、`sourceDictCodes`；关联数据计划里已经打通的 `recordId`（`FormFillGrid` → `FormFillField`）
- Produces: `FormRelateSubform` props `{ field, appId, recordId }`

- [ ] **Step 1: 写 `FormRelateSubform.vue`**

```vue
<template>
  <div class="relate-subform-runtime">
    <div v-if="!ready" class="relate-subform-tip">请先在设计器里选择关联表单</div>
    <div v-else-if="!columns.length" class="relate-subform-tip">请先配置显示的列</div>
    <div v-else-if="!recordId" class="relate-subform-tip">
      保存后可在数据详情里查看关联数据
    </div>
    <template v-else>
      <el-table
        v-loading="loading"
        :data="rows"
        border
        stripe
        size="small"
        @row-click="onRowClick"
      >
        <el-table-column type="index" width="55" label="序号" />
        <el-table-column
          v-for="col in columns"
          :key="col.key"
          :label="col.title"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ formatColumn(col, row) }}
          </template>
        </el-table-column>
        <template #empty>
          <span>{{ loadError ? '加载失败' : '暂无关联数据' }}</span>
        </template>
      </el-table>
      <div class="relate-subform-footer">
        <el-button v-if="loadError" type="primary" link @click="reload">重试</el-button>
        <el-pagination
          background
          layout="total, prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          size="small"
          @current-change="onPageChange"
        />
      </div>
      <FormRecordDetailDrawer
        v-if="detailVisible"
        v-model="detailVisible"
        :record="detailRecord"
        :fields="childFields"
        :dict-items-by-code="dictItemsByCode"
        :app-id="appId"
        :form-id="field.childFormId"
        :can-edit="false"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  getFormApi,
  listDictionaryItemsByCodesApi,
  queryFormRecordsApi,
} from '../../api/apps'
import { listOrgDepartmentsApi } from '../../api/org'
import { flattenDeptNames, isDeptField } from '../form-design/deptField.js'
import { sourceDictCodes } from '../form-design/dataSelect'
import {
  relateSubformQuery,
  relateSubformReady,
} from '../form-design/relateSubform.js'
import { formatCellValue, isFillable } from './fillValues.js'

// 详情抽屉里又会渲染本组件，静态 import 会成环，这里延迟解析
const FormRecordDetailDrawer = defineAsyncComponent(
  () => import('../form-workspace/FormRecordDetailDrawer.vue'),
)

const props = defineProps({
  field: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  recordId: { type: String, default: '' },
})

const loading = ref(false)
const loadError = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const childFields = ref([])
const dictItemsByCode = ref({})
const userNames = ref({})
const deptNames = ref({})
const detailVisible = ref(false)
const detailRecord = ref(null)
let loadedFormId = 0

const ready = computed(() => relateSubformReady(props.field))
const pageSize = computed(() => Number(props.field.pageSize) || 10)

const columns = computed(() => {
  const keys = Array.isArray(props.field.columnKeys) ? props.field.columnKeys : []
  return keys
    .map((key) => childFields.value.find((item) => item.key === key))
    .filter(Boolean)
    .map((item) => ({ key: item.key, title: item.title || item.key, field: item }))
})

function formatColumn(col, row) {
  return formatCellValue(
    col.field,
    row?.data?.[col.key],
    dictItemsByCode.value,
    userNames.value,
    deptNames.value,
  )
}

async function loadChildForm() {
  const formId = Number(props.field.childFormId)
  if (loadedFormId === formId && childFields.value.length) return
  try {
    const detail = await getFormApi(props.appId, formId)
    childFields.value = (detail?.fields || []).filter(isFillable)
    loadedFormId = formId
  } catch {
    childFields.value = []
    loadedFormId = 0
    return
  }
  const codes = sourceDictCodes(childFields.value)
  if (codes.length) {
    try {
      const items = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
      dictItemsByCode.value = Object.fromEntries(
        items.map((item) => [item.code, item.items || []]),
      )
    } catch {
      dictItemsByCode.value = {}
    }
  }
  if (childFields.value.some(isDeptField)) {
    try {
      deptNames.value = flattenDeptNames(await listOrgDepartmentsApi())
    } catch {
      deptNames.value = {}
    }
  }
}

async function loadRows() {
  if (!ready.value || !props.recordId || !props.appId) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  loadError.value = false
  try {
    await loadChildForm()
    const result = await queryFormRecordsApi(
      props.appId,
      Number(props.field.childFormId),
      relateSubformQuery(props.field, props.recordId, page.value),
    )
    rows.value = result?.items || []
    total.value = result?.total || 0
    userNames.value = result?.userNames || {}
  } catch {
    rows.value = []
    total.value = 0
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function reload() {
  loadRows()
}

function onPageChange(next) {
  page.value = next
  loadRows()
}

function onRowClick(row) {
  if (!row?.id) return
  detailRecord.value = row
  detailVisible.value = true
}

watch(
  () => [props.appId, props.recordId, props.field.childFormId, props.field.childRelateKey],
  () => {
    page.value = 1
    loadRows()
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.relate-subform-runtime {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.relate-subform-tip {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 32px;
}

.relate-subform-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
```

- [ ] **Step 2: `FormFillField.vue` 加渲染分支**

import 补 `import FormRelateSubform from './FormRelateSubform.vue'`，在 `FormSubform` 分支之后加：

```vue
    <FormRelateSubform
      v-else-if="field.type === 'relate-subform'"
      class="fill-full"
      :field="field"
      :app-id="appId"
      :record-id="recordId"
    />
```

`recordId` 这个 prop 在关联数据计划的 Task 4 里已经加过；若那份计划还没执行，先把 `recordId: { type: String, default: '' }` 加到 `FormFillField.vue` 和 `FormFillGrid.vue` 的 props，并在 `FormRecordDetailDrawer.vue` 传 `:record-id="record?.id || ''"`。

- [ ] **Step 3: 手工验收详情**

1. 工厂表「添加数据」：关联子表单区域只有一行「保存后可在数据详情里查看关联数据」，浏览器网络面板里没有对人员表的查询。
2. 保存后在数据管理点开这条工厂的详情：表格列出「所属工厂 = 这条工厂」的人员，列就是配置的那几列，条数对得上。
3. 造 12 条人员、每页条数设 10：第 1 页 10 条，第 2 页 2 条。
4. 点表格里某一行：打开该人员的只读详情（底部没有「编辑」）；关掉后仍停在第 2 页。
5. 工厂详情点「编辑」：这块表格仍只读，没有新增 / 删除按钮；保存工厂后人员数据没变。
6. 把某人员的「所属工厂」改到二号厂：一号厂详情少一条，二号厂详情多一条。
7. 关联子表单放在标签页第二个页签时，切过去能看到表格并能翻页。

---

### Task 5: 全流程验收与文档收尾

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: 按规格第 8 节验 8–14 条**

重点：8 候选表（把人员表「所属工厂」的数据源改成别的表后，重新拖时这条候选消失）、9 新增看不到详情才看到、10 翻页与点开、11 详情编辑态只读、12 换了归属就换了位置、13 不能进子表单、14 标签页里也能用。

- [ ] **Step 2: 确认不该出现的地方都没出现**

1. 工厂表数据管理列表**没有**关联子表单这一列；「列设置」里也找不到它。
2. 「下载导入模版」里没有这一列。
3. 工厂表保存后，用数据详情看不出多存了字段（后端 `data` 里没有该 key）。
4. 关联子表单设成必填是不可能的（属性面板没这个开关），保存工厂数据不会因为它被拦。

- [ ] **Step 3: 更新待办**

`docs/TODO.md` 的 P1 两条：关联数据、关联子表单做完后从 P1 移除或勾掉，并把 P2「关联数据：主表详情自动生成关联标签页」保留为不做。**不要**动使用者写的其它条目。

- [ ] **Step 4: 补测试用例文档**

按项目规则，同一轮里要更新 `docs/testcases/`：

1. 新建专项 `docs/testcases/2026-09-04-relate-test-cases.md`，覆盖关联数据（设计、填报、刷新跟进、已删除、关联本表、列表列、跳源数据）和关联子表单（候选表、新增 vs 详情、翻页、点开只读、编辑态只读、换归属）。
2. `docs/testcases/2026-08-31-complex-form-manual-tests.md` 补两个控件与标签页 `tabs`、子表单 `subform`、选择数据 `data`、数据联动、流水号 `serialNumber` 的互动用例。
3. `docs/testcases/README.md` 更新目录表、调色板中文名与 `type` 对照（关联数据 `relate`、关联子表单 `relate-subform`）、执行顺序、开始前准备；并把这两个控件从「不要当功能测」名单里移出。

- [ ] **Step 5: 跑一遍全部测试并检查编码**

```bash
node --test front/src/components/form-design/relateSubform.spec.js front/src/components/form-design/relateField.spec.js front/src/components/form-fill/fillValues.spec.js front/src/components/form-workspace/relateTitles.spec.js
npm test --prefix server
git diff --stat
```

Expected: 全绿；改过的文件里中文正常，没有 `鏍囩`、`å¤æ` 这类乱码。

---

## Spec coverage

| 规格（第 5 节） | 任务 |
|---|---|
| 候选表 = 有关联数据且指向当前表单 | 1、2、3 |
| 拖入弹框只支持「从已有关联表选择」，无候选时给提示 | 3 |
| 同一「表单 + 关联字段」只能加一个 | 2、3 |
| 属性面板：关联表单只读、显示的列、每页条数、隐藏必填等 | 3 |
| 默认勾前 5 个可展示字段 | 2、3 |
| 画布空表格占位、不发查询 | 3 |
| 新增时只给提示、不查询、不入库、不校验 | 2、4 |
| 详情表格：列、分页、默认更新时间倒序、空态、加载失败重试 | 4 |
| 点行打开子表数据只读详情 | 4 |
| 编辑态仍只读 | 4（`FormRelateSubform` 不接 `disabled`，本来就没有编辑入口） |
| 标签页里可用 | 3、4 |
| 不进列表列 / 导入模版 / 导出 | 2、5 |
| 不能进子表单、不能嵌套 | 3（`SUBFORM_CHILD_TYPES` 未含该类型） |

无 TBD。命名一致性检查：`relateSubform.js` 的 `relateSubformReady` / `relateSubformQuery` / `hasRelateSubformField` / `defaultRelateSubformColumns` 在 Task 3、4 中同名同参使用；字段键 `childFormId` / `childRelateKey` / `columnKeys` / `pageSize` 在纯函数、面板、运行时组件三处拼写一致；`sourceDictCodes` 在 `dataSelect.js` 定义、`FormDataSelect.vue` 与 `FormRelateSubform.vue` 共用。
