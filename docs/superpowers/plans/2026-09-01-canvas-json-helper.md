# 画布 JSON 解读辅助 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 在 `master` 上改，不开分支。未经使用者要求不 commit。

**Goal:** 在应用工作台和表单设计页提供只读辅助：左侧贴画布 JSON，点转换后右侧得到同一份结构并带表名、字段名行末注释。

**Architecture:** 注解做成纯函数（解析、收集名字、带注释序列化）。Vue 浮层只负责入口、拉目录/源表、点转换时调用纯函数。挂在 `App.vue`，用路由名决定是否显示。不写回表单，不新增后端接口。

**Tech Stack:** Vue 3、Element Plus（`el-drawer` / `el-input` / `el-button`）、`@element-plus/icons-vue` 里已有的 `Document`、前端 `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-01-canvas-json-helper-design.md`

## Global Constraints

- 开发在 `master`，不开分支、不建 worktree。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 不加 `gap`；不用 `el-space` / `el-text`。
- 图标必须从 `@element-plus/icons-vue` 确认导出后再 import。本功能用已在项目出现的 `Document`。
- `el-drawer` 没有 `draggable`，不要改成 `el-dialog` 冒充抽屉。
- 不删不改使用者已有注释和 `console.log`。
- 不勾 `front/README.md`，不写 `docs/testcases/`。
- 不自动 git commit。
- 不新增 npm 依赖、不新增后端接口。
- 不缓存目录或源表；每次点转换都重新请求。
- 查不到名字写 `// 未查找到`，不算失败。
- 失败只提示、不改右栏：空内容、非法 JSON、目录/源表请求失败。

## File Structure

```text
front/src/components/canvas-json-helper/annotateCanvasJson.js      # 新建：解析、收集名字、带注释序列化
front/src/components/canvas-json-helper/annotateCanvasJson.spec.js # 新建
front/src/components/canvas-json-helper/CanvasJsonHelper.vue       # 新建：半圆按钮 + 抽屉
front/src/App.vue                                                  # 挂载 + SHOW_CANVAS_JSON_HELPER
```

职责：`annotateCanvasJson.js` 不碰 Vue、不发请求。组件只做路由判断、请求和展示。

---

### Task 1: 注解纯函数

**Files:**
- Create: `front/src/components/canvas-json-helper/annotateCanvasJson.js`
- Test: `front/src/components/canvas-json-helper/annotateCanvasJson.spec.js`

**Interfaces:**
- Produces:
  - `MISSING_NAME`：`'未查找到'`
  - `parseCanvasJson(text)`：去空白后 `JSON.parse`；空串抛 `Error('请粘贴画布 JSON')`；非法 JSON 抛 `Error('JSON 无法解析')`
  - `collectFieldTitles(value, map = new Map())`：递归走对象/数组，对象同时有非空字符串 `key` 和 `title` 则 `map.set(key, title)`，返回 `map`
  - `collectSourceFormIds(value, out = new Set())`：递归收集正整数 `sourceFormId`，返回 `Set<number>`
  - `formTitlesFromDirectory(directory)`：`Map<number, string>`。纳入 `directory.forms[]` 以及每个 `directory.groups[].forms[]` 的 `id` / `name`
  - `lookupFieldTitle(key, canvasTitles, sourceTitles)`：先画布 map，再源表 map，再系统列（`createdBy` / `updatedBy` / `createdAt` / `updatedAt` 以及 `__createdBy` / `__updatedBy` / `__createdAt` / `__updatedAt`），都没有则 `MISSING_NAME`
  - `lookupFormTitle(id, formTitles)`：查到非空名用该名，否则 `MISSING_NAME`
  - `annotateCanvasJson(value, canvasTitles, sourceTitles, formTitles)`：`JSON.stringify(..., null, 2)` 同形缩进，在下列行末追加 ` // 名称`
    - 表属性：`sourceFormId`（值为正整数时）
    - 字段属性：`key`、`sourceFieldKey`、`sourceKey`、`targetKey`、`fieldKey`（值为字符串时，空串也注释）
    - 字段 key 数组：`displayFieldKeys`、`pickerColumnKeys` 里的每一项字符串

- [ ] **Step 1: 写失败测试**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MISSING_NAME,
  annotateCanvasJson,
  collectFieldTitles,
  collectSourceFormIds,
  formTitlesFromDirectory,
  lookupFieldTitle,
  lookupFormTitle,
  parseCanvasJson,
} from './annotateCanvasJson.js'

test('parseCanvasJson rejects empty and invalid', () => {
  assert.throws(() => parseCanvasJson(''), { message: '请粘贴画布 JSON' })
  assert.throws(() => parseCanvasJson('   '), { message: '请粘贴画布 JSON' })
  assert.throws(() => parseCanvasJson('{'), { message: 'JSON 无法解析' })
})

test('parseCanvasJson accepts array or object', () => {
  assert.deepEqual(parseCanvasJson('[]'), [])
  assert.deepEqual(parseCanvasJson(' {"a":1} '), { a: 1 })
})

test('collect titles and source form ids from nested canvas', () => {
  const canvas = [
    {
      key: 'name',
      title: '姓名',
      type: 'input',
      sourceFormId: 12,
      sourceFieldKey: 'n1',
    },
    {
      type: 'tabs',
      panes: [{ fields: [{ key: 'city', title: '城市', type: 'input' }] }],
    },
    {
      type: 'subform',
      key: 'lines',
      title: '明细',
      fields: [{ key: 'qty', title: '数量', type: 'number' }],
      linkage: { sourceFormId: 9 },
    },
  ]
  const titles = collectFieldTitles(canvas)
  assert.equal(titles.get('name'), '姓名')
  assert.equal(titles.get('city'), '城市')
  assert.equal(titles.get('qty'), '数量')
  assert.deepEqual([...collectSourceFormIds(canvas)].sort((a, b) => a - b), [9, 12])
})

test('formTitlesFromDirectory walks groups and root forms', () => {
  const map = formTitlesFromDirectory({
    forms: [{ id: 11, name: '未分组' }],
    groups: [{ id: 1, name: '人事', forms: [{ id: 12, name: '客户表' }] }],
  })
  assert.equal(map.get(11), '未分组')
  assert.equal(map.get(12), '客户表')
})

test('lookup prefers canvas then source then system', () => {
  const canvas = new Map([['name', '姓名']])
  const source = new Map([['n1', '客户名称'], ['name', '他表姓名']])
  assert.equal(lookupFieldTitle('name', canvas, source), '姓名')
  assert.equal(lookupFieldTitle('n1', canvas, source), '客户名称')
  assert.equal(lookupFieldTitle('createdBy', canvas, source), '创建人')
  assert.equal(lookupFieldTitle('__createdAt', canvas, source), '创建时间')
  assert.equal(lookupFieldTitle('gone', canvas, source), MISSING_NAME)
  assert.equal(lookupFormTitle(12, new Map([[12, '客户表']])), '客户表')
  assert.equal(lookupFormTitle(99, new Map([[12, '客户表']])), MISSING_NAME)
})

test('annotateCanvasJson writes trailing comments', () => {
  const canvas = {
    key: 'name',
    title: '姓名',
    sourceFormId: 12,
    sourceFieldKey: 'n1',
    displayFieldKeys: ['city', 'gone'],
  }
  const canvasTitles = collectFieldTitles(canvas)
  const sourceTitles = new Map([['n1', '客户名称'], ['city', '城市']])
  const formTitles = new Map([[12, '客户表']])
  const text = annotateCanvasJson(canvas, canvasTitles, sourceTitles, formTitles)
  assert.match(text, /"key": "name", \/\/ 姓名/)
  assert.match(text, /"sourceFormId": 12, \/\/ 客户表/)
  assert.match(text, /"sourceFieldKey": "n1", \/\/ 客户名称/)
  assert.match(text, /"city", \/\/ 城市/)
  assert.match(text, /"gone" \/\/ 未查找到/)
})
```

- [ ] **Step 2: 跑测试确认失败**

在仓库根目录：

```bash
node --test front/src/components/canvas-json-helper/annotateCanvasJson.spec.js
```

Expected: FAIL，模块不存在或导出名未定义。

- [ ] **Step 3: 写最小实现**

`front/src/components/canvas-json-helper/annotateCanvasJson.js`：

```js
export const MISSING_NAME = '未查找到'

const FIELD_REF_KEYS = new Set([
  'key',
  'sourceFieldKey',
  'sourceKey',
  'targetKey',
  'fieldKey',
])
const FORM_REF_KEYS = new Set(['sourceFormId'])
const FIELD_REF_ARRAY_KEYS = new Set(['displayFieldKeys', 'pickerColumnKeys'])
const SYSTEM_FIELD_TITLES = {
  createdBy: '创建人',
  updatedBy: '更新人',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  __createdBy: '创建人',
  __updatedBy: '更新人',
  __createdAt: '创建时间',
  __updatedAt: '更新时间',
}

export function parseCanvasJson(text) {
  const raw = String(text ?? '').trim()
  if (!raw) {
    throw new Error('请粘贴画布 JSON')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('JSON 无法解析')
  }
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  visit(value)
  for (const child of Object.values(value)) walk(child, visit)
}

export function collectFieldTitles(value, map = new Map()) {
  walk(value, (obj) => {
    const key = obj.key
    const title = obj.title
    if (typeof key === 'string' && key && typeof title === 'string' && title) {
      map.set(key, title)
    }
  })
  return map
}

export function collectSourceFormIds(value, out = new Set()) {
  walk(value, (obj) => {
    const id = Number(obj.sourceFormId)
    if (Number.isInteger(id) && id > 0) out.add(id)
  })
  return out
}

export function formTitlesFromDirectory(directory) {
  const map = new Map()
  const add = (form) => {
    const id = Number(form?.id)
    if (Number.isInteger(id) && id > 0) {
      map.set(id, typeof form.name === 'string' ? form.name : '')
    }
  }
  for (const form of directory?.forms || []) add(form)
  for (const group of directory?.groups || []) {
    for (const form of group.forms || []) add(form)
  }
  return map
}

export function lookupFieldTitle(key, canvasTitles, sourceTitles) {
  if (canvasTitles?.has(key)) {
    const title = canvasTitles.get(key)
    return title || MISSING_NAME
  }
  if (sourceTitles?.has(key)) {
    const title = sourceTitles.get(key)
    return title || MISSING_NAME
  }
  return SYSTEM_FIELD_TITLES[key] || MISSING_NAME
}

export function lookupFormTitle(id, formTitles) {
  const title = formTitles?.get(Number(id))
  return title || MISSING_NAME
}

function commentForProp(key, value, canvasTitles, sourceTitles, formTitles) {
  if (FORM_REF_KEYS.has(key)) {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) return ''
    return lookupFormTitle(id, formTitles)
  }
  if (FIELD_REF_KEYS.has(key) && typeof value === 'string') {
    return lookupFieldTitle(value, canvasTitles, sourceTitles)
  }
  return ''
}

function annotateValue(value, canvasTitles, sourceTitles, formTitles, indent, itemHint) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const lines = ['[']
    value.forEach((item, index) => {
      const comma = index < value.length - 1 ? ',' : ''
      const nested = annotateValue(
        item,
        canvasTitles,
        sourceTitles,
        formTitles,
        indent + 1,
        '',
      )
      const hintComment =
        itemHint === 'field' && typeof item === 'string'
          ? lookupFieldTitle(item, canvasTitles, sourceTitles)
          : ''
      const nestedLines = nested.split('\n')
      if (nestedLines.length === 1) {
        lines.push(
          `${pad}  ${nestedLines[0]}${comma}${hintComment ? ` // ${hintComment}` : ''}`,
        )
        return
      }
      lines.push(`${pad}  ${nestedLines[0]}`)
      for (let i = 1; i < nestedLines.length; i += 1) {
        const last = i === nestedLines.length - 1
        lines.push(last ? `${nestedLines[i]}${comma}` : nestedLines[i])
      }
    })
    lines.push(`${pad}]`)
    return lines.join('\n')
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return '{}'
    const lines = ['{']
    keys.forEach((key, index) => {
      const comma = index < keys.length - 1 ? ',' : ''
      const child = value[key]
      const comment = commentForProp(key, child, canvasTitles, sourceTitles, formTitles)
      const hint = FIELD_REF_ARRAY_KEYS.has(key) ? 'field' : ''
      const nested = annotateValue(
        child,
        canvasTitles,
        sourceTitles,
        formTitles,
        indent + 1,
        hint,
      )
      const nestedLines = nested.split('\n')
      if (nestedLines.length === 1) {
        lines.push(
          `${pad}  ${JSON.stringify(key)}: ${nestedLines[0]}${comma}${comment ? ` // ${comment}` : ''}`,
        )
        return
      }
      lines.push(`${pad}  ${JSON.stringify(key)}: ${nestedLines[0]}`)
      for (let i = 1; i < nestedLines.length; i += 1) {
        const last = i === nestedLines.length - 1
        lines.push(last ? `${nestedLines[i]}${comma}` : nestedLines[i])
      }
    })
    lines.push(`${pad}}`)
    return lines.join('\n')
  }
  return JSON.stringify(value)
}

export function annotateCanvasJson(value, canvasTitles, sourceTitles, formTitles) {
  return annotateValue(value, canvasTitles, sourceTitles, formTitles, 0, '')
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test front/src/components/canvas-json-helper/annotateCanvasJson.spec.js
```

Expected: PASS，上述用例全部通过。

- [ ] **Step 5: Commit**

未经使用者要求不要 commit。使用者要求时再提交 `annotateCanvasJson.js` 与 `annotateCanvasJson.spec.js`。

---

### Task 2: 半圆入口、抽屉、转换

**Files:**
- Create: `front/src/components/canvas-json-helper/CanvasJsonHelper.vue`
- Modify: `front/src/App.vue`

**Interfaces:**
- Consumes: Task 1 全部导出；`getDirectoryApi(appId)`、`getFormApi(appId, formId)`
- Produces: 路由名为 `app-workspace` / `app-workspace-form` / `form-design` 时显示半圆按钮；`SHOW_CANVAS_JSON_HELPER === false` 时整组件不挂

- [ ] **Step 1: 写 `CanvasJsonHelper.vue`**

图标：从 `@element-plus/icons-vue` 确认有 `Document` 后再 import（项目 `fieldTypes.js` 已用过）。

```vue
<template>
  <div v-if="visible" class="json-helper">
    <button
      v-show="!open"
      type="button"
      class="json-helper-fab"
      aria-label="画布 JSON 解读"
      @click="openDrawer"
    >
      <el-icon><Document /></el-icon>
    </button>
    <el-drawer
      :model-value="open"
      title="画布 JSON 解读"
      direction="ltr"
      size="80%"
      @update:model-value="onOpenChange"
    >
      <div class="json-helper-body">
        <el-input
          v-model="sourceText"
          type="textarea"
          class="json-helper-pane"
          placeholder="粘贴表单画布 JSON"
        />
        <div class="json-helper-mid">
          <el-button type="primary" :loading="converting" @click="onConvert">
            转换
          </el-button>
        </div>
        <pre class="json-helper-pane json-helper-out">{{ resultText }}</pre>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import { getDirectoryApi, getFormApi } from '../../api/apps'
import {
  annotateCanvasJson,
  collectFieldTitles,
  collectSourceFormIds,
  formTitlesFromDirectory,
  parseCanvasJson,
} from './annotateCanvasJson.js'

const HELPER_ROUTES = new Set([
  'app-workspace',
  'app-workspace-form',
  'form-design',
])

const route = useRoute()
const open = ref(false)
const converting = ref(false)
const sourceText = ref('')
const resultText = ref('')

const visible = computed(() => HELPER_ROUTES.has(route.name))
const appId = computed(() => Number(route.params.id))

function openDrawer() {
  open.value = true
}

function onOpenChange(value) {
  open.value = value
}

async function onConvert() {
  let parsed
  try {
    parsed = parseCanvasJson(sourceText.value)
  } catch (error) {
    ElMessage.error(error.message || 'JSON 无法解析')
    return
  }
  if (!Number.isInteger(appId.value) || appId.value <= 0) {
    ElMessage.error('当前页面没有应用')
    return
  }
  converting.value = true
  try {
    const directory = await getDirectoryApi(appId.value)
    const formTitles = formTitlesFromDirectory(directory)
    const canvasTitles = collectFieldTitles(parsed)
    const sourceTitles = new Map()
    const ids = [...collectSourceFormIds(parsed)]
    const forms = await Promise.all(ids.map((id) => getFormApi(appId.value, id)))
    for (const form of forms) {
      collectFieldTitles(form?.fields, sourceTitles)
    }
    resultText.value = annotateCanvasJson(
      parsed,
      canvasTitles,
      sourceTitles,
      formTitles,
    )
  } catch {
    // 接口错误已由 http 拦截器 ElMessage，右栏保持原样
  } finally {
    converting.value = false
  }
}
</script>

<style scoped lang="less">
.json-helper-fab {
  position: fixed;
  top: 50%;
  left: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 56px;
  padding: 0;
  color: #fff;
  background: var(--el-color-primary);
  border: 0;
  border-radius: 0 28px 28px 0;
  transform: translateY(-50%);
  cursor: pointer;
}

.json-helper-body {
  display: flex;
  height: 100%;
  min-height: 0;
}

.json-helper-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.json-helper-mid {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  padding: 0 12px;
}

.json-helper-pane :deep(.el-textarea),
.json-helper-pane :deep(.el-textarea__inner) {
  height: 100%;
}

.json-helper-out {
  margin: 0;
  padding: 8px 12px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
}
</style>
```

抽屉内容区要拉满高度时，给 `el-drawer` 加：

```css
.json-helper :deep(.el-drawer__body) {
  display: flex;
  min-height: 0;
}
```

把这段加进同一 `<style scoped>`。

打开时不预填左栏。改左栏不调用 `onConvert`。

- [ ] **Step 2: 挂到 `App.vue`，并留下隐藏注释**

整文件改成：

```vue
<template>
  <RouterView />
  <!-- 画布 JSON 解读辅助。改成 false 即隐藏左侧按钮和抽屉，不必改路由。 -->
  <CanvasJsonHelper v-if="SHOW_CANVAS_JSON_HELPER" />
</template>

<script setup>
import { RouterView } from 'vue-router'
import CanvasJsonHelper from './components/canvas-json-helper/CanvasJsonHelper.vue'

const SHOW_CANVAS_JSON_HELPER = true
</script>

<style lang="less">

</style>
```

`v-if` 绑的是模块常量，不是行内语句。

- [ ] **Step 3: 跑纯函数测试，防回归**

```bash
node --test front/src/components/canvas-json-helper/annotateCanvasJson.spec.js
```

Expected: PASS。

- [ ] **Step 4: 浏览器手验**

1. 打开 `/apps/:id` 和 `/apps/:id/forms/:formId/design`：左侧垂直居中有半圆按钮。首页、`/apps/:id/backend` 没有。
2. 点开抽屉，左栏空，右栏空。乱贴文本点转换：提示「JSON 无法解析」，右栏仍空。
3. 从设计页复制画布 JSON（`FormDesignPanel` 的 `previewJson`）贴进左栏，点转换：右栏缩进与原文同类，字段 `key`、`sourceFormId` 等行末有中文名或 `未查找到`。
4. 把 `SHOW_CANVAS_JSON_HELPER` 临时改 `false`，刷新后按钮消失，再改回 `true`。

- [ ] **Step 5: Commit**

未经使用者要求不要 commit。使用者要求时再提交本任务改动的三个文件。
