# 流程版本管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务推进。默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 流程设计里可以新增、查看、编辑、删除多份流程图版本；同一时刻最多一版启用；启用中只读；新提交走启用中的图，在途单仍用提交时的快照。

**Architecture:** 新表 `workflow_version` 存每一版的图和 `enabled`。`workflow_definition` 只留 `hasBeenEnabled`（第一次启用成功置真，停用不清）。`getRuntime` 改为读启用中的那一行；没有启用中则 `enabled: false`，没有曾经启用过则 `hasBeenEnabled: false`（工作台仍提示未配置流程）。去掉【发布】和顶栏启用开关。

**Tech Stack:** NestJS + TypeORM + MySQL；前端 Vue 3 + Element Plus + LogicFlow。后端 Jest，前端纯函数 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-07-workflow-version-design.md`

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- TypeORM `synchronize: false`。SQL 写好后停下，等使用者点名该文件并同意才能执行。
- 表名单数下划线、列驼峰、普通索引 `IDX_表名_属性`、唯一 `uk_表名_属性`。
- 模板不写行内 JS；布局优先 flex；`el-dialog` 加 `draggable`。
- 可见文案用普通标签，不要 `el-text`；间距不要 `el-space`。
- 图标必须先从 `@element-plus/icons-vue` 确认有导出再 import。
- 不删不改使用者已有的注释和 `console.log`。
- 文件 UTF-8 无 BOM；写完中文回读。
- 界面用词：流程版本 (Vn)、设计中、启用中、添加新版本、管理已有版本、启用流程、停用、编辑、删除、保存。不要【发布】【预览】【测试】。
- 启用前用现有 `validatePublishedGraph` + 审批人校验；用库里已保存的图，不要用画布未保存内容。
- 同一张表最多一行 `enabled = 1`，服务端先关其它再打开这一行。
- 启用中不能保存、不能删除。
- 未经使用者批准不要用浏览器点页面。
- 手工用例写在 `docs/testcases/`，用人话写点击步骤。

## File Structure

```text
server/sql/2026-09-07-workflow-version.sql
server/src/application/workflow/workflow-version.entity.ts
server/src/application/workflow/workflow-definition.entity.ts
server/src/application/workflow/workflow-definition.service.ts
server/src/application/workflow/workflow-definition.service.spec.ts
server/src/application/workflow/app-workflow.controller.ts
server/src/application/workflow/dto/save-version.dto.ts
server/src/application/workflow/dto/copy-version.dto.ts
server/src/application/application.module.ts
server/src/application/application.service.ts
server/src/application/form-record/form-record.service.ts
front/src/api/workflow.js
front/src/components/workflow-design/workflowVersion.js
front/src/components/workflow-design/workflowVersion.spec.js
front/src/components/workflow-design/WorkflowDesignPanel.vue
front/src/components/workflow-design/WorkflowVersionMenu.vue
front/src/components/workflow-design/WorkflowVersionManageDialog.vue
front/src/components/form-workspace/FormRecordManage.vue
docs/testcases/2026-09-06-workflow-form-test-cases.md
docs/testcases/README.md
docs/guides/2026-09-06-workflow-form-usage.md
```

`getRuntime` 仍由 `WorkflowDefinitionService` 提供，填报和引擎不用改调用点，只改返回含义：`hasBeenEnabled` 替代原来的 `published`。

---

### Task 1: 建版本表并改定义实体

**Files:**
- Create: `server/sql/2026-09-07-workflow-version.sql`
- Create: `server/src/application/workflow/workflow-version.entity.ts`
- Modify: `server/src/application/workflow/workflow-definition.entity.ts`
- Modify: `server/src/application/application.module.ts`（注册 `WorkflowVersion`）

**Interfaces:**
- `WorkflowVersion`：`id, appId, formId, version, graph, enabled, createdAt, updatedAt`
- `WorkflowDefinition`：去掉 `draftGraph / publishedGraph / publishedVersion / publishedAt / enabled`，增加 `hasBeenEnabled: boolean`

- [ ] **Step 1: 写 SQL（先迁数据再删旧列）**

```sql
CREATE TABLE IF NOT EXISTS `workflow_version` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `version` int NOT NULL,
  `graph` json NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_version_formId_version` (`formId`, `version`),
  KEY `IDX_workflow_version_formId` (`formId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `workflow_definition`
  ADD COLUMN `hasBeenEnabled` tinyint(1) NOT NULL DEFAULT 0;

-- 已发布图 → 一版；enabled 跟原开关
INSERT INTO `workflow_version` (`appId`, `formId`, `version`, `graph`, `enabled`)
SELECT `appId`, `formId`, GREATEST(`publishedVersion`, 1), `publishedGraph`, `enabled`
FROM `workflow_definition`
WHERE `publishedGraph` IS NOT NULL;

UPDATE `workflow_definition`
SET `hasBeenEnabled` = 1
WHERE `publishedVersion` > 0;

-- 草稿且与已发布不同（或从未发布）→ 再插一版设计中
INSERT INTO `workflow_version` (`appId`, `formId`, `version`, `graph`, `enabled`)
SELECT d.`appId`, d.`formId`,
  IFNULL((SELECT MAX(v.`version`) FROM `workflow_version` v WHERE v.`formId` = d.`formId`), 0) + 1,
  d.`draftGraph`, 0
FROM `workflow_definition` d
WHERE d.`draftGraph` IS NOT NULL
  AND (d.`publishedGraph` IS NULL OR NOT (d.`draftGraph` <=> d.`publishedGraph`));

ALTER TABLE `workflow_definition`
  DROP COLUMN `draftGraph`,
  DROP COLUMN `publishedGraph`,
  DROP COLUMN `publishedVersion`,
  DROP COLUMN `publishedAt`,
  DROP COLUMN `enabled`;
```

- [ ] **Step 2: 写实体，在 `application.module.ts` 的 `TypeOrmModule.forFeature` 里加上 `WorkflowVersion`**

- [ ] **Step 3: 停下来等使用者执行 SQL**

不要自己跑库。告诉使用者文件路径，等他点名同意后再执行。单测用 mock，不依赖这步是否已跑。

---

### Task 2: get / 空表生成 V1 / getRuntime

**Files:**
- Modify: `server/src/application/workflow/workflow-definition.service.ts`
- Modify: `server/src/application/workflow/workflow-definition.service.spec.ts`
- Create: `front/src/components/workflow-design/workflowVersion.js`
- Create: `front/src/components/workflow-design/workflowVersion.spec.js`

**Interfaces:**
- `WorkflowRuntime = { hasBeenEnabled: boolean; enabled: boolean; graph: WorkflowGraph | null; version: number }`
- `get()` 返回 `{ versions, viewingVersionId, runningCount }`；`versions` 每项含 `id, version, enabled, title, graph`
- 没有任何版本时插入 V1：`emptyDraftGraph()`（与前端同一形状：一个开始节点），`enabled: false`

- [ ] **Step 1: 前端先写会失败的排序 / 标题测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { sortVersions, versionTitle } from './workflowVersion.js'

test('启用中排最前，其余版本号从大到小', () => {
  const rows = sortVersions([
    { version: 1, enabled: false },
    { version: 3, enabled: false },
    { version: 2, enabled: true },
  ])
  assert.deepEqual(rows.map((row) => row.version), [2, 3, 1])
})

test('名称是 流程版本 (V2)', () => {
  assert.equal(versionTitle(2), '流程版本 (V2)')
})
```

Run: `cd front && node --test src/components/workflow-design/workflowVersion.spec.js`  
Expected: 模块不存在而失败

- [ ] **Step 2: 实现 `versionTitle` / `sortVersions`，再跑测试通过**

- [ ] **Step 3: 改定义服务单测（先改断言再改实现）**

把原来的「发布成功后启用且版本为 1」改成「enable 成功」放 Task 3。本任务覆盖：

- `get` 没有版本时 `save` 一版 V1（开始节点），`hasBeenEnabled` 仍假
- `getRuntime`：有启用中的版本 → `{ hasBeenEnabled: true, enabled: true, graph, version }`
- `getRuntime`：曾经启用、当前全关 → `{ hasBeenEnabled: true, enabled: false, graph: null, version: 0 }`
- `getRuntime`：从未启用 → `{ hasBeenEnabled: false, enabled: false, graph: null, version: 0 }`

注入 `versionRepo`：`find / findOne / create / save / delete / createQueryBuilder` 按用到的 mock。

Run: `cd server && npx jest src/application/workflow/workflow-definition.service.spec.ts`  
Expected: 先因旧的 publish / draftGraph 失败或新断言失败

- [ ] **Step 4: 改 `get` / `getRuntime` / `ensureRow`**

`getRuntime` 不再读 `publishedGraph`。找 `versionRepo.findOne({ where: { formId, enabled: true } })`，定义行读 `hasBeenEnabled`。

`get`：`requireConfigure` 后 `ensureRow`；`versionRepo.find({ where: { formId } })` 为空则插入 V1；返回 `sortVersions` 后的列表（服务端可手写同样排序，或把排序逻辑只放前端——**列表接口按启用中在前、版本号降序排好**，少让前端各写一份）。

删掉 `saveDraft` / `publish` / `setEnabled` 的实现（本任务可以先留空方法让编译过，Task 3 换成新方法）。若本任务就删，把原先 publish 单测一并改到 Task 3，避免半截红。

**推荐：** 本任务只加 `versionRepo` 和改 `get` / `getRuntime`，publish 单测先 skip 或先改掉，避免两次大改。

- [ ] **Step 5: 跑定义服务单测全绿**

同时改所有 `getRuntime` mock 的 `published` 为 `hasBeenEnabled`：

- `server/src/application/form-record/form-record.service.ts`（`!runtime.published` → `!runtime.hasBeenEnabled`）
- `form-record.service.spec.ts`
- `workflow.engine.spec.ts`、`workflow.review-bugs.spec.ts`

提示文案改成「这张表单还没有配置流程」（可保留后半句或改成「启用流程之后才能使用」）。`attachProgress` 里 `runtime?.enabled` 判断停用 vs 转换回填，逻辑不变。

---

### Task 3: 保存、复制、启用、停用、删除

**Files:**
- Modify: `server/src/application/workflow/workflow-definition.service.ts`
- Modify: `server/src/application/workflow/workflow-definition.service.spec.ts`

**Interfaces:**
- `saveVersion(userId, appId, formId, versionId, graph)`：启用中抛「启用中的版本不能修改」
- `copyVersion(userId, appId, formId, fromVersionId)`：复制图，`version = max+1`，`enabled: false`，返回新行
- `enableVersion(userId, appId, formId, versionId)`：校验库里的 `row.graph`；失败 `BadRequestException(errors 数组)`；成功：该 form 其它版 `enabled=false`，本版 `true`，`def.hasBeenEnabled = true`
- `disableVersion(...)`：仅当该行当前 enabled；关掉；不改 `hasBeenEnabled`
- `deleteVersion(...)`：enabled 拒绝；删后若该 form 0 行则插入 V1

- [ ] **Step 1: 写失败测试（沿用 spec 里的 `leaveGraph`）**

```ts
it('启用缺审批人时拒绝且不改 enabled', async () => { /* versionRepo.findOne 返回缺人的图；expect enable 抛 BadRequestException；save 不被调来把 enabled 改 true */ })
it('启用成功后只有这一版 enabled，hasBeenEnabled 为真', async () => {})
it('不能保存启用中的版本', async () => {})
it('不能删除启用中的版本', async () => {})
it('复制当前版得到 version+1 且未启用', async () => {})
it('删光后自动补 V1', async () => {})
```

Run jest，确认失败原因是方法不存在。

- [ ] **Step 2: 把现有 `publish` 的校验挪到 `enableVersion`（`validatePublishedGraph` + `validateApproverTargets`）**

启用时不要用请求体里的图。先 `findOne` 该 `versionId` 且 `formId` 匹配。

关其它版：`await versionRepo.update({ formId }, { enabled: false })` 再 `row.enabled = true; save`。

- [ ] **Step 3: 跑 `workflow-definition.service.spec.ts` 全绿**

- [ ] **Step 4: 引擎 `getRuntime` 已在 Task 2 改过；抽测 `workflow.engine.spec.ts` 仍绿**

---

### Task 4: HTTP 接口换掉 publish / draft / patch enabled

**Files:**
- Modify: `server/src/application/workflow/app-workflow.controller.ts`
- Create: `server/src/application/workflow/dto/save-version.dto.ts`（`graph` 必填，可复用现有 `SaveDraftDto` 的图结构，字段改名为 `graph`）
- Create: `server/src/application/workflow/dto/copy-version.dto.ts`（`fromVersionId: number`）
- Delete or stop using: `dto/patch-enabled.dto.ts` 的整表开关（若无其它引用可删）

**Interfaces:**

| 方法 | 路径 |
|---|---|
| GET | `/apps/:appId/forms/:formId/workflow` |
| PUT | `.../workflow/versions/:versionId` |
| POST | `.../workflow/versions` body `{ fromVersionId }` |
| POST | `.../workflow/versions/:versionId/enable` |
| POST | `.../workflow/versions/:versionId/disable` |
| DELETE | `.../workflow/versions/:versionId` |

删掉 `PUT draft`、`POST publish`、`PATCH` 整表 enabled。

- [ ] **Step 1: 改 controller 接到 Task 3 的方法**
- [ ] **Step 2: 全库搜 `workflow/publish`、`workflow/draft`、`patchWorkflowEnabled`，只留版本接口**

---

### Task 5: 表单列表上的「有没有配过 / 是否启用中」

**Files:**
- Modify: `server/src/application/application.service.ts`
- Modify: `server/src/application/application.service.spec.ts`（若有 flags 断言）

**Interfaces:**
- 列表/详情仍返回 `workflowPublished`、`workflowEnabled`，避免工作台大改字段名
- `workflowPublished` = `hasBeenEnabled`（曾经启用过）
- `workflowEnabled` = 该表是否存在 `enabled = 1` 的版本

- [ ] **Step 1: `toWorkflowFlags` 改为接收 `{ hasBeenEnabled, enabledNow }`**

加载表单时除 definition 外，再 `versionRepo.find({ where: { formId: In(ids), enabled: true } })` 做成 Set。

删表单：`txn.delete(WorkflowVersion, { formId })` 再删 definition（现有 `delete({ formId })` 旁边加一行）。删应用时同样删该 app 的 version。

- [ ] **Step 2: 跑 `application.service.spec.ts`**

---

### Task 6: 流程设计顶栏与画布只读

**Files:**
- Modify: `front/src/api/workflow.js`
- Create: `front/src/components/workflow-design/WorkflowVersionMenu.vue`
- Create: `front/src/components/workflow-design/WorkflowVersionManageDialog.vue`
- Modify: `front/src/components/workflow-design/WorkflowDesignPanel.vue`
- Modify: `front/src/components/form-workspace/FormRecordManage.vue`（提示文案）

**Interfaces:**
- `getWorkflowApi` 仍 GET workflow，读 `versions`
- `saveWorkflowVersionApi(appId, formId, versionId, graph)`
- `copyWorkflowVersionApi(appId, formId, fromVersionId)`
- `enableWorkflowVersionApi` / `disableWorkflowVersionApi` / `deleteWorkflowVersionApi`

- [ ] **Step 1: 换 api 函数，删除 `publishWorkflowApi` / `patchWorkflowEnabledApi` / `saveWorkflowDraftApi`（流程草稿那条；实例草稿 `saveWorkflowInstanceDraftApi` 不要动）**

- [ ] **Step 2: `WorkflowVersionMenu.vue`**

点顶栏「流程版本 (Vn)」打开下拉（`el-dropdown` 或自己做的绝对定位面板，flex 竖排）。列表用 `sortVersions`。当前 id 打勾（Element Plus `Check` 图标，先确认包里有导出）。状态用普通 `span` 做成橙色 / 绿色小标，文案「设计中」「启用中」。下面两项：「添加新版本」「管理已有版本」。事件抽到 script 函数：`onPickVersion`、`onAddVersion`、`onOpenManage`。名称旁状态点：设计中橙、启用中绿。

未保存切换：`ElMessageBox.confirm('当前版本有未保存的修改，切换将丢失。确定切换吗？')`。

- [ ] **Step 3: `WorkflowVersionManageDialog.vue`**

`el-dialog` 标题「管理已有版本」，`draggable`。每一行 flex：名称、状态标、右侧文字按钮。设计中：启用流程 / 编辑 / 删除。启用中：停用 / 编辑。删除用 `ElMessageBox.confirm`，写明不能恢复。不要给按钮容器加 `gap`。

启用失败：把接口返回的数组交给父组件写到顶栏错误区（现有 `.wf-errors`），弹框不关。

启用前若 `dirty`：`ElMessage.warning('请先保存')`，不要调启用接口。

- [ ] **Step 4: 改 `WorkflowDesignPanel.vue`**

去掉【发布】和「启用流程」开关。右侧只留【保存】，`disabled` 当 `current.enabled`。`onSave` 调 `saveWorkflowVersionApi`。加载后 `viewingId` 默认启用中，没有则版本号最大。

启用中：LogicFlow `isSilentMode: true`（或加载该版时重建画布），不绑定拖节点、不响应属性 `change` 的写入；左侧调色板不给拖。点节点仍把 `selectedNode` 填上，右侧只读展示（属性组件已有输入时加 `disabled` 或整栏 `pointer-events` 只挡改、不挡看——优先给 `WorkflowNodeProps` 传 `disabled`）。

`onAddVersion`：`copyWorkflowVersionApi` 当前 `viewingId`，然后选中返回的新版并 `applyGraph`。

删的是当前版：用接口返回的列表（删除接口可返回 `get()` 同结构，或删完再 `load`）按规格切：启用中 → 否则最大号 → 否则会自动有 V1。

顶栏说明改成：有启用中则「启用中 Vn。审批中的 N 条仍按提交时的版本走。」从未启用：「尚未启用任何版本」。

- [ ] **Step 5: 工作台提示**

`FormRecordManage.vue` 里「发布流程之后才能使用」改成和创建页一致：「这张表单还没有配置流程，暂时不能填报」。`workflowPublished` 仍表示曾经启用过，逻辑不用改。

---

### Task 7: 手工用例和使用说明

**Files:**
- Modify: `docs/testcases/2026-09-06-workflow-form-test-cases.md`
- Modify: `docs/testcases/README.md`（若执行顺序提到【发布】）
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`（若写了点【发布】）
- Modify: `docs/guides/2026-09-06-workflow-form-usage.md`

- [ ] **Step 1: 把专项里「点【发布】」改成版本操作**

至少改：

| 编号 | 改后要点 |
|---|---|
| S-05 | 画完点【保存】，管理里对该版点【启用流程】；下拉该行绿色「启用中」；没有【发布】按钮 |
| D-05 | 缺「其他情况」时点【启用流程】，顶部列出错误，仍是设计中 |
| D-06 | 配好后启用成功；从未启用过时工作台不能填；不要测「开关 disabled」 |
| D-07 | 只勾部门负责人后能启用 |
| M-01 / 审批中再改流程 | 添加新版本改图并启用；在途单仍按旧图；新提交走新图 |
| 新 V-01 | 下拉当前是 V1，添加新版本得到 V2，图画的是 V1 的拷贝，状态设计中 |
| 新 V-02 | 启用中画布不能改、【保存】点不了；管理弹窗没有删除 |
| 新 V-03 | 停用后新数据【保存】即已通过，详情「流程停用期间保存」；在途待办还在 |
| 新 V-04 | 删一份设计中要确认；删光后画布仍有 V1 开始节点 |

组合用例里「点【发布】」的句子同样改成启用。使用说明第 2 节按顶栏下拉重写，不要再教人点发布。

- [ ] **Step 2: 回读中文，确认没有乱码**

---

## Spec coverage

| 规格 | 任务 |
|---|---|
| 版本表 + hasBeenEnabled + 迁移 SQL | 1 |
| 打开设计自动 V1、getRuntime、填报是否能交 | 2、5 |
| 保存 / 复制选中版 / 启用校验 / 停用 / 删除 | 3、4 |
| 顶栏下拉、管理弹窗、启用中只读、未保存确认 | 6 |
| 工作台未配置 vs 停用 | 2 文案、5 flags、6 提示 |
| 在途快照不切换 | 已有引擎；用例 M-01 / V |
| 手工用例 | 7 |
| 自定义名、预览、测试 | 不做 |

## Placeholder scan

计划里没有 TBD。SQL 必须等人执行。不自动 commit。
