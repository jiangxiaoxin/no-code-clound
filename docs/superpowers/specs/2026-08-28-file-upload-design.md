# 文件上传设计

日期：2026-08-28  
状态：已确认  
范围：主表字段 `type: 'file'` 的设计配置、上传下载删除、填报入库、数据联动。不包含预览、在线编辑、跨应用、子表单内文件。

对照：图片上传已实现（`FormImageUpload`、`imageField.js`、`POST /apps/:id/uploads`）。文件上传对齐同一套交互和联动规则，差异只在列表形态、格式、存储目录，以及「是否可下载」。

## 1. 需求核对（原描述 → 补齐）

原描述方向正确，单独不够落地。下面按图片组件补齐，实现以本节为准。

| 原描述 | 判定 | 本期怎么定 |
|---|---|---|
| 可上传、下载、删除；暂不预览 | 清楚 | 列表展示文件名；无预览窗、不点开内容 |
| 格式：pdf / word / excel / ppt / txt / zip；默认 word excel pdf | 格式族未拆扩展名 | 见 §3.2；默认勾选 `word` `excel` `pdf` |
| 大小限制默认 10M | 清楚，未写是每文件还是合计 | **每个文件**不超过 `maxSizeMB`，默认 10 |
| 是否必填 / 禁用 / 可修改 | 清楚 | 与现有公共字段属性相同 |
| 数据联动参考图片 | 清楚 | 只对应文件字段；按 `url` 去重收集；超过数量上限清空并提示，不截取前 N 个 |
| 是否可下载，默认开启 | 清楚；与图片不同 | 图片已去掉该开关（预览里总能下）。文件没有预览，隐藏下载按钮有意义。不防盗链、不禁 URL |
| （未写）最多几个文件 | 缺口 | 与图片对齐：`maxCount` 默认 **3**，可改 |
| （未写）存什么 | 缺口 | 每项 `{ url, name }`，保留原始文件名供下载 |
| （未写）落盘路径 | 缺口 | `uploads/files/YYYY-MM-DD/{uuid}{ext}`，与图片目录分开 |
| （未写）列表 / 导入 | 缺口 | 数据管理显示文件名，不可单元格编辑；导入跳过该列（已有 `IMPORT_SKIP_TYPES` 含 `file`） |

本期不做：预览、Office 在线编辑、压缩、分片、拖到子表单、rar/7z、按内容杀毒。

## 2. 与图片上传的对照

| | 图片 `image` | 文件 `file` |
|---|---|---|
| 控件 | `el-upload` 卡片 | `el-upload` 文本列表 |
| 值 | URL 字符串数组 | `{ url, name }` 对象数组 |
| 预览 | 有 | 无 |
| 下载 | 预览工具栏始终可下 | 属性 `downloadable`，默认 true |
| 禁用 | 不能传/删，仍可预览（及预览内下载） | 不能传/删；若允许下载则仍可点下载 |
| 不可修改 | 新增可传；编辑已有记录锁住 | 同左 |
| 联动 | 只对图片；超量清空+提示 | 只对文件；超量清空+提示 |
| 落盘 | `uploads/imgs/日期/` | `uploads/files/日期/` |
| 接口 | `POST /apps/:id/uploads` | `POST /apps/:id/file-uploads`（图片接口不混用） |
| 导入 | 跳过 | 跳过 |
| 筛索引 | 不建 `data.*` 索引 | 同左 |

## 3. 字段配置

公共项：标题、占位、必填、宽度、tips、禁用、可修改。

文件专有（拖入画布时写入默认值，打开旧设计缺省时补齐）：

```json
{
  "type": "file",
  "maxCount": 3,
  "maxSizeMB": 10,
  "acceptFormats": ["word", "excel", "pdf"],
  "downloadable": true,
  "optionSource": "custom"
}
```

选数据联动后与图片一样：`optionSource: 'linkage'` + `linkage: { sourceFormId, match, conditions, sourceKey }`。

属性面板（紧挨必填，样式对齐图片「最多上传 / 每张不超过 / 允许格式」）：

1. 最多上传 N 个文件（整数 ≥ 1）
2. 每个不超过 N MB（整数 ≥ 1）
3. 允许格式：多选，选项见下表；空则按默认 `word` `excel` `pdf`
4. 是否可下载：开关，默认开
5. 取值来源：自定义 / 数据联动（`hasLinkageSource` 含 `file`）

画布：禁用的 `el-upload` 文本按钮占位，不请求接口。已配联动时标题旁仍显示联动图标。

## 4. 格式

属性里存格式族，不是单个扩展名。

| 值 | 面板文案 | 扩展名 | 常见 MIME（有则校验，空或 `octet-stream` 只看扩展名） |
|---|---|---|---|
| `pdf` | pdf | `.pdf` | `application/pdf` |
| `word` | word | `.doc` `.docx` | `application/msword`、`application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `excel` | excel | `.xls` `.xlsx` | `application/vnd.ms-excel`、`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `ppt` | ppt | `.ppt` `.pptx` | `application/vnd.ms-powerpoint`、`application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `txt` | txt | `.txt` | `text/plain` |
| `zip` | zip | `.zip` | `application/zip`、`application/x-zip-compressed` |

前端 `accept` 同时带扩展名和 MIME。判定：**扩展名必须在允许族里**；若浏览器给了非空且不是 `application/octet-stream` 的 MIME，则必须落在该族允许的 MIME 里。Office 在 Windows 上经常 MIME 为空，不能只认 MIME。

后端 `fileFilter` 同一套规则。服务端硬顶 50MB（与现有图片上传一致），字段 `maxSizeMB` 只约束客户端。

## 5. 运行时

### 5.1 控件 `FormFileUpload`

- 列表展示 `name`，满 `maxCount` 后隐藏上传按钮。
- 上传走 `uploadAppFileApi`；成功后追加 `{ url, name }`，`name` 用用户文件的原始名（去掉路径）。
- 删除从数组去掉该项。
- 下载：`downloadable !== false` 时显示下载图标；`fetch` blob 后用 `name` 触发保存（复用图片下载写法）。
- 禁用或（编辑已有记录且 `editable === false`）：不能上传、不能删除。
- 超量、格式不对、超大小：`el-message` 警告，不上传。
- 图标必须从 `@element-plus/icons-vue` 导入；下载用已有的 `Download`。

### 5.2 入库

`fillValues`：`file` 与 `image` 一样要持久化（从 `SKIP_TYPES` 去掉 `file`）。空为 `[]`。序列化非空对象数组。

后端 `coerce`：`file` 收对象数组 `{ url: string, name: string }`；也接受旧形态纯 URL 字符串/字符串数组，规范成 `{ url, name }`（`name` 取路径最后一段）。空不写该 key。不建索引、不支持按文件名筛选。

### 5.3 数据管理

该列显示文件名（多个用顿号或换行省略 + `title` 看全称）。不可单元格内联编辑。详情/新增/编辑里才操作。`downloadable !== false` 时文件名可点下载。

### 5.4 禁用 / 可修改 / 必填

- 必填：一个有效文件都没有则拦提交（与图片相同）。
- 禁用：控件 `disabled`；联动仍可写入。
- 不可修改：新增可传可删；`updating && editable === false` 时锁住，联动也不改该字段（与图片、文本相同）。

## 6. 上传接口与静态访问

- `POST /api/apps/:id/file-uploads`，鉴权与图片上传相同（登录且应用属于当前用户）。
- 落盘 `uploads/files/{本地日期 YYYY-MM-DD}/{uuid}{ext}`。
- 返回 `{ url, name }`。`url` 形如 `/uploads/files/2026-08-28/{uuid}.docx`；`name` 为原始文件名。
- 现有 `app.useStaticAssets(uploads, { prefix: '/uploads/' })` 足够，不必改 `main.ts` 前缀。
- 不删除、不搬迁已有 `uploads/imgs` 和历史文件。

## 7. 数据联动

把 `file` 加入 `LINKAGE_VALUE_TYPES`。触发字段只列出源表 `type === 'file'` 的字段。`listFormFields` 的 `OPTION_FIELD_TYPES` 增加 `file`（与图片一样，否则触发下拉里又是空的）。「其他表数据」树里仍不出现文件（`FormFieldSourcePicker` 排除 `image` 和 `file`）。

运行时对齐图片：

- 查询 `pageSize: 100`。
- 按匹配记录收集文件项，按 `url` 去重保序。
- 0 个：清空为 `[]`，不提示。
- 1～`maxCount` 个：写入该数组。
- 超过 `maxCount`：清空，提示 `[ 字段标题 ] 字段联动文件超过最多 N 个`；有说明时为 `[ 标题，说明 ] 字段联动文件超过最多 N 个`。
- 下拉那套「多条变选项」不适用于文件。

## 8. 验收

1. 默认只能传 word / excel / pdf；改成允许 zip 后 `.zip` 可传，`.png` 不行。
2. 第 4 个文件被拦（默认最多 3）。单个超过 10MB 被拦。
3. 上传后列表显示原始文件名；点下载得到同名文件。关掉「是否可下载」后无下载入口，仍可删（未禁用时）。
4. 禁用：不能传不能删，允许下载时仍能下。
5. 不可修改：新增能传；打开已有记录编辑时不能改文件。
6. 必填未传不能保存。
7. 联动：源表文件字段带出；超过上限清空并出现上述提示文案。
8. 数据管理看到文件名，点单元格不能编辑该列。
9. 画布不上传。磁盘出现 `uploads/files/当天日期/`。
