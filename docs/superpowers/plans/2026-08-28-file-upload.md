# 文件上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 在 `master` 上改，不开分支。未经使用者要求不 commit。

**Goal:** 做成主表「文件上传」字段：可上传/下载/删除、格式与大小校验、必填/禁用/可修改、数据联动（对齐图片），暂不预览。

**Architecture:** 配置与校验在 `fileField.js`；控件 `FormFileUpload.vue` 对齐 `FormImageUpload.vue`。新接口 `POST /apps/:id/file-uploads` 落到 `uploads/files/YYYY-MM-DD/`。Mongo 存 `{ url, name }[]`。联动复用 `linkageRuntime.js` 的图片收集逻辑。

**Tech Stack:** Vue 3、Element Plus、NestJS multer `diskStorage`、前端 `node:test`、后端 Jest。

**Spec:** `docs/superpowers/specs/2026-08-28-file-upload-design.md`

## Global Constraints

- 开发在 `master`，不开分支、不建 worktree。
- 模板不写行内 JS；新 `el-dialog` 加 `draggable`；布局优先 flex；相邻 `el-button` 不加 `gap`。
- 图标必须从 `@element-plus/icons-vue` 确认导出后再 import。下载用已有 `Download`。
- 不删不改使用者已有注释和 `console.log`。
- 不勾 `front/README.md`。
- 不自动 git commit。
- 不新增 npm 依赖。
- 不删除 `uploads/` 下已有文件。
- 图片上传接口与 `uploads/imgs` 行为保持不变。

## File Structure

```text
front/src/components/form-fill/fileField.js          # 新建：格式/数量/大小/规范化
front/src/components/form-fill/fileField.spec.js     # 新建
front/src/components/form-fill/FormFileUpload.vue    # 新建
front/src/api/apps.js                                # 增加 uploadAppFileApi
front/src/components/form-design/linkage.js          # file 加入联动类型
front/src/components/form-fill/linkageRuntime.js     # 文件联动收集
front/src/components/form-design/FormDesignProps.vue # 属性：数量/大小/格式/可下载
front/src/components/FormDesignPanel.vue             # 拖入默认值
front/src/components/form-fill/FormFillField.vue     # 接控件
front/src/components/form-design/FormDesignCanvasField.vue
front/src/components/form-fill/fillValues.js
front/src/components/form-workspace/FormRecordCell.vue
front/src/components/form-design/FormFieldSourcePicker.vue  # 排除 file
server/src/application/application.controller.ts     # file-uploads
server/src/application/application.service.ts        # OPTION_FIELD_TYPES 加 file
server/src/application/form-record/form-record.coerce.ts
```

---

### Task 1: 文件字段纯函数

**Files:**
- Create: `front/src/components/form-fill/fileField.js`
- Test: `front/src/components/form-fill/fileField.spec.js`

**Interfaces:**
- Produces: `DEFAULT_FILE_MAX_COUNT`、`DEFAULT_FILE_MAX_SIZE_MB`、`FILE_FORMAT_OPTIONS`、`defaultFileFormats()`、`fileMaxCount`、`fileMaxSizeMB`、`fileMaxSizeBytes`、`fileAcceptFormats`、`fileAcceptAttr`、`fileFormatLabels`、`isAllowedFile`、`fileItemsOf`、`fileDownloadable`、`downloadFile`

- [ ] **Step 1: 写失败测试**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_FILE_MAX_COUNT,
  DEFAULT_FILE_MAX_SIZE_MB,
  defaultFileFormats,
  fileAcceptFormats,
  fileDownloadable,
  fileItemsOf,
  fileMaxCount,
  isAllowedFile,
} from './fileField.js'

test('defaults match spec', () => {
  assert.equal(fileMaxCount({}), DEFAULT_FILE_MAX_COUNT)
  assert.deepEqual(defaultFileFormats(), ['word', 'excel', 'pdf'])
  assert.deepEqual(fileAcceptFormats({}), ['word', 'excel', 'pdf'])
  assert.equal(fileDownloadable({}), true)
  assert.equal(fileDownloadable({ downloadable: false }), false)
})

test('fileItemsOf keeps url and original name', () => {
  assert.deepEqual(fileItemsOf([{ url: '/uploads/files/a.docx', name: '合同.docx' }]), [
    { url: '/uploads/files/a.docx', name: '合同.docx' },
  ])
  assert.equal(fileItemsOf(['/uploads/files/a.docx'])[0].url, '/uploads/files/a.docx')
})

test('docx is word; png is not', () => {
  const field = { acceptFormats: ['word', 'excel', 'pdf'] }
  assert.equal(
    isAllowedFile(field, { name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    true,
  )
  assert.equal(isAllowedFile(field, { name: 'a.png', type: 'image/png' }), false)
  assert.equal(isAllowedFile(field, { name: 'a.docx', type: '' }), true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test front/src/components/form-fill/fileField.spec.js`  
Expected: 模块不存在或函数未定义。

- [ ] **Step 3: 实现 `fileField.js`**

要点（实现须与 spec §3–§4 一致）：

```js
export const DEFAULT_FILE_MAX_COUNT = 3
export const DEFAULT_FILE_MAX_SIZE_MB = 10
export const DEFAULT_FILE_FORMATS = ['word', 'excel', 'pdf']

export const FILE_FORMAT_OPTIONS = [
  { value: 'pdf', label: 'pdf' },
  { value: 'word', label: 'word' },
  { value: 'excel', label: 'excel' },
  { value: 'ppt', label: 'ppt' },
  { value: 'txt', label: 'txt' },
  { value: 'zip', label: 'zip' },
]
```

格式族扩展名与 MIME 按 spec 表格。`isAllowedFile(field, file)`：用 `file.name` 取扩展名（小写）；无扩展名则 false。MIME 为空或 `application/octet-stream` 时只认扩展名。

`fileItemsOf`：数组里对象需有非空 `url` 字符串；`name` 缺省则用 url 最后一段。纯字符串当成 `{ url, name }`。

`fileDownloadable(field)`：`field.downloadable === false` 为 false，否则 true。

`downloadFile(item)`：对齐 `downloadImage`，`link.download = item.name || basename(item.url)`。

- [ ] **Step 4: 再跑测试确认通过**

Run: `node --test front/src/components/form-fill/fileField.spec.js`  
Expected: pass。

---

### Task 2: 后端上传与入库

**Files:**
- Modify: `server/src/application/application.controller.ts`
- Modify: `server/src/application/form-record/form-record.coerce.ts`
- Modify: `server/src/application/form-record/form-record.coerce.spec.ts`
- Modify: `server/src/application/application.service.ts`（`OPTION_FIELD_TYPES` 加 `'file'`）
- Modify: `server/src/application/application.service.spec.ts`（listFormFields 期望含 file 字段）

**Interfaces:**
- Consumes: Task 1 的扩展名规则（后端用同一张 MIME/ext 表，可把允许表写在 controller 里，不要新依赖）
- Produces: `POST /api/apps/:id/file-uploads` → `{ url, name }`；coerce 后 Mongo 为对象数组

- [ ] **Step 1: 扩展 coerce 测试**

在 `form-record.coerce.spec.ts` 增加：`file` 字段 `{ url, name }` 数组原样留下；字符串数组变成带 name 的对象。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest src/application/form-record/form-record.coerce.spec.ts`（在 `server/`）  
Expected: file 对象数组用例失败。

- [ ] **Step 3: 改 coerce**

`case 'file':` 单独处理（不要再和 image 共用「只收字符串」）：

- 字符串 → `[{ url, name: basename(url) }]`
- 字符串数组 → 同上 map
- 对象数组：每项 `url`、`name` 为非空字符串才保留
- 否则 400「字段值类型不正确」
- `image` 保持现在的字符串 / 字符串数组

- [ ] **Step 4: 上传接口**

在 `application.controller.ts` **不要改** 现有 `:id/uploads` 的图片 destination。新增：

```ts
@Post(':id/file-uploads')
```

`diskStorage` destination：`join(process.cwd(), 'uploads', 'files', localDateFolder())`，`mkdirSync(..., { recursive: true })`。  
filename：`uuid + ext`（ext 来自原始名，必须落在允许扩展名里）。  
`fileFilter`：扩展名 + MIME 规则与 spec 一致。  
`limits.fileSize`：与图片相同的 50MB。  
处理函数先 `getOne` 校验应用，返回：

```ts
{ url: publicUploadUrl(file.path), name: originalName }
```

`originalName` 取 `file.originalname`（去掉路径，非法字符可简单保留；空则用 uuid+ext）。  
`publicUploadUrl` 已有，根目录仍是 `uploads`，新文件相对路径为 `files/日期/uuid.ext`。

- [ ] **Step 5: listFormFields 包含 file**

`OPTION_FIELD_TYPES` 加 `'file'`。在现有 listFormFields 测试夹具里加一个 `type: 'image'` 已有的旁边再加 `type: 'file'`，断言返回里有它。

- [ ] **Step 6: 跑相关 Jest**

Run: `npx jest src/application/form-record/form-record.coerce.spec.ts src/application/application.service.spec.ts --testNamePattern="listFormFields|coerce|stores"`  
Expected: 与本次改动相关的用例 pass。图片上传路径测试（若有）不得失败。

---

### Task 3: 填报控件

**Files:**
- Create: `front/src/components/form-fill/FormFileUpload.vue`
- Modify: `front/src/api/apps.js`
- Modify: `front/src/components/form-fill/FormFillField.vue`
- Modify: `front/src/components/form-fill/fillValues.js`
- Modify: `front/src/components/form-fill/fillValues.spec.js`
- Modify: `front/src/components/form-design/FormDesignCanvasField.vue`

**Interfaces:**
- Consumes: `fileField.js`、`uploadAppFileApi(appId, file)`
- Produces: `update:modelValue` 为 `{ url, name }[]`

- [ ] **Step 1: `uploadAppFileApi`**

对齐 `uploadAppImageApi`，POST `/apps/${appId}/file-uploads`，timeout 120000。

- [ ] **Step 2: 补 fillValues 测试**

`file` 不再 skip：`emptyValue` 为 `[]`；`cloneRecordValues` / `buildRecordData` / `validateRequired` 覆盖有文件和无文件。

- [ ] **Step 3: 改 fillValues**

从 `SKIP_TYPES` 去掉 `'file'`。`emptyValue` / `isEmptyValue` / `serializeValue` / `cloneRecordValues` 对 `file` 走 `fileItemsOf`（与 image 用 `imageUrlsOf` 并列）。

- [ ] **Step 4: `FormFileUpload.vue`**

结构对齐 `FormImageUpload`，但是 `list-type` 默认文本列表（不要 `picture-card`）：

- `accept`、`limit`、`before-upload`、`on-exceed`、`on-remove`、`disabled`
- 满员后用 class 藏上传按钮（flex，不要为对齐改 grid）
- `beforeUpload`：校验格式、大小、数量 → `uploadAppFileApi` → `emit` 追加 `{ url, name }`，`name` 优先接口返回，否则 `file.name`；`return false` 阻止 el-upload 自己再传
- 列表每项：文件名；`fileDownloadable(field)` 时下载图标 `@click` 调函数（不要模板里写语句）；未禁用时删除
- 事件只绑 script 里的函数名

- [ ] **Step 5: 画布与填报接线**

`FormFillField`：`file` 用 `FormFileUpload`，传入 `field` `appId` `modelValue` `disabled=isDisabled`。  
画布占位可继续用禁用 `el-upload` + 按钮，或同样挂 `FormFileUpload` 并加 `preview`/`disabled` 且不传 `appId`（不发请求）。不要在模板里写赋值语句。

- [ ] **Step 6: 跑 fillValues 测试**

Run: `node --test front/src/components/form-fill/fillValues.spec.js front/src/components/form-fill/fileField.spec.js`  
Expected: pass。

---

### Task 4: 设计器属性

**Files:**
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/FormDesignPanel.vue`

**Interfaces:**
- Consumes: `FILE_FORMAT_OPTIONS`、`DEFAULT_FILE_*`、`defaultFileFormats`
- Produces: 字段 JSON 含 `maxCount` `maxSizeMB` `acceptFormats` `downloadable`

- [ ] **Step 1: 拖入默认值**

`FormDesignPanel` 创建 `file` 时：

```js
maxCount: DEFAULT_FILE_MAX_COUNT,
maxSizeMB: DEFAULT_FILE_MAX_SIZE_MB,
acceptFormats: defaultFileFormats(),
downloadable: true,
```

`optionSource`：因下一步会把 `file` 放进 `LINKAGE_VALUE_TYPES`，拖入时应为 `'custom'`（与图片一致，靠 `LINKAGE_VALUE_TYPES.includes`）。

打开已有字段缺省时补这些键（对齐图片那段 `if (field.type === 'image')`）。

复制字段时 `acceptFormats` 已有数组拷贝逻辑，可沿用。

- [ ] **Step 2: 属性面板**

在必填附近，`field.type === 'file'` 时增加与图片同款 `required-row`：最多上传 N 个文件、每个不超过 N MB、允许格式多选、是否可下载开关。

数据源块已由 `hasLinkageSource` 控制，Task 5 加上 `file` 后会自动出现「自定义 / 数据联动」。本任务若先做完、联动类型还没加，面板暂时没有数据源也可以；**推荐本任务与 Task 5 连续做**，避免中间状态。

不要用 `el-space`。开关和数字框沿用图片的 Element Plus 控件。

---

### Task 5: 数据联动

**Files:**
- Modify: `front/src/components/form-design/linkage.js`
- Modify: `front/src/components/form-design/linkage.spec.js`
- Modify: `front/src/components/form-fill/linkageRuntime.js`
- Modify: `front/src/components/form-fill/linkageRuntime.spec.js`
- Modify: `front/src/components/form-design/FormFieldSourcePicker.vue`
- Modify: `docs/superpowers/specs/2026-08-27-data-linkage-design.md`（`file` 列入支持联动的字段；图片只对图片、文件只对文件）

**Interfaces:**
- Consumes: `fileItemsOf`、`fileMaxCount`
- Produces: `applyLinkageResult` 对 `type === 'file'` 的 `{ value, message }`

- [ ] **Step 1: 联动配置测试**

`sourceTypesFor('file')` 为 `['file']`。`optionSourceChoices('file')` 为 custom + linkage。`filterLinkageSourceFields` 在当前类型为 file 时只留下 file。

- [ ] **Step 2: `LINKAGE_VALUE_TYPES` 加入 `'file'`**；`sourceTypesFor` 对 file 走 `return [fieldType]` 即可（已是默认分支）。给 `image` 保持 `['image']`。

- [ ] **Step 3: runtime 测试**

对齐图片用例：0 条清空；1～max 写入对象数组；超过 max 清空且 message 为 `[ 附件 ] 字段联动文件超过最多 3 个`。

- [ ] **Step 4: 实现 runtime**

`linkageQueryPaging`：`file` 与 `image` 一样 `pageSize: 100`。

抽出或并列 `collectFileItems`（按 url 去重）。`applyLinkageResult` 在 image 分支旁增加 file 分支，超量用 `linkageFileOverflowMessage`。

**不要**把多条匹配当成文本那样弹「查询出多条数据」；文件与图片一样按文件个数相对 `maxCount` 判断。

- [ ] **Step 5: FormFieldSourcePicker**

过滤 `field.type !== 'image' && field.type !== 'file'`，避免「其他表数据」出现文件。

- [ ] **Step 6: 跑测试**

Run: `node --test front/src/components/form-design/linkage.spec.js front/src/components/form-fill/linkageRuntime.spec.js`  
Expected: pass。

---

### Task 6: 数据管理列

**Files:**
- Modify: `front/src/components/form-workspace/FormRecordCell.vue`

**Interfaces:**
- Consumes: `fileItemsOf`、`fileDownloadable`、`downloadFile`

- [ ] **Step 1: 只读展示**

在 image 模板旁增加 `field.type === 'file'`：显示文件名列表（flex 换行），`title` 为全部名称。`fileDownloadable(field)` 时文件名或下载图标可点；`@click` 绑函数并 `.stop`，避免打开详情（对齐图片注释：不禁用事件会冒泡）。

不要给该列内联编辑按钮（`editable` 对 file 视为 false，或单元格逻辑里排除 `file`，与 `image` 一样不可单元格编辑）。检查现有 `editable` 是否已因 `isFillable`/类型排除 image——file 要从 SKIP 拿掉后，**必须**在单元格里显式排除 `image` 和 `file` 的编辑按钮。

- [ ] **Step 2: 手工验收（实现者本地）**

1. 设计器拖文件上传，默认格式 word/excel/pdf，保存。
2. 添加数据上传一个 `.docx`，列表显示原名，能下载、能删。
3. 传 `.png` 被拒绝。
4. 关掉可下载后无下载入口。
5. 禁用后不能传不能删，开着可下载时仍能下。
6. 配联动：源表文件字段带出；人为造超过 maxCount 的匹配，出现超量提示且当前字段被清空。
7. 确认磁盘 `server/uploads/files/当天日期/` 有文件；图片仍在 `uploads/imgs/`。

---

## 自检

- spec 数量/格式/下载/联动/路径/入库均有对应任务。
- 不预览、不导入文件列、不改图片接口。
- 函数名前后一致：`fileItemsOf`、`fileDownloadable`、`uploadAppFileApi`、`file-uploads`。
