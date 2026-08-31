# 流水号生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 做成主表「流水号生成」字段：一张表一个；属性里配置分隔符和规则段；新增保存时由后端按规则生成字符串写入；填报只读；编辑不改号。

**Architecture:** 规则存在字段 JSON（`serialSeparator` + `serialRule[]`）。创建记录时 `coerce` 丢掉客户端该 key，校验其它字段后再生成。有 `counter` 段才用 MySQL `form_serial_seq` 行锁占号。前端不提交该字段，只在回显/列表展示。

**Tech Stack:** Vue 3、Element Plus、NestJS、TypeORM MySQL、Mongo 记录库、前端 `node:test`、后端 Jest。日期用 `Intl` + `Asia/Shanghai`，不给 server 加 dayjs。

**Spec:** `docs/superpowers/specs/2026-08-31-serial-number-design.md`

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 容器不加 `gap`。
- 图标必须从 `@element-plus/icons-vue` 确认导出后再 import。拖动手柄用已有 `Rank`，删除用已有 `Delete`。
- 不删不改使用者已有注释和 `console.log`。
- 不勾 `front/README.md`。
- 不自动 git commit。
- 不新增 npm 依赖。
- 本期不提供必填 / 禁用 / 可修改，不手改已生成的号（规格「记录点」）。
- 自动计数 0 段或 1 段；没有计数也能存表单、也能新增。
- `flattenFields` 只展开标签页，不展开 `subform.fields`。字段引用只认摊平后的 `input` / `number`。
- 不实现子表单流水号、跨表共享计数器、秒级时间戳、预览下一个真号。

## File Structure

```text
front/src/components/form-design/serialField.js              # 新建：默认规则、一表一个、段工厂、引用字段
front/src/components/form-design/serialField.spec.js         # 新建
front/src/components/form-design/fieldTypes.js               # 移出「未完成」；占位改文案
front/src/components/FormDesignPanel.vue                     # 拖入默认值；第二份拦截
front/src/components/form-design/FormDesignProps.vue         # 分隔符 + 规则段
front/src/components/form-design/FormDesignCanvasField.vue   # 画布只读输入
front/src/components/form-fill/fillValues.js                 # 不提交；回显要带上
front/src/components/form-fill/fillValues.spec.js
front/src/components/form-fill/FormFillField.vue             # 填报只读
front/src/components/form-design/FormFieldSourcePicker.vue   # 他表可选流水号（不排除）
docs/superpowers/specs/2026-08-27-data-linkage-design.md     # 流水号不当联动目标
server/src/application/form-record/serial-number.ts          # 新建：规则校验、拼接、周期桶
server/src/application/form-record/serial-number.spec.ts     # 新建
server/sql/2026-08-31-form-serial-seq.sql                    # 新建
server/src/application/form-record/form-serial-seq.entity.ts # 新建
server/src/application/form-record/form-serial-seq.service.ts# 新建：占号
server/src/application/application.module.ts                 # 注册 entity / service
server/src/application/form-record/form-record.types.ts      # serialRule 类型
server/src/application/form-record/form-record.coerce.ts     # 创建丢客户端值；更新忽略
server/src/application/form-record/form-record.coerce.spec.ts
server/src/application/form-record/form-record.service.ts    # create/import 生成
server/src/application/form-record/form-record.service.spec.ts
server/src/application/form-record/form-record.import.ts     # IMPORT_SKIP
server/src/application/form-record/form-record.indexes.ts    # FILTERABLE
server/src/application/form-record/form-record.indexes.spec.ts
server/src/application/form-record/form-record.query.ts      # 字符串包含
server/src/application/application.service.ts                # 保存 schema 校验；OPTION_FIELD_TYPES
server/src/application/application.service.spec.ts
```

职责：`serialField.js` 只服务设计器（默认值、拦截、面板）。真正拼号只在服务端 `serial-number.ts`，前端不要复制一套生成逻辑。

---

### Task 1: 设计器纯函数

**Files:**
- Create: `front/src/components/form-design/serialField.js`
- Test: `front/src/components/form-design/serialField.spec.js`

**Interfaces:**
- Produces: `DEFAULT_SERIAL_SEPARATOR`（`'-'`）、`SERIAL_DATETIME_OPTIONS`、`SERIAL_RESET_PERIODS`、`isSerialField`、`hasSerialNumberField`、`countSerialCounters`、`canAddSerialCounter`、`createDefaultSerialField`、`newSerialSegment`、`serialRefFields`、`serialSeparatorOf`、`reorderSerialRule`、`serialSegmentSummary`

- [ ] **Step 1: 写失败测试**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_SERIAL_SEPARATOR,
  canAddSerialCounter,
  countSerialCounters,
  createDefaultSerialField,
  hasSerialNumberField,
  isSerialField,
  newSerialSegment,
  serialRefFields,
  serialSeparatorOf,
  reorderSerialRule,
} from './serialField.js'

test('default field is date plus one counter', () => {
  const field = createDefaultSerialField('sn1')
  assert.equal(field.type, 'serialNumber')
  assert.equal(field.placeholder, '保存后自动生成')
  assert.equal(field.serialSeparator, DEFAULT_SERIAL_SEPARATOR)
  assert.equal(field.serialRule.length, 2)
  assert.equal(field.serialRule[0].kind, 'datetime')
  assert.equal(field.serialRule[0].format, 'YYYYMMDD')
  assert.equal(field.serialRule[1].kind, 'counter')
  assert.equal(field.serialRule[1].start, 1)
  assert.equal(field.serialRule[1].digits, 5)
  assert.equal(field.serialRule[1].reset, false)
})

test('hasSerialNumberField sees tabs inner field', () => {
  assert.equal(hasSerialNumberField([{ type: 'input', key: 'a' }]), false)
  assert.equal(
    hasSerialNumberField([
      {
        type: 'tabs',
        key: 't',
        panes: [{ id: 'p1', fields: [createDefaultSerialField('sn1')] }],
      },
    ]),
    true,
  )
})

test('counter at most one', () => {
  const field = createDefaultSerialField('sn1')
  assert.equal(canAddSerialCounter(field.serialRule), false)
  assert.equal(countSerialCounters([{ kind: 'fixed', text: 'A' }]), 0)
  assert.equal(canAddSerialCounter([{ kind: 'fixed', text: 'A' }]), true)
})

test('serialRefFields only input and number on flattened main form', () => {
  const fields = [
    { key: 'name', type: 'input', title: '姓名' },
    { key: 'age', type: 'number', title: '年龄' },
    { key: 'when', type: 'date', title: '日期' },
    createDefaultSerialField('sn1'),
    {
      type: 'tabs',
      key: 't',
      panes: [{ id: 'p1', fields: [{ key: 'code', type: 'input', title: '编号' }] }],
    },
  ]
  const refs = serialRefFields(fields, 'sn1')
  assert.deepEqual(
    refs.map((item) => item.key),
    ['name', 'age', 'code'],
  )
})

test('separator trims; empty means none', () => {
  assert.equal(serialSeparatorOf({ serialSeparator: ' - ' }), '-')
  assert.equal(serialSeparatorOf({ serialSeparator: '   ' }), '')
  assert.equal(serialSeparatorOf({}), DEFAULT_SERIAL_SEPARATOR)
})

test('reorderSerialRule moves by id', () => {
  const rule = [
    { id: 'a', kind: 'fixed', text: 'A' },
    { id: 'b', kind: 'fixed', text: 'B' },
  ]
  reorderSerialRule(rule, 'b', 'a')
  assert.equal(rule[0].id, 'b')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test front/src/components/form-design/serialField.spec.js
```

Expected: 模块不存在而失败。

- [ ] **Step 3: 实现 `serialField.js`**

复用 `flattenFields`（`./tabsField.js`）。要点：

- `createDefaultSerialField(key)` 带 `component: 'SerialNumber'`、`width` 由调用方再设也行，默认 `'1'`。
- `newSerialSegment(kind)`：`fixed` 的 `text` 为 `''`；`datetime` 的 `format` 为 `YYYYMMDD`；`counter` 为 `{ start: 1, digits: 5, reset: false }`；`field` 的 `fieldKey` 为 `''`。`id` 用 `crypto.randomUUID()`。
- `SERIAL_DATETIME_OPTIONS` 五项：`YYYY` / `YYYYMM` / `YYYYMMDD` / `YYYYMMDDHHmmss` / `epochMs`，文案用规格里的示例。
- `SERIAL_RESET_PERIODS`：`day` 天、`week` 周、`month` 月、`quarter` 季度、`year` 年。
- `serialSeparatorOf`：缺省 `'-'`；有值则 `String(...).trim()`，最长 8（截断）。
- `hasSerialNumberField(fields)`：`flattenFields(fields).some(isSerialField)`。
- `serialRefFields(fields, serialKey)`：摊平后 `input`/`number`，排除 `serialKey`。
- `reorderSerialRule`：对齐 `reorderPanes`，按 `id` splice。
- `serialSegmentSummary(seg, fields)`：给面板用。固定显示 `text` 或「固定字符」；日期显示选项 label；计数显示 `起始 n / n 位 / 不重置|按天重置`；字段显示标题，找不到则「字段已删除」。

- [ ] **Step 4: 再跑测试确认通过**

```bash
node --test front/src/components/form-design/serialField.spec.js
```

Expected: 全部 pass。写完打开文件确认中文不是乱码。

---

### Task 2: 设计器投放和属性面板

**Files:**
- Modify: `front/src/components/form-design/fieldTypes.js`
- Modify: `front/src/components/FormDesignPanel.vue`
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`

**Interfaces:**
- Consumes: Task 1 的 `createDefaultSerialField`、`hasSerialNumberField`、`canAddSerialCounter`、`newSerialSegment`、`serialRefFields`、`SERIAL_DATETIME_OPTIONS`、`SERIAL_RESET_PERIODS`、`reorderSerialRule`、`serialSegmentSummary`
- Produces: 画布上能拖入一个流水号；属性可改分隔符和规则段

- [ ] **Step 1: 调色板移出未完成，占位改成「保存后自动生成」**

`fieldTypes.js` 把 `serialNumber` 挪到 `file` 后面、`// -----------以下未完成------` 之前。`placeholder` 改为 `'保存后自动生成'`。图标继续 `CollectionTag`，不要改名。

- [ ] **Step 2: `addField` 拦截第二份，写入默认规则**

在 `FormDesignPanel.vue` 的 `addField` 里，`tabs` 分支之后：

```js
if (item.type === 'serialNumber') {
  if (hasSerialNumberField(fields.value)) {
    ElMessage.warning('每个表单只能有一个流水号')
    return
  }
}
```

创建普通 `field` 对象之后，若 `item.type === 'serialNumber'`，用 `createDefaultSerialField(field.key)` 的 `serialSeparator` / `serialRule` / `placeholder` 赋上去（保留调用方已经写好的 `key`、`width`、`title`）。不要写 `required`/`disabled`/`editable` 开关要用的特殊值也行，后面面板根本不展示它们。

- [ ] **Step 3: 属性面板**

`FormDesignProps.vue`：

1. 增加 `isSerialField`：`props.field?.type === 'serialNumber'`。
2. 「校验设置」那整块（必填 / 禁用 / 可修改 / 不允许重复值等）加 `v-if="!isSerialField"`。占位、说明、宽度仍显示。
3. 在宽度之前（或说明之后）加流水号配置，仅 `isSerialField` 时渲染。不要用 `el-space`。flex 竖排。

结构：

```vue
<template v-if="isSerialField">
  <el-form-item label="分隔符">
    <el-input
      :model-value="field.serialSeparator"
      maxlength="8"
      placeholder="各段之间的连接符，留空则直接相连"
      @input="onSerialSeparatorInput"
    />
  </el-form-item>
  <div class="serial-rule-list">
    <div
      v-for="seg in field.serialRule"
      :key="seg.id"
      class="serial-rule-row"
      draggable="true"
      @dragstart="onSerialDragStart(seg, $event)"
      @dragover="onSerialDragOver"
      @drop="onSerialDrop(seg, $event)"
      @dragend="onSerialDragEnd"
    >
      <span class="serial-rule-handle"><el-icon><Rank /></el-icon></span>
      <button type="button" class="serial-rule-summary" @click="onSelectSerialSeg(seg)">
        {{ serialSegmentSummary(seg, fields) }}
      </button>
      <el-button type="danger" link :icon="Delete" @click="onRemoveSerialSeg(seg)" />
    </div>
    <div class="serial-rule-add">
      <el-button @click="onAddSerialSeg('fixed')">固定字符</el-button>
      <el-button @click="onAddSerialSeg('datetime')">日期时间</el-button>
      <el-button :disabled="!canAddSerialCounter(field.serialRule)" @click="onAddSerialSeg('counter')">
        自动计数
      </el-button>
      <el-button @click="onAddSerialSeg('field')">表单字段</el-button>
    </div>
  </div>
  <!-- 当前段配置：按 activeSerialSegId 找段 -->
</template>
```

当前段配置：

- `fixed`：`el-input` maxlength 32，禁止换行（`@keydown.enter.prevent` 空函数即可）。
- `datetime`：`el-select` 绑 `SERIAL_DATETIME_OPTIONS`。
- `counter`：起始值 `el-input-number` min 0 precision 0；位数 min 1 max 12；是否重置 switch；`reset === true` 时再出周期下拉。
- `field`：`el-select` 选项来自 `serialRefFields(fields, field.key)`。`fieldKey` 已不在列表里时仍显示该值，并在摘要旁用红色说明「字段已删除」。

`serial-rule-add` **不要**设 `gap`（相邻 `el-button` 已有间距）。`onAddSerialSeg` 里若 `kind === 'counter' && !canAddSerialCounter` 直接 return。

拖排序对齐 pane：`onSerialDragStart` 记下 `id`，`drop` 时 `reorderSerialRule(field.serialRule, fromId, toId)`。

- [ ] **Step 4: 画布只读**

`FormDesignCanvasField.vue` 在 `currentUser` 分支旁加：

```vue
<el-input
  v-else-if="field.type === 'serialNumber'"
  disabled
  class="canvas-item"
  :placeholder="field.placeholder"
/>
```

不要出现联动图标（流水号没有 `optionSource`）。

- [ ] **Step 5: 手工点设计器**

打开表单设计：能拖一个流水号；再拖提示「每个表单只能有一个流水号」。属性里能删掉计数段、改分隔符为空。中文文案正常。

---

### Task 3: 填报不提交、列表只读展示

**Files:**
- Modify: `front/src/components/form-fill/fillValues.js`
- Modify: `front/src/components/form-fill/fillValues.spec.js`
- Modify: `front/src/components/form-fill/FormFillField.vue`

**Interfaces:**
- Produces: 新增 payload 不含流水号；编辑回显有值；不可内联编辑

- [ ] **Step 1: 写失败测试（补进 `fillValues.spec.js`）**

```js
test('serialNumber is shown from record but omitted from create payload', () => {
  const field = { key: 'sn', type: 'serialNumber' }
  assert.equal(isFillable(field), false)
  assert.equal(isInlineEditable(field), false)
  const cloned = cloneRecordValues([field], { sn: '20260831-00001' })
  assert.equal(cloned.sn, '20260831-00001')
  const payload = buildRecordData([field], { sn: '20260831-00001' })
  assert.equal(payload.sn, undefined)
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test front/src/components/form-fill/fillValues.spec.js
```

Expected: `cloned.sn` 为 undefined（当前 `isFillable` 为 false 时 `cloneRecordValues` 直接 skip）。

- [ ] **Step 3: 改 `fillValues.js`**

- `SKIP_TYPES` 加入 `'serialNumber'`（这样 `isFillable` 为 false：不校验必填、不进普通提交循环）。
- `cloneRecordValues`：在 `!isFillable` 之前增加：

```js
if (field.type === 'serialNumber') {
  const value = data?.[field.key]
  next[field.key] = typeof value === 'string' ? value : undefined
  continue
}
```

- `buildRecordData` 继续只走 `persistsValue`；不要把 `serialNumber` 加进 `persistsValue`。这样创建/更新都不会带上该 key（后端更新也会丢掉，双保险）。
- `formatCellValue` 已有 `String(value)`，流水号字符串可直接显示，不必新分支。
- 不要把 `serialNumber` 加进 `INLINE_EDIT_TYPES`。

- [ ] **Step 4: `FormFillField.vue` 只读输入**

```vue
<el-input
  v-else-if="field.type === 'serialNumber'"
  :model-value="typeof modelValue === 'string' ? modelValue : ''"
  disabled
  class="fill-full"
  :placeholder="field.placeholder"
/>
```

不要 `@change` 写回。新增时 `modelValue` 为空，显示占位「保存后自动生成」。

- [ ] **Step 5: 再跑 fillValues 测试**

```bash
node --test front/src/components/form-fill/fillValues.spec.js
```

Expected: pass。

---

### Task 4: 服务端规则校验与拼接（无数据库）

**Files:**
- Create: `server/src/application/form-record/serial-number.ts`
- Test: `server/src/application/form-record/serial-number.spec.ts`

**Interfaces:**
- Produces:
  - `findSerialField(fields): FormField | null`
  - `assertSerialSchema(fields): void`（多于一个 / 规则空 / 两个 counter 抛 `BadRequestException`）
  - `periodKey(reset, resetPeriod, now: Date): string`
  - `formatSerialDate(format, now: Date): string`
  - `renderSerialValue(field, data, now, counterValue?: number): string`
  - `SERIAL_TZ = 'Asia/Shanghai'`

- [ ] **Step 1: 写失败测试**

`serial-number.spec.ts`。用固定时刻：`new Date('2026-08-31T08:22:05.123Z')`（上海 2026-08-31 16:22:05.123）。

```ts
describe('serial-number', () => {
  const now = new Date('2026-08-31T08:22:05.123Z');

  it('formats calendar parts in Asia/Shanghai', () => {
    expect(formatSerialDate('YYYY', now)).toBe('2026');
    expect(formatSerialDate('YYYYMM', now)).toBe('202608');
    expect(formatSerialDate('YYYYMMDD', now)).toBe('20260831');
    expect(formatSerialDate('YYYYMMDDHHmmss', now)).toBe('20260831162205');
    expect(formatSerialDate('epochMs', now)).toBe(String(now.getTime()));
  });

  it('builds period keys', () => {
    expect(periodKey(false, undefined, now)).toBe('all');
    expect(periodKey(true, 'day', now)).toBe('2026-08-31');
    expect(periodKey(true, 'week', now)).toBe('2026-W36');
    expect(periodKey(true, 'month', now)).toBe('2026-08');
    expect(periodKey(true, 'quarter', now)).toBe('2026-Q3');
    expect(periodKey(true, 'year', now)).toBe('2026');
  });

  it('joins non-empty parts with trimmed separator', () => {
    const field = {
      key: 'sn',
      type: 'serialNumber',
      serialSeparator: '-',
      serialRule: [
        { kind: 'fixed', text: 'PO' },
        { kind: 'datetime', format: 'YYYYMMDD' },
        { kind: 'counter', start: 1, digits: 5 },
        { kind: 'field', fieldKey: 'name' },
      ],
    };
    expect(renderSerialValue(field, { name: '张三' }, now, 1)).toBe(
      'PO-20260831-00001-张三',
    );
    expect(renderSerialValue(field, { name: '' }, now, 1)).toBe(
      'PO-20260831-00001',
    );
  });

  it('empty separator concatenates', () => {
    const field = {
      key: 'sn',
      type: 'serialNumber',
      serialSeparator: '   ',
      serialRule: [
        { kind: 'datetime', format: 'YYYYMMDD' },
        { kind: 'counter', digits: 5 },
      ],
    };
    expect(renderSerialValue(field, {}, now, 1)).toBe('2026083100001');
  });

  it('counter overflow keeps full digits', () => {
    const field = {
      key: 'sn',
      type: 'serialNumber',
      serialSeparator: '',
      serialRule: [{ kind: 'counter', digits: 5 }],
    };
    expect(renderSerialValue(field, {}, now, 100000)).toBe('100000');
  });

  it('rejects two serial fields or two counters', () => {
    expect(() =>
      assertSerialSchema([
        { key: 'a', type: 'serialNumber', serialRule: [{ kind: 'datetime', format: 'YYYY' }] },
        { key: 'b', type: 'serialNumber', serialRule: [{ kind: 'datetime', format: 'YYYY' }] },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      assertSerialSchema([
        {
          key: 'a',
          type: 'serialNumber',
          serialRule: [
            { kind: 'counter', start: 1, digits: 5 },
            { kind: 'counter', start: 1, digits: 5 },
          ],
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('allows zero counters when there is another segment', () => {
    expect(() =>
      assertSerialSchema([
        {
          key: 'a',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'epochMs' }],
        },
      ]),
    ).not.toThrow();
  });
});
```

`epochMs` 的期望必须是 `String(now.getTime())`，不要手写毫秒数字。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test --prefix server -- serial-number.spec
```

Expected: 找不到模块。

- [ ] **Step 3: 实现 `serial-number.ts`**

- 用 `flattenFields` 找 `type === 'serialNumber'`。
- `assertSerialSchema`：0 个流水号字段直接 return；多于 1 个 → `每个表单只能有一个流水号`；`serialRule` 不是非空数组 → `请配置流水号规则`；`kind === 'counter'` 多于 1 → `流水号规则只能有一段自动计数`。
- 日历格式：`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year/month/day/hour/minute/second, hourCycle: 'h23' })` 的 `formatToParts`，拼 `YYYY` 等。不要用 `unix` 秒。
- ISO 周：先得到上海日历的年月日，再按 ISO 算法（周四所在年、周一起算）得到 `YYYY-Www`。`2026-08-31` 必须是 `2026-W36`。
- `renderSerialValue`：按规格第 7 节从左到右；空段 skip；`sep = trim(serialSeparator)`；`parts.join(sep)`。`field` 段：文本空 skip；数字用普通十进制字符串（`0` → `'0'`）。`counter` 段：`String(counterValue).padStart(digits, '0')`，`padStart` 不截断超长数字。没有 counter 时第三个参数可省略。
- `findSerialField` 找不到返回 `null`。

- [ ] **Step 4: 再跑测试确认通过**

```bash
npm test --prefix server -- serial-number.spec
```

Expected: pass。打开文件确认中文异常文案正常。

---

### Task 5: MySQL 计数表与占号

**Files:**
- Create: `server/sql/2026-08-31-form-serial-seq.sql`
- Create: `server/src/application/form-record/form-serial-seq.entity.ts`
- Create: `server/src/application/form-record/form-serial-seq.service.ts`
- Create: `server/src/application/form-record/form-serial-seq.service.spec.ts`
- Modify: `server/src/application/application.module.ts`

**Interfaces:**
- Produces: `FormSerialSeqService.takeNext(formId, fieldKey, periodKey, start): Promise<number>`
- 表：`form_serial_seq(formId, fieldKey, periodKey, nextValue)`，唯一 `(formId, fieldKey, periodKey)`，`formId` 外键 `app_form.id` ON DELETE CASCADE

- [ ] **Step 1: SQL**

```sql
CREATE TABLE IF NOT EXISTS `form_serial_seq` (
  `id` int NOT NULL AUTO_INCREMENT,
  `formId` int NOT NULL,
  `fieldKey` varchar(64) NOT NULL,
  `periodKey` varchar(32) NOT NULL,
  `nextValue` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_serial_seq_bucket` (`formId`, `fieldKey`, `periodKey`),
  CONSTRAINT `FK_form_serial_seq_formId` FOREIGN KEY (`formId`) REFERENCES `app_form` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`synchronize` 仍为 false，实现者要在本地 MySQL 执行该脚本。计划里写明，不要假定会自动建表。

- [ ] **Step 2: entity** 对齐 `app-form-config.entity.ts` 风格，表名 `form_serial_seq`。

- [ ] **Step 3: 占号服务测试（mock EntityManager）**

`takeNext` 语义：

1. 事务里 `SELECT ... FOR UPDATE`（TypeORM `pessimistic_write`）。
2. 没有行：插入 `nextValue = start + 1`，返回 `start`。若唯一冲突则再锁读一次走步骤 3。
3. 有行：`issued = Math.max(row.nextValue, start)`，写回 `nextValue = issued + 1`，返回 `issued`。

测试用 mock：第一次 `findOne` 返回 null，`save` 成功 → 得到 `start`；第二次 `findOne` 返回 `{ nextValue: 2 }` 且 `start` 为 1 → 得到 2；`start` 改为 100 且 `nextValue` 为 5 → 得到 100。

- [ ] **Step 4: 实现并注册**

`application.module.ts` 的 `TypeOrmModule.forFeature` 加上 `FormSerialSeq`，`providers` 加上 `FormSerialSeqService`。`autoLoadEntities` 已开，entity 被 forFeature 即可。

- [ ] **Step 5: 跑测试**

```bash
npm test --prefix server -- form-serial-seq.service.spec
```

Expected: pass。

---

### Task 6: 创建生成、更新忽略、保存 schema 校验

**Files:**
- Modify: `server/src/application/form-record/form-record.types.ts`
- Modify: `server/src/application/form-record/form-record.coerce.ts`
- Modify: `server/src/application/form-record/form-record.coerce.spec.ts`
- Modify: `server/src/application/form-record/form-record.service.ts`
- Modify: `server/src/application/form-record/form-record.service.spec.ts`
- Modify: `server/src/application/application.service.ts`
- Modify: `server/src/application/application.service.spec.ts`

**Interfaces:**
- Consumes: `assertSerialSchema`、`findSerialField`、`renderSerialValue`、`periodKey`、`FormSerialSeqService.takeNext`
- Produces: 新增记录带流水号；更新不变；保存非法规则 400

- [ ] **Step 1: coerce 测试**

```ts
it('drops client serialNumber on coerce and keeps existing on merge', () => {
  const fields = [
    { key: 'name', type: 'input' },
    { key: 'sn', type: 'serialNumber' },
  ];
  expect(coerceRecordData(fields, { name: 'A', sn: 'hack' })).toEqual({
    name: 'A',
  });
  expect(
    mergeRecordData({ name: 'A', sn: '20260831-00001' }, { name: 'B', sn: 'hack' }, fields),
  ).toEqual({ name: 'B', sn: '20260831-00001' });
});
```

`coerceFieldValue`：`case 'serialNumber': return undefined;`（与 `currentUser` 一样，创建路径不收客户端值）。

`mergeRecordData`：在循环里若 `field.type === 'serialNumber'` 则 `continue`（连 `null` 也不删已有号）。

- [ ] **Step 2: `create` 在唯一校验之后生成**

`FormRecordService` 注入 `FormSerialSeqService`。`create`：

```ts
const coerced = coerceRecordData(fields, data);
await this.assertUniqueFields(formId, fields, coerced);
await this.applySerialNumber(formId, fields, coerced);
const inserted = await this.store.insert({ ... data: coerced });
```

`applySerialNumber`：

```ts
private async applySerialNumber(
  formId: number,
  fields: FormField[] | null,
  data: Record<string, unknown>,
) {
  const field = findSerialField(fields);
  if (!field?.key) return;
  const rule = Array.isArray(field.serialRule) ? field.serialRule : [];
  const counter = rule.find((item) => item.kind === 'counter');
  const now = new Date();
  let counterValue: number | undefined;
  if (counter) {
    const start = Number.isInteger(counter.start) ? Number(counter.start) : 1;
    const bucket = periodKey(Boolean(counter.reset), counter.resetPeriod, now);
    counterValue = await this.serialSeq.takeNext(
      formId,
      field.key,
      bucket,
      start < 0 ? 0 : start,
    );
  }
  data[field.key] = renderSerialValue(field, data, now, counterValue);
}
```

没有 counter 时不要调用 `takeNext`。

`form-record.service.spec.ts`：mock `takeNext` 返回 1，字段含默认规则，`create` 后 `store.insert` 的 `data.sn` 匹配拼接结果。再测无 counter 只有 `epochMs` 时不调用 `takeNext`。更新测试：`replaceData` 的 data 仍是旧流水号。

- [ ] **Step 3: `saveFields` 先 `assertSerialSchema`**

`application.service.ts` 的 `saveFields` 在 `serializeFormSchema` 之前：

```ts
assertSerialSchema(flattenFields(fields as FormField[]));
```

补测试：两个流水号字段 → 400。没有 counter 但有日期段 → 成功（mock repo.save）。

- [ ] **Step 4: 跑相关 Jest**

```bash
npm test --prefix server -- form-record.coerce.spec form-record.service.spec application.service.spec
```

Expected: pass。

---

### Task 7: 导入、筛选索引、联动边界

**Files:**
- Modify: `server/src/application/form-record/form-record.import.ts`
- Modify: `server/src/application/form-record/form-record.service.ts`（`importRows` 循环里每条 `applySerialNumber`）
- Modify: `server/src/application/form-record/form-record.indexes.ts`
- Modify: `server/src/application/form-record/form-record.indexes.spec.ts`
- Modify: `server/src/application/form-record/form-record.query.ts`（`STRING_CONTAINS_TYPES` 加 `serialNumber`）
- Modify: `server/src/application/application.service.ts`（`OPTION_FIELD_TYPES` 加 `serialNumber`）
- Modify: `docs/superpowers/specs/2026-08-27-data-linkage-design.md`
- Modify: `front/src/components/form-design/linkage.js`（**不要**把 `serialNumber` 加入 `LINKAGE_VALUE_TYPES`）

**Interfaces:**
- Produces: 导入跳过该列但每行生成号；列表可按字符串筛；他表字段树能选到已保存的流水号；当前表不能把流水号当联动目标或触发字段

- [ ] **Step 1: `IMPORT_SKIP_TYPES` 加入 `'serialNumber'`**

模板不含该列。`import` 在 `parseImportRows` 之后、`insertMany` 之前，对每条 `data` 调用 `applySerialNumber`（与 create 同一私有方法）。有计数时逐行 `takeNext`，不要批量同一号。

- [ ] **Step 2: `FILTERABLE_TYPES` 加入 `'serialNumber'`**

`indexes.spec.ts` 的样例加一个 `serialNumber` 字段，期望出现 `idx_data_*`。

- [ ] **Step 3: 查询**

`STRING_CONTAINS_TYPES` 加入 `'serialNumber'`，这样 `contains` 与单行文本相同。不要加进 `RANGE_TYPES`。

- [ ] **Step 4: 联动**

- `LINKAGE_VALUE_TYPES` **不加** `serialNumber`（当前表没有「取值来源」）。
- `isFillable` 已为 false，属性里的当前表触发字段下拉本来就没有它。
- `OPTION_FIELD_TYPES` **要加**，这样选他表字段时能读到已入库的流水号。
- `FormFieldSourcePicker.vue` 的排除列表（image/file/address）**不要**排除 `serialNumber`。
- 改 `2026-08-27-data-linkage-design.md` 表格那一行：流水号组件已做，但不当当前表联动目标/触发源；只作为他表已有字段可读。不要把「项目里没有对应组件」留着。

- [ ] **Step 5: 跑测试**

```bash
npm test --prefix server -- form-record.indexes.spec form-record.import
node --test front/src/components/form-fill/fillValues.spec.js front/src/components/form-design/serialField.spec.js
```

Expected: pass。

---

### Task 8: 手工验收（对照规格第 10 节）

实现者在本地执行 `server/sql/2026-08-31-form-serial-seq.sql`，起 `npm run dev`。

1. 拖入流水号；第二份提示失败。
2. 默认规则新增两条，号码形如 `20260831-00001`、`20260831-00002`。
3. 分隔符改空、改 `/` 后再新增，连接符对。
4. 删掉计数段，只留日期或毫秒时间戳，能保存表单、能新增。
5. 编辑其它字段，流水号不变；填报控件只读。
6. 重置=天：把系统日期理解成上海自然日；同一天序号连加（可用改计数表 `periodKey` 或等跨日，不要在代码里写测试后门）。
7. 规则引用本表单行文本：提交值出现在号码里；空文本不多分隔符。
8. 导入模板没有流水号列；导入后每行有号。
9. 列表能按流水号筛选（等于/包含）。
10. 不要做手改号。

并发（规格验收 10）：有计数时用两个几乎同时的 `create` 请求（或 Jest 里连续两次 `takeNext` 已在 Task 5 覆盖占号）。真并发可手工两个标签页同时保存，号码不得相同。

---

## Spec coverage

| 规格 | 任务 |
|---|---|
| 一表一个（设计器 + schema） | 2、6 |
| 分隔符默认 `-`，trim 空则相连 | 1、2、4 |
| 四类规则段、拖排序、计数至多一段 | 1、2、4 |
| 无计数可保存可新增 | 2、4、6 |
| 上海时区日历 + `YYYYMMDDHHmmss` + `epochMs` | 4 |
| 字段联动只读本表提交值 | 4、6 |
| 创建生成、更新忽略、不手改 | 3、6 |
| MySQL 占号、跳号不重号、改 start 取 max | 5 |
| 导入 skip 列仍生成 | 7 |
| 可筛选、不当联动目标 | 7 |
| 记录点手改 | 不实现 |

无 TBD。`epochMs` 测试用 `String(now.getTime())` 与实现一致。
