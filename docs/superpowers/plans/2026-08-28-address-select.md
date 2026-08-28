# 地址选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 在 `master` 上改，不开分支。未经使用者要求不 commit。

**Goal:** 做成主表「地址选择」字段：四种格式读本地省市区 JSON，支持必填/禁用/可修改、详细地址 256 字、数据联动、Excel 一列导入。

**Architecture:** 纯逻辑放 `addressField.js`（格式、空值、路径裁切、显示文案）。控件 `FormAddressSelect.vue` 按格式动态加载 `shared/region/` 下 JSON（Vite 别名 `@region`），用 `el-cascader`。入库对象 `{ ids, labels, detail? }`。联动复用 `linkageRuntime.js` 的 0/1/多条规则，写入前按目标格式裁切。导入在服务端用 `REGION_DIR` 读同一目录，把「名称路径 / 国标码」解析成该对象。

**Tech Stack:** Vue 3、Element Plus `el-cascader`、现有 `queryFormRecordsApi`、前端 `node:test`、后端 Jest。

**Spec:** `docs/superpowers/specs/2026-08-28-address-select-design.md`

## Global Constraints

- 开发在 `master`，不开分支、不建 worktree。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 不加 `gap`。
- 图标必须从 `@element-plus/icons-vue` 确认导出后再 import。地址用已有导出 `Location`。
- 日期时间继续用 dayjs / `timeValue.js`（本功能不用日期）。
- 不删不改使用者已有注释和 `console.log`。
- 不勾 `front/README.md`。
- 不自动 git commit。
- 不新增 npm 依赖。
- 不改 `shared/region/` 三份 JSON 的字段结构；不要在 front/server 再复制一份。

## File Structure

```text
front/src/components/form-fill/addressField.js              # 新建：格式、空值、裁切、文案
front/src/components/form-fill/addressField.spec.js         # 新建
front/src/components/form-fill/FormAddressSelect.vue        # 新建
front/src/components/form-design/fieldTypes.js              # 增加 address + Location
front/src/components/FormDesignPanel.vue                    # 拖入默认 addressFormat
front/src/components/form-design/FormDesignProps.vue        # 格式单选 + 数据源
front/src/components/form-design/FormDesignCanvasField.vue  # 画布占位
front/src/components/form-fill/FormFillField.vue            # 接控件
front/src/components/form-fill/fillValues.js                # 持久化、必填、显示
front/src/components/form-fill/fillValues.spec.js
front/src/components/form-design/linkage.js                 # LINKAGE_VALUE_TYPES 加 address
front/src/components/form-design/linkage.spec.js
front/src/components/form-fill/linkageRuntime.js            # 地址 0/1/多条 + 裁切
front/src/components/form-fill/linkageRuntime.spec.js
front/src/components/form-design/FormFieldSourcePicker.vue  # 排除 address
front/src/components/form-workspace/FormRecordCell.vue      # 地址列内联编辑
front/vite.config.js                                        # @region → shared/region（已就位）
shared/region/sheng.json                                     # 唯一出处（已就位）
shared/region/sheng-shi.json
shared/region/sheng-shi-qu.json
server/src/config/region-dir.ts                              # REGION_DIR，已就位
server/src/application/form-record/address-import.ts         # 新建：走树解析导入单元格
server/src/application/form-record/address-import.spec.ts
server/src/application/application.service.ts               # OPTION_FIELD_TYPES 加 address
server/src/application/form-record/form-record.coerce.ts
server/src/application/form-record/form-record.coerce.spec.ts
server/src/application/form-record/form-record.import.ts
server/src/application/form-record/form-record.import.spec.ts
server/src/application/form-record/form-record.service.ts    # 模版第 2 行示例 + 表头批注
server/src/application/form-record/form-record.types.ts      # 可选 addressFormat
```

职责：`addressField.js` 不发请求、不碰 Vue。`FormAddressSelect` 只负责选值和输入。联动查询仍在 `FormFillGrid`。

---

### Task 1: 地址字段纯函数

**Files:**
- Create: `front/src/components/form-fill/addressField.js`
- Test: `front/src/components/form-fill/addressField.spec.js`

**Interfaces:**
- Produces: `ADDRESS_FORMATS`、`DEFAULT_ADDRESS_FORMAT`、`ADDRESS_DETAIL_MAX_LENGTH`、`addressFormatOf`、`addressHasDetail`、`emptyAddress`、`isAddressEmpty`、`normalizeAddressValue`、`addressDisplay`、`adaptAddressToFormat`、`isAddressComplete`、`labelsOfPath`、`cascaderProps`

- [ ] **Step 1: 写失败测试**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ADDRESS_DETAIL_MAX_LENGTH,
  DEFAULT_ADDRESS_FORMAT,
  adaptAddressToFormat,
  addressDisplay,
  addressFormatOf,
  addressHasDetail,
  emptyAddress,
  isAddressComplete,
  isAddressEmpty,
  labelsOfPath,
  normalizeAddressValue,
} from './addressField.js'

const hebeiTree = [
  {
    id: '130000',
    fullname: '河北省',
    level: 1,
    districts: [
      {
        id: '130100',
        fullname: '石家庄市',
        level: 2,
        districts: [{ id: '130102', fullname: '长安区', level: 3 }],
      },
    ],
  },
]
const beijingTree = [
  {
    id: '110000',
    fullname: '北京市',
    level: 1,
    districts: [{ id: '110101', fullname: '东城区', level: 3 }],
  },
]
const beijingCityTree = [{ id: '110000', fullname: '北京市', level: 1 }]

test('defaults and empty', () => {
  assert.equal(DEFAULT_ADDRESS_FORMAT, 'province-city-district-detail')
  assert.equal(ADDRESS_DETAIL_MAX_LENGTH, 256)
  assert.equal(addressFormatOf({}), DEFAULT_ADDRESS_FORMAT)
  assert.equal(addressHasDetail({ addressFormat: 'province' }), false)
  assert.equal(addressHasDetail({}), true)
  assert.equal(isAddressEmpty(emptyAddress()), true)
  assert.equal(isAddressEmpty(undefined), true)
})

test('normalize keeps equal-length ids and labels, trims detail', () => {
  const value = normalizeAddressValue({
    ids: ['130000', '130100'],
    labels: ['河北省', '石家庄市'],
    detail: '  中山路  ',
  })
  assert.deepEqual(value, {
    ids: ['130000', '130100'],
    labels: ['河北省', '石家庄市'],
    detail: '中山路',
  })
  assert.equal(isAddressEmpty(value), false)
})

test('labelsOfPath walks fullname', () => {
  assert.deepEqual(labelsOfPath(hebeiTree, ['130000', '130100', '130102']), [
    '河北省',
    '石家庄市',
    '长安区',
  ])
})

test('display joins labels and detail', () => {
  assert.equal(
    addressDisplay({
      ids: ['130000', '130100'],
      labels: ['河北省', '石家庄市'],
      detail: '中山路 1 号',
    }),
    '河北省 / 石家庄市 中山路 1 号',
  )
})

test('complete: leaf required, detail required only for full format', () => {
  const district = {
    ids: ['130000', '130100', '130102'],
    labels: ['河北省', '石家庄市', '长安区'],
  }
  assert.equal(isAddressComplete(district, 'province-city-district', hebeiTree), true)
  assert.equal(
    isAddressComplete(district, 'province-city-district-detail', hebeiTree),
    false,
  )
  assert.equal(
    isAddressComplete(
      { ...district, detail: '中山路' },
      'province-city-district-detail',
      hebeiTree,
    ),
    true,
  )
  assert.equal(
    isAddressComplete(
      { ids: ['110000'], labels: ['北京市'] },
      'province-city',
      beijingCityTree,
    ),
    true,
  )
})

test('adapt drops extra levels and detail when target format is shallower', () => {
  const full = {
    ids: ['130000', '130100', '130102'],
    labels: ['河北省', '石家庄市', '长安区'],
    detail: '中山路',
  }
  assert.deepEqual(adaptAddressToFormat(full, 'province', hebeiTree), {
    ids: ['130000'],
    labels: ['河北省'],
  })
  assert.deepEqual(adaptAddressToFormat(full, 'province-city', hebeiTree), {
    ids: ['130000', '130100'],
    labels: ['河北省', '石家庄市'],
  })
  const beijingDistrict = {
    ids: ['110000', '110101'],
    labels: ['北京市', '东城区'],
    detail: '某街',
  }
  assert.deepEqual(
    adaptAddressToFormat(beijingDistrict, 'province-city', beijingCityTree),
    { ids: ['110000'], labels: ['北京市'] },
  )
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test front/src/components/form-fill/addressField.spec.js`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `addressField.js`**

要点：

- `ADDRESS_FORMATS`：`province`、`province-city`、`province-city-district`、`province-city-district-detail`
- `cascaderProps`：`{ value: 'id', label: 'fullname', children: 'districts' }`
- `normalizeAddressValue`：非对象当空；`ids`/`labels` 逐项转字符串并对齐到较短长度；`detail` 只在有非空 trim 时保留，超 256 截断
- `labelsOfPath`：按 `id` 在 `districts` 里往下找 `fullname`
- `adaptAddressToFormat(value, format, tree)`：沿树走 `ids`，遇到缺失节点或叶子就停；`province` 最多 1 级；不含 detail 的格式不要 `detail` 键
- `isAddressComplete`：规范化后 `ids` 非空，且路径在树中落到叶子；`addressHasDetail` 时 `detail` 非空

- [ ] **Step 4: 再跑测试，确认通过**

Run: `node --test front/src/components/form-fill/addressField.spec.js`  
Expected: PASS。

---

### Task 2: 填报控件

**Files:**
- Create: `front/src/components/form-fill/FormAddressSelect.vue`

**Interfaces:**
- Consumes: `addressFormatOf`、`addressHasDetail`、`ADDRESS_DETAIL_MAX_LENGTH`、`cascaderProps`、`emptyAddress`、`labelsOfPath`、`normalizeAddressValue`
- Produces: `v-model` 为规范化地址对象或 `undefined`

- [ ] **Step 1: 实现控件**

```vue
<template>
  <div class="address-select">
    <el-cascader
      class="address-cascader"
      :model-value="pathIds"
      :options="options"
      :props="cascaderProps"
      :placeholder="placeholder || '请选择'"
      :disabled="disabled"
      filterable
      clearable
      @change="onPathChange"
    />
    <el-input
      v-if="showDetail"
      v-model="detailDraft"
      class="address-detail"
      :disabled="disabled"
      :maxlength="ADDRESS_DETAIL_MAX_LENGTH"
      show-word-limit
      placeholder="请输入详细地址"
      @change="onDetailChange"
    />
  </div>
</template>
```

脚本：

- props：`modelValue`、`field`、`disabled`、`placeholder`
- emit：`update:modelValue`
- `showDetail = addressHasDetail(field)`
- 按 `addressFormatOf(field)` 动态 import 对应 JSON：`province` → `@region/sheng.json`，`province-city` → `@region/sheng-shi.json`，其余 → `@region/sheng-shi-qu.json`
- `pathIds` 来自 `normalizeAddressValue(modelValue).ids`（空则 `undefined` 以便清空）
- `onPathChange(ids)`：空则 emit `undefined`；否则 `{ ids, labels: labelsOfPath(options, ids) }`，若 `showDetail` 则带上当前 `detail`
- 清空路径时不要保留 `detail`
- 模板事件只绑函数名，不写行内 JS
- 样式：父级 `display:flex; flex-direction:column;`，详细地址 `margin-top: 8px`，级联 `width: 100%`

- [ ] **Step 2: 设计器里拖一个地址字段，打开添加数据，四种格式各能选出叶子；带详细地址的格式输入超过 256 被拦住**

---

### Task 3: 设计器接入

**Files:**
- Modify: `front/src/components/form-design/fieldTypes.js`
- Modify: `front/src/components/FormDesignPanel.vue`
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`
- Modify: `front/src/components/form-fill/FormFillField.vue`

- [ ] **Step 1: `fieldTypes.js` 在图片上方增加（`Location` 已从 `@element-plus/icons-vue` 导出）**

```js
import { Location } from '@element-plus/icons-vue'
{ type: 'address', label: '地址选择', icon: Location, component: 'FormAddressSelect', placeholder: '请选择' },
```

不要放进「以下未完成」那段。

- [ ] **Step 2: 拖入默认值**

`addField` 增加：

```js
...(item.type === 'address'
  ? { addressFormat: DEFAULT_ADDRESS_FORMAT, optionSource: 'custom' }
  : {}),
```

`LINKAGE_VALUE_TYPES` 加上 `address` 后，`optionSource: 'custom'` 会由现有 `includes(item.type)` 分支写入，不要写两份冲突的 `optionSource`。顺序：先 address 专有字段，联动类型分支保持只写 `optionSource`。

- [ ] **Step 3: 属性面板**

在校验设置里、紧挨必填，增加：

```vue
<div v-if="field.type === 'address'" class="required-row">
  <span>地址格式</span>
  <el-select v-model="field.addressFormat" class="address-format-select">
    <el-option
      v-for="item in ADDRESS_FORMAT_OPTIONS"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</div>
```

选项文案：省、省-市、省-市-区、省-市-区-详细地址。  
`ADDRESS_FORMAT_OPTIONS` 从 `addressField.js` 导出，避免面板和运行时各写一套。  
占位文字对地址保留（给级联用）。数据源用现有 `optionSourceChoices`（下一步把 `address` 加进联动类型后会出现）。

- [ ] **Step 4: 画布 / 填报**

`FormDesignCanvasField`：`FormAddressSelect`，`:field="field"` `disabled`（或 `preview` 不需要，直接 `disabled`）。  
`FormFillField`：同样接入，`:disabled="isDisabled"` `:placeholder="field.placeholder"` `v-model` 走现有 `modelValue`。

- [ ] **Step 5: 设计器切换四种格式，画布出现级联；仅最后一种多出详细地址框且禁用**

---

### Task 4: 入库、必填、列表文案

**Files:**
- Modify: `front/src/components/form-fill/fillValues.js`
- Test: `front/src/components/form-fill/fillValues.spec.js`
- Modify: `server/src/application/form-record/form-record.coerce.ts`
- Test: `server/src/application/form-record/form-record.coerce.spec.ts`
- Modify: `server/src/application/form-record/form-record.import.ts`

- [ ] **Step 1: 前端测试**

```js
test('address is fillable, persisted as object, empty omitted', () => {
  const field = { key: 'addr', type: 'address' }
  const value = {
    ids: ['110000'],
    labels: ['北京市'],
    detail: '某街',
  }
  assert.equal(isFillable(field), true)
  assert.deepEqual(buildRecordData([field], { addr: value }), { addr: value })
  assert.deepEqual(buildRecordData([field], { addr: { ids: [], labels: [] } }), {})
  assert.equal(validateRequired([{ ...field, required: true, title: '地址' }], {}), '请填写「地址」')
})
```

`isEmptyValue`：调用 `isAddressEmpty`。  
`emptyValue('address')`：`undefined`。  
`serializeValue`：空则 `undefined`，否则 `normalizeAddressValue` 且不含空 `detail`。  
`validateRequired`：用 `isAddressComplete` 需要树——**提交校验在 `FormFillGrid` / 保存前拿不到树会不准**。

必填判定：`isAddressEmpty` 不够（省-市-区只选了省）。在 `addressField.js` 增加 `isAddressValueReady(field, value)`：无树时，`province` 要求 `ids.length >= 1`；`province-city` 要求 `ids.length >= 1`（直辖市一级也算）；`province-city-district*` 要求 `ids.length >= 2`（北京也是省+区）。带 detail 时还要 `detail`。

这是无树时的近似，避免填报保存再动态 import JSON。河北只选省（1 级）在区县格式下 `ids.length === 1` 会拦。北京选到区是 2 级，通过。

`validateRequired` 对 `address` 走 `isAddressValueReady`。

- [ ] **Step 2: 实现 fillValues 变更并跑**

Run: `node --test front/src/components/form-fill/fillValues.spec.js`  
Expected: PASS。

- [ ] **Step 3: 后端 coerce**

```ts
case 'address': {
  if (isEmpty(value)) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid();
  }
  const row = value as { ids?: unknown; labels?: unknown; detail?: unknown };
  if (!Array.isArray(row.ids) || !Array.isArray(row.labels)) invalid();
  if (row.ids.length !== row.labels.length) invalid();
  if (!row.ids.every((item) => typeof item === 'string')) invalid();
  if (!row.labels.every((item) => typeof item === 'string')) invalid();
  if (row.ids.length === 0) return undefined;
  const next: { ids: string[]; labels: string[]; detail?: string } = {
    ids: row.ids,
    labels: row.labels,
  };
  if (typeof row.detail === 'string') {
    const detail = row.detail.trim().slice(0, 256);
    if (detail) next.detail = detail;
  } else if (row.detail != null) {
    invalid();
  }
  return next;
}
```

`IMPORT_SKIP_TYPES` **不要**加 `'address'`。导入解析放 Task 7。

- [ ] **Step 4: 跑** `npx jest src/application/form-record/form-record.coerce.spec.ts --no-coverage`  
Expected: PASS。补一条地址对象保留、非法类型抛错的用例。

- [ ] **Step 5: 列表展示 + 单元格内联编辑**

`formatCellValue` 对 address 调 `addressDisplay`。

`INLINE_EDIT_TYPES` 加入 `'address'`。`cloneCellValue` 对 address 做浅拷贝 `{ ids: [...], labels: [...], detail }`，避免改 draft 动到行数据。

`fillValues.spec.js` 增加：未禁用、未锁、非 linkage 的 address `isInlineEditable === true`；`optionSource === 'linkage'` 为 false。

`FormRecordCell` 编辑态渲染：

```vue
<FormAddressSelect
  v-else-if="field.type === 'address'"
  class="record-cell-control"
  :field="field"
  :model-value="draft"
  size="small"
  @update:model-value="onAddressDraft"
/>
```

`FormAddressSelect` 增加可选 `size`（传给 `el-cascader` / `el-input`）。`onAddressDraft` 更新 `draft`；若当前格式**不含**详细地址则立刻 `commit()`，含详细地址则等点格子外再 `commit()`（沿用 `onDocMouseDown`）。

`onDocMouseDown` 的 `closest` 补上 `.el-cascader__dropdown`（级联面板挂在 body 上）。`FormRecordList` 的行点击排除里若还没有 `.record-cell.is-editing`，保持已有排除，避免编地址时点开会详情。

单元格 `.is-editing` 时 `align-items: flex-start`，编辑区纵向排开，不被行高裁切。

---

### Task 5: 数据联动

**Files:**
- Modify: `front/src/components/form-design/linkage.js`
- Test: `front/src/components/form-design/linkage.spec.js`
- Modify: `front/src/components/form-fill/linkageRuntime.js`
- Test: `front/src/components/form-fill/linkageRuntime.spec.js`
- Modify: `front/src/components/form-design/FormFieldSourcePicker.vue`
- Modify: `server/src/application/application.service.ts`

- [ ] **Step 1: `LINKAGE_VALUE_TYPES` 加入 `'address'`。`sourceTypesFor` 已有 `return [fieldType]`，地址只对地址，不必特判。**

`optionSourceChoices('address')` 应为自定义、数据联动。  
`linkage.spec.js` 给 `address` 加一条 choices 断言。

- [ ] **Step 2: `hasCurrentValue` 对地址对象用 `isAddressEmpty`，避免 `{}` 被当成已填。**

- [ ] **Step 3: `applyLinkageResult` 在 image 分支之后、通用 count 之前：**

```js
if (field.type === 'address') {
  const count = recordCount(result)
  if (count <= 0) return emptyResult(field)
  if (count > 1) {
    return {
      value: emptyValue(field),
      items: [],
      message: linkageManyMessage(field),
    }
  }
  const raw = triggerValue(items[0], sourceKey)
  const tree = field.__addressTree
  const format = addressFormatOf(field)
  return {
    value: adaptAddressToFormat(raw, format, tree || []),
    items: [],
    message: '',
  }
}
```

不要把树挂到 field JSON 上。更好：`adaptAddressToFormat` 在无树时按格式切 `ids` 长度上限：`province` 1；`province-city` 2；区县类 3。直辖市多出来的第三级若源是北京省+区（2 级），目标省-市用上限 2 会变成 `[110000, 110101]`，而市树里没有东城区。

**必须用树裁切。** `FormFillGrid` 在跑地址联动前，按字段格式动态 import JSON，把 tree 传入 `applyLinkageResult` 第三参以外的方式：扩展为 `applyLinkageResult(field, result, currentValue, { addressTree })`。无 tree 时退回按 `ids` 前缀长度切（province=1，其余不切只丢掉 detail），测试里传入 fixture 树。

`linkageQueryPaging`：address 走默认 `{ page: 1, pageSize: 2 }`，不要 100。

- [ ] **Step 4: 测试**

```js
test('address linkage writes adapted object for one row and clears when many', () => {
  const field = {
    title: '收货地址',
    type: 'address',
    addressFormat: 'province',
    linkage: { sourceKey: 'addr' },
  }
  const tree = [{ id: '130000', fullname: '河北省', level: 1, districts: [] }]
  const one = applyLinkageResult(
    field,
    {
      total: 1,
      items: [
        {
          data: {
            addr: {
              ids: ['130000', '130100'],
              labels: ['河北省', '石家庄市'],
              detail: '中山路',
            },
          },
        },
      ],
    },
    undefined,
    { addressTree: tree },
  )
  assert.deepEqual(one.value, { ids: ['130000'], labels: ['河北省'] })
  const many = applyLinkageResult(
    field,
    { total: 2, items: [{ data: {} }, { data: {} }] },
    undefined,
    { addressTree: tree },
  )
  assert.equal(many.message.includes('多条数据'), true)
})
```

Run: `node --test front/src/components/form-design/linkage.spec.js front/src/components/form-fill/linkageRuntime.spec.js`  
Expected: PASS。

- [ ] **Step 5: `OPTION_FIELD_TYPES` 加 `'address'`。`FormFieldSourcePicker` 过滤改为 `field.type !== 'image' && field.type !== 'file' && field.type !== 'address'`（若 file 尚未排除，按现文件实际补上 address）。**

- [ ] **Step 6: 两张表联动：源存完整省市区+详细地址，目标格式为省，带出后只有省、没有详细地址。匹配多条时清空并提示。**

---

### Task 7: Excel 导入与模版示例

**Files:**
- Read: `shared/region/*.json`（已在仓库根，经 `REGION_DIR` 读取，不要再拷贝）
- Create: `server/src/application/form-record/address-import.ts`
- Test: `server/src/application/form-record/address-import.spec.ts`
- Modify: `server/src/application/form-record/form-record.import.ts`
- Test: `server/src/application/form-record/form-record.import.spec.ts`
- Modify: `server/src/application/form-record/form-record.service.ts`
- Modify: `server/src/application/form-record/form-record.types.ts`（`FormField` 增加可选 `addressFormat?: string`）

- [ ] **Step 1: 写失败测试**

`address-import.ts` 导出：`addressImportExample(field)`、`parseAddressImportCell(field, raw, tree)`（失败返回 `{ ok: false }`，成功 `{ ok: true, value }`，空或 `示例：` 前缀 `{ ok: true, value: undefined }`）。

按格式从 `join(REGION_DIR, 'sheng.json')` 等加载：`province` → `sheng.json`，`province-city` → `sheng-shi.json`，其余 → `sheng-shi-qu.json`。树在一次导入里按格式缓存，不要每行重新读文件。不要改 `nest-cli` 把 JSON 拷进 dist。

```ts
const hebeiQingdaoCity = /* 从 fixture 或真实 sheng-shi 取山东省/青岛市 */;

it('parses name path and national codes', () => {
  const field = { key: 'addr', type: 'address', addressFormat: 'province-city' };
  expect(parseAddressImportCell(field, '山东省 / 青岛市', cityTree)).toEqual({
    ok: true,
    value: { ids: ['370000', '370200'], labels: ['山东省', '青岛市'] },
  });
  expect(parseAddressImportCell(field, '370000/370200', cityTree)).toEqual({
    ok: true,
    value: { ids: ['370000', '370200'], labels: ['山东省', '青岛市'] },
  });
});

it('requires leaf and pipe for detail', () => {
  const district = { key: 'addr', type: 'address', addressFormat: 'province-city-district' };
  expect(parseAddressImportCell(district, '山东省 / 青岛市', quTree).ok).toBe(false);
  const detail = {
    key: 'addr',
    type: 'address',
    addressFormat: 'province-city-district-detail',
  };
  expect(parseAddressImportCell(detail, '山东省 / 青岛市 / 市南区', quTree).ok).toBe(false);
  expect(
    parseAddressImportCell(
      detail,
      '山东省 / 青岛市 / 市南区 | 香港中路 1 号',
      quTree,
    ).value,
  ).toEqual({
    ids: ['370000', '370200', '370202'],
    labels: ['山东省', '青岛市', '市南区'],
    detail: '香港中路 1 号',
  });
});

it('treats example prefix as empty', () => {
  const field = { key: 'addr', type: 'address', addressFormat: 'province' };
  expect(parseAddressImportCell(field, '示例：山东省', shengTree)).toEqual({
    ok: true,
    value: undefined,
  });
});
```

直辖市：`province-city` + `北京市` 成功；`province-city-district` + `北京市` 失败，+ `北京市 / 东城区` 成功。

- [ ] **Step 2: 实现走树解析并跑** `npx jest src/application/form-record/address-import.spec.ts --no-coverage`  
Expected: PASS。

要点：`／` 与 `/` 同等；段内 trim；数字段匹配 `id`，否则精确匹配 `fullname`；只在当前父节点 `districts` 里查找；`checkStrictly` 语义=必须叶子。

- [ ] **Step 3: `parseCell` 对 `address` 调 `parseAddressImportCell`，把对应树传入。`parseImportRows` 增加可选 `addressTrees`（按 format 的缓存），或在模块内按格式 `require` JSON。补 `form-record.import.spec.ts`：有效路径入库、未到叶子的行丢掉、示例前缀行因无有效值被跳过。**

- [ ] **Step 4: `buildImportTemplate`**

有地址列时：表头该单元格 `note` 写明「用 / 分段；详细地址用 | 分隔；可填名称或国标码」。第 2 行对应列写入 `addressImportExample(field)`（`示例：山东省 / 青岛市` 这种）。无地址列时仍只写表头。

- [ ] **Step 5: 下载带地址字段的模版，第 2 行是示例；改成真实「山东省 / 青岛市」能导入；留下示例行不会多出一条数据。**

---

### Task 8: 对照规格收尾

对照 `docs/superpowers/specs/2026-08-28-address-select-design.md` 第 7 节逐条点一遍。不勾 `front/README.md`。

- [ ] 四种格式、直辖市叶子、必填、禁用、不可修改、联动裁切、列表内联编辑、Excel 导入与模版示例、画布禁用均符合规格。

---

## Spec coverage

| 规格 | 任务 |
|---|---|
| 三份 JSON、四种格式 | 1、2、3 |
| 值 `{ ids, labels, detail }` | 1、4 |
| 直辖市叶子 | 1、2 |
| 详细地址 256 | 1、2 |
| 必填 / 禁用 / 可修改 | 4、2 |
| 入库 coerce、列表内联编辑 | 4 |
| Excel 一列导入、模版示例、`shared/region` 唯一出处 | 7 |
| 数据联动只对地址、0/1/多条、按目标格式裁切 | 5 |
| 验收 1–10 | 8 |
