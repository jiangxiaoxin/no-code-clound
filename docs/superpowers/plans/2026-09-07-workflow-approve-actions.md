# 审批节点扩展操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务推进。默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 审批节点可单独开关转交、加签、退回上一节点、打回发起人；运行时只在对应开关打开时出现按钮。转交 / 加签 / 两种退回全程保持「审批中」；只有驳回变成「已驳回」。打回发起人出现在发起人的【我的待办】，点【提交】后从开始继续走，不要变成已驳回再交。

**Architecture:** 节点快照增加四个布尔开关。引擎新增 `transfer` / `addSign` / `returnTo` / `resubmitStart`。退回上一节点和打回发起人共用 `returnTo(target)`。待办详情多出 `canTransfer` 等标志。设计器右侧「审批操作」勾选；待办抽屉底部出按钮和选人弹框。不加第六种流程状态。

**Tech Stack:** NestJS + TypeORM + MySQL；前端 Vue 3 + Element Plus。后端 Jest，前端纯函数 `node --test`。选人复用 `FormMemberSelect`。

**Spec:** `docs/superpowers/specs/2026-09-07-workflow-approve-actions-design.md`

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- 不新增实例状态；转交、加签、退回全程 `running`。
- 打回发起人不要写成 `rejected` + 【我发起的】再次提交。
- 任务表唯一约束是 `instanceId + nodeKey + assigneeId + round`：同一轮同一节点一个人只能有一条任务。加签不能给操作者再插一条 `done` 任务，加签记录写 `instance.notes`。
- 退回后 `round + 1`；上一节点重派上一轮点过「通过」的人（会签全员）；停用账号跳过，无人可派则进异常。
- 转交 / 加签意见选填；两种退回意见必填。
- 转交、加签、退回都不写回操作者尚未点通过时改的表单字段。
- 模板不写行内 JS；布局优先 flex；新 `el-dialog` 加 `draggable`。
- 可见文案用普通标签，不要 `el-text`；间距不要 `el-space`。
- 不删不改使用者已有的注释和 `console.log`。
- 文件 UTF-8 无 BOM；写完中文回读。
- 界面用词：**转交**、**加签**、**退回上一节点**、**打回发起人**、**提交**（发起人待办）。不要写成「转办」「驳回到开始」。
- 未经使用者批准不要用浏览器点页面。
- 手工用例写在 `docs/testcases/`，用人话写点击步骤。

## File Structure

```text
server/src/application/workflow/workflow.types.ts
server/src/application/workflow/workflow.graph.ts
server/src/application/workflow/workflow.graph.spec.ts
server/src/application/workflow/workflow.engine.ts
server/src/application/workflow/workflow.engine.spec.ts
server/src/application/workflow/workflow-instance.service.ts
server/src/application/workflow/workflow-instance.service.spec.ts
server/src/application/workflow/workflow-inbox.service.ts
server/src/application/workflow/workflow-inbox.service.spec.ts
server/src/application/workflow/workflow.controller.ts
server/src/application/workflow/dto/transfer-task.dto.ts
server/src/application/workflow/dto/add-sign-task.dto.ts
server/src/application/workflow/dto/return-task.dto.ts
server/src/application/workflow/dto/resubmit-task.dto.ts
front/src/components/workflow-design/workflowGraph.js
front/src/components/workflow-design/workflowGraph.spec.js
front/src/components/workflow-design/WorkflowDesignPanel.vue
front/src/components/workflow-design/WorkflowNodeProps.vue
front/src/api/workflow.js
front/src/components/workflow-inbox/workflowStatus.js
front/src/components/workflow-inbox/workflowStatus.spec.js
front/src/components/workflow-inbox/WorkflowInboxDrawer.vue
front/src/components/workflow-inbox/WorkflowProgressList.vue
front/src/components/workflow-inbox/WorkflowActionPicker.vue
docs/superpowers/specs/2026-09-05-workflow-form-design.md
docs/testcases/2026-09-06-workflow-form-test-cases.md
docs/testcases/README.md
docs/guides/2026-09-06-workflow-form-usage.md
```

没有新表。开关存在流程图 JSON 里；动作写在现有 `workflow_task.action` 和 `workflow_instance.notes`。

---

### Task 1: 节点开关入库与图序列化

**Files:**
- Modify: `server/src/application/workflow/workflow.types.ts`
- Modify: `front/src/components/workflow-design/workflowGraph.js`
- Modify: `front/src/components/workflow-design/workflowGraph.spec.js`
- Modify: `front/src/components/workflow-design/WorkflowDesignPanel.vue`（新建审批节点默认值）

**Interfaces:**
- 审批节点增加：`allowTransfer?: boolean`、`allowAddSign?: boolean`、`allowReturnPrevious?: boolean`、`allowReturnStart?: boolean`
- 缺省：转交 / 加签 / 打回发起人 = 关；退回上一节点 = 开（`!== false`）
- `TaskAction` 扩成 `'approve' | 'reject' | 'transfer' | 'addSign' | 'returnPrevious' | 'returnStart' | 'resubmit'`

- [ ] **Step 1: 先写前端序列化单测**

在 `workflowGraph.spec.js` 补：

```js
test('审批节点四个操作开关：缺省只开退回上一节点', () => {
  const product = toProductGraph({
    nodes: [{
      id: 'n1',
      type: 'approve',
      x: 0,
      y: 0,
      properties: { key: 'n1', title: '部门审批', type: 'approve' },
    }],
    edges: [],
  })
  assert.equal(product.nodes[0].allowTransfer, false)
  assert.equal(product.nodes[0].allowAddSign, false)
  assert.equal(product.nodes[0].allowReturnPrevious, true)
  assert.equal(product.nodes[0].allowReturnStart, false)
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `node --test front/src/components/workflow-design/workflowGraph.spec.js`

- [ ] **Step 3: 改类型和序列化**

`workflow.types.ts` 的审批节点和 `TaskAction` 按 Interfaces 扩。

`toProductGraph` 在 `type === 'approve'` 分支加上：

```js
allowTransfer: Boolean(props.allowTransfer),
allowAddSign: Boolean(props.allowAddSign),
allowReturnPrevious: props.allowReturnPrevious !== false,
allowReturnStart: Boolean(props.allowReturnStart),
```

`toLogicflowGraph` 的 `properties` 原样带回这四个字段。

`createNodeConfig` 新建审批节点时写上同样缺省。

- [ ] **Step 4: 再跑单测通过**

---

### Task 2: 算出「上一审批节点」

**Files:**
- Modify: `server/src/application/workflow/workflow.graph.ts`
- Modify: `server/src/application/workflow/workflow.graph.spec.ts`

**Interfaces:**
- `previousApproveNodeKey(graph, visitedNodeKeys, currentNodeKey): string | null`
- 只认 `visitedNodeKeys` 里、当前节点之前、最近的一个 `type === 'approve'` 的 key
- 当前就是第一个审批节点，或 visited 里没有更早的审批节点：返回 `null`

- [ ] **Step 1: 写失败单测**

```ts
it('按走过的审批节点倒着找上一站，不看图上别的岔路', () => {
  const graph = leaveGraph(); // 已有：开始-分支-部门审批-人事备案
  expect(
    previousApproveNodeKey(graph, ['start', 'branch', 'dept', 'hr'], 'hr'),
  ).toBe('dept');
  expect(
    previousApproveNodeKey(graph, ['start', 'branch', 'dept'], 'dept'),
  ).toBeNull();
});
```

- [ ] **Step 2: 实现函数并跑通**

```ts
export function previousApproveNodeKey(
  graph: WorkflowGraph,
  visited: string[] | null | undefined,
  currentNodeKey: string,
): string | null {
  const keys = visited || [];
  const currentIndex = keys.lastIndexOf(currentNodeKey);
  const before = currentIndex >= 0 ? keys.slice(0, currentIndex) : keys;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const node = graph.nodes.find((item) => item.key === before[i]);
    if (node?.type === 'approve') return node.key;
  }
  return null;
}
```

---

### Task 3: 引擎转交、加签

**Files:**
- Modify: `server/src/application/workflow/workflow.engine.ts`
- Modify: `server/src/application/workflow/workflow.engine.spec.ts`

**Interfaces:**
- `transfer({ taskId, actorId, assigneeId, comment })`
- `addSign({ taskId, actorId, assigneeIds, comment })`
- 实例保持 `running`，`currentNodeKey` 不变，**不** `round + 1`
- 不写 Mongo 业务字段

**转交：**

1. 用 `id + status=pending + assigneeId=actorId` 把本条改成 `done`、`action='transfer'`、写意见。影响 0 行则抛「这条待办已处理」。
2. `assigneeId === actorId` 抛「不能转交给自己」。
3. 目标必须是启用用户，否则抛「人员不存在」或「账号已停用」。
4. 本轮本节点目标人若已有 `pending`，抛「该用户已有待办」。
5. 目标人若已有 `cancelled` 任务：改回 `pending` 并清空 `action/comment`（复用 `dispatchTasks` 复活逻辑）。没有则 `insert` 一条 pending。
6. 其他人 pending **不动**。

**加签：**

1. 确认操作者本条仍是 pending（加签不结束自己的待办）。
2. 节点 `allowAddSign` 必须为真（转交同样看 `allowTransfer`）。
3. 对每个 `assigneeId`：启用、不是自己、本轮本节点没有 pending → 复活或插入。
4. 全部都已有 pending：抛「所选人员已有待办」。
5. 往 `instance.notes` 追加：`张三 加签王五、赵六`（姓名可先写 id，inbox 展示再解析；引擎侧用「加签用户 id」即可，进度文案在 Task 9 拼姓名）。

- [ ] **Step 1: 在 `workflow.engine.spec.ts` 写失败用例**

至少覆盖：转交成功后操作者 done、目标人 pending、其他人仍 pending；转交给自己失败；加签后操作者仍 pending、被加签人多一条 pending。

- [ ] **Step 2: 实现 `transfer` / `addSign`，跑 Jest 通过**

Run: `npx jest src/application/workflow/workflow.engine.spec.ts --prefix server`（或仓库惯用的 server 单测命令）

---

### Task 4: 引擎退回（上一节点 / 发起人）

**Files:**
- Modify: `server/src/application/workflow/workflow.engine.ts`
- Modify: `server/src/application/workflow/workflow.engine.spec.ts`

**Interfaces:**
- `returnTo({ taskId, actorId, target: 'previous' | 'start', comment })`
- 意见空则抛「请填写退回意见」
- 实例保持 `running`，**禁止**写成 `rejected` / `draft`

**步骤：**

1. 条件更新本条 pending → done，`action` 为 `returnPrevious` 或 `returnStart`。
2. 取消本实例所有仍 `pending` 的任务（当前及之后），原因：`退回至「部门审批」` 或 `打回至发起人修改`。
3. `round = instance.round + 1`，`hasApproved` 保持原值即可（已经有人批过，撤回规则仍按现有 `hasApproved`）。
4. `target === 'previous'`：
   - `prev = previousApproveNodeKey(...)`；没有则抛「没有上一审批节点」。
   - `currentNodeKey = prev`。
   - `visitedNodeKeys` 截到 **包含 prev、不含当前节点及之后**。
   - 找 **上一轮**（`round - 1`）该节点 `action === 'approve'` 且 `status === 'done'` 的 `assigneeId`，去重后只留启用账号。
   - 无人：`markError(..., 'dispatch')`，原因 `退回后节点「xxx」没有可用的审批人`。
   - 有人：`dispatchTasks` 派新 round 的 pending。
5. `target === 'start'`：
   - `currentNodeKey = 'start'`。
   - `visitedNodeKeys = ['start']`。
   - `insert` 一条 `nodeKey='start'`、`assigneeId=initiatorId`、`status='pending'`、当前新 `round`。
6. Mongo `workflowStatus` 仍为 `running`。
7. 节点开关：`previous` 看 `allowReturnPrevious !== false`；`start` 看 `allowReturnStart`。

- [ ] **Step 1: 写失败单测**

覆盖：人事备案退回部门审批后状态仍 running、round +1、部门审批原通过者有新 pending、人事备案 pending 取消；第一个审批节点退回上一节点失败；打回发起人后发起人有 `start` pending、状态 running 不是 rejected。

- [ ] **Step 2: 实现并跑通**

---

### Task 5: 引擎发起人待办提交

**Files:**
- Modify: `server/src/application/workflow/workflow.engine.ts`
- Modify: `server/src/application/workflow/workflow.engine.spec.ts`

**Interfaces:**
- `resubmitStart({ taskId, actorId })`
- 调用方先用现有 `persist.persist({ requiredKeys: 'all' })` 写完表单，再调引擎（与 `WorkflowInstanceService.submit` 相同：先落库再推进）
- 本条必须是 `nodeKey === 'start'`、`pending`、`assigneeId === actorId`、`actorId === initiatorId`
- 完成后 `action='resubmit'`，再 `advance(instance, 'start')`
- 不要把状态改成 `draft` / `rejected`

- [ ] **Step 1: 写失败单测：打回后 resubmit，实例仍 running，下一站重新派部门审批**
- [ ] **Step 2: 实现并跑通**

---

### Task 6: 接口、DTO、实例服务

**Files:**
- Create: `server/src/application/workflow/dto/transfer-task.dto.ts`
- Create: `server/src/application/workflow/dto/add-sign-task.dto.ts`
- Create: `server/src/application/workflow/dto/return-task.dto.ts`
- Create: `server/src/application/workflow/dto/resubmit-task.dto.ts`
- Modify: `server/src/application/workflow/workflow-instance.service.ts`
- Modify: `server/src/application/workflow/workflow-instance.service.spec.ts`
- Modify: `server/src/application/workflow/workflow.controller.ts`

**Interfaces（路径按规格）：**

| 人做的事 | 路径 |
|---|---|
| 转交 | `POST /api/workflow/tasks/:taskId/transfer` body `{ assigneeId, comment? }` |
| 加签 | `POST /api/workflow/tasks/:taskId/add-sign` body `{ assigneeIds: number[], comment? }` |
| 退回上一节点 | `POST /api/workflow/tasks/:taskId/return-previous` body `{ comment }` |
| 打回发起人 | `POST /api/workflow/tasks/:taskId/return-start` body `{ comment }` |
| 发起人提交 | `POST /api/workflow/tasks/:taskId/resubmit` body `{ data }` |

`resubmit`：先 `persist` 全字段（与再次提交同一套校验），再 `engine.resubmitStart`。返回 `{ nextNodeTitle }`。

`complete()` **不要** 接受 `start` 节点的通过/驳回。

- [ ] **Step 1: 写 instance.service 失败单测**（转交调引擎、resubmit 先 persist）
- [ ] **Step 2: 接线并跑通**

---

### Task 7: 待办详情按钮标志

**Files:**
- Modify: `server/src/application/workflow/workflow-inbox.service.ts`
- Modify: `server/src/application/workflow/workflow-inbox.service.spec.ts`

**Interfaces:**
`actionsOf` 在 `kind === 'todo'` 时：

- 普通审批 pending：
  - `canApprove` / `canReject` = true
  - `canTransfer` = `allowTransfer === true`
  - `canAddSign` = `allowAddSign === true`
  - `canReturnPrevious` = `allowReturnPrevious !== false` **且** `previousApproveNodeKey(...)` 非空
  - `canReturnStart` = `allowReturnStart === true`
  - `canResubmit` = false
  - `fieldAccess` 仍按当前审批节点
- `task.nodeKey === 'start'` 的 pending：
  - `canApprove` / `canReject` / 四个扩展操作 = false
  - `canResubmit` = true
  - `fieldAccess` 返回 `{}`（前端按发起编辑，不要套审批权限）
  - `readOnly` = false

【我发起的】【我处理的】不要出现转交、加签、退回、发起人提交。

卡片 `currentNodeTitle`：`start` 待办显示「待发起人修改」（不要显示节点 key）。

- [ ] **Step 1: 写 inbox.service 失败单测**
- [ ] **Step 2: 实现并跑通**

---

### Task 8: 设计器「审批操作」勾选

**Files:**
- Modify: `front/src/components/workflow-design/WorkflowNodeProps.vue`

**界面：** 审批节点属性里，在「意见是否必填」和「字段权限」之间加一块：

- 标题：**审批操作**
- 四个 `el-checkbox`：允许转交、允许加签、允许退回上一节点、允许打回发起人
- 打回发起人下面一行小字：`打回发起人：发起人改单后继续审，不是驳回`
- 启用中版本 `disabled` 已有，跟着走

`patch` 四个布尔值。绑定：

```js
Boolean(node.allowTransfer)
Boolean(node.allowAddSign)
node.allowReturnPrevious !== false
Boolean(node.allowReturnStart)
```

- [ ] **Step 1: 加上勾选和 patch 函数（事件抽到 script，不要行内 JS）**
- [ ] **Step 2: 打开文件确认中文正常**

---

### Task 9: 待办抽屉按钮、选人弹框、进度文案

**Files:**
- Modify: `front/src/api/workflow.js`
- Modify: `front/src/components/workflow-inbox/workflowStatus.js`
- Modify: `front/src/components/workflow-inbox/workflowStatus.spec.js`
- Modify: `front/src/components/workflow-inbox/WorkflowInboxDrawer.vue`
- Modify: `front/src/components/workflow-inbox/WorkflowProgressList.vue`
- Create: `front/src/components/workflow-inbox/WorkflowActionPicker.vue`

**Interfaces:**

```js
export function inboxActionsVisible(kind, actions = {}) {
  if (kind === 'todo') {
    return {
      approve: Boolean(actions.canApprove),
      reject: Boolean(actions.canReject),
      transfer: Boolean(actions.canTransfer),
      addSign: Boolean(actions.canAddSign),
      returnPrevious: Boolean(actions.canReturnPrevious),
      returnStart: Boolean(actions.canReturnStart),
      resubmit: Boolean(actions.canResubmit),
    }
  }
  // mine / done 保持原样
}
```

`WorkflowActionPicker.vue`：可拖拽 `el-dialog`。

- `mode: 'transfer' | 'addSign'`
- 转交：标题「转交给谁」，`FormMemberSelect` 单选
- 加签：标题「加签给谁」，人员多选（`FormMemberSelect` 的 `member-multiple` 字段）
- 意见输入框，占位「说明（选填）」
- 确定 / 取消

抽屉底部：

- `visible.transfer` →【转交】→ 打开 picker → `transferWorkflowTaskApi`
- `visible.addSign` →【加签】→ picker → `addSignWorkflowTaskApi`
- `visible.returnPrevious` → 确认框必填意见 → `returnPreviousWorkflowTaskApi`
- `visible.returnStart` → 确认框必填意见 → `returnStartWorkflowTaskApi`
- `visible.resubmit` →【提交】，校验必填后 `resubmitWorkflowTaskApi`，成功文案用现有 `submitSuccessText`
- 发起人待办：隐藏「审批意见」框和通过/驳回；`formDisabled` 为 false；`field-access` 传空对象
- 退回确认用 `ElMessageBox.prompt` 或单独小 dialog（`draggable`），空意见提示「请填写退回意见」

`WorkflowProgressList` 在现有通过/驳回旁加：

| `action` | 文案片段 |
|---|---|
| `transfer` | `转交`（有 comment 再拼） |
| `addSign` | 不加在 task 上；notes 已有「加签」原文 |
| `returnPrevious` | `退回至上一节点`（comment 里已有节点名也可只拼 comment） |
| `returnStart` | `打回至发起人修改` |
| `resubmit` | `已重新提交` |
| `nodeKey === 'start'` 且 pending | 节点名显示「待发起人修改」而不是 `start` |

- [ ] **Step 1: 先改 `workflowStatus.spec.js`，断言 todo 露出四个新按钮和 resubmit**
- [ ] **Step 2: 接线 API 和抽屉，确认中文正常**

---

### Task 10: 规格、用例、使用说明

**Files:**
- Modify: `docs/superpowers/specs/2026-09-05-workflow-form-design.md`
- Modify: `docs/superpowers/specs/2026-09-07-workflow-approve-actions-design.md`（状态改为已定稿）
- Modify: `docs/testcases/2026-09-06-workflow-form-test-cases.md`
- Modify: `docs/testcases/README.md`
- Modify: `docs/guides/2026-09-06-workflow-form-usage.md`

**主规格要改的人话：**

- §9.3 本期没有的操作：删掉已做的转交、加签、退回；保留任意指定节点、减签、批量等
- 写清打回发起人 = 审批中 + 我的待办 + 提交，不是已驳回
- §17 接口表补 Task 6 五条路径

**用例（专项里加编号，步骤用人话）：**

预备：人事备案节点勾上「允许打回发起人」「允许转交」「允许加签」；部门审批保持默认（仅退回上一节点开）。

| 编号 | 步骤 | 期望 |
|---|---|---|
| A-01 | 设计器点部门审批 | 「允许退回上一节点」默认勾着；另外三个默认不勾 |
| A-02 | 经理打开事假待办（部门审批，转交未开） | 没有【转交】【加签】【打回发起人】；有【退回上一节点】但点了提示没有上一审批节点（或按钮不可用） |
| A-03 | 人事备案待办点【退回上一节点】，填「请补事由」确定 | 状态仍审批中；甲的【我的待办】又有部门审批；乙若或签已被取消则没有；打开能改本节点标了可编辑的字段 |
| A-04 | 甲改事由点【通过】 | 流程再到人事备案 |
| A-05 | 人事备案点【打回发起人】，填意见 | 状态仍审批中，不是已驳回；发起人 A 的【我的待办】有「待发起人修改」；【我发起的】底部没有「再次提交」当主路径 |
| A-06 | A 在待办里改结束日期点【提交】 | 仍审批中，部门审批重新出现待办 |
| A-07 | 人事备案【转交】给张三 | 操作者待办进【我处理的】；张三【我的待办】有这张；其他人 pending 还在（或签） |
| A-08 | 会签节点【加签】王五后，原审批人再点通过 | 仍停在本节点，等王五；王五通过后才往下 |
| A-09 | 同一人既是发起人又是部门审批：分别退回上一节点和打回发起人 | 上一节点待办底部是通过/驳回；打回待办底部是提交，字段按发起规则可改 |

README「不要测」：去掉「转办、加签」；改成不要测减签、退回任意指定节点、批量转交。

使用说明补一句：待办里可能看到转交 / 加签 / 退回，打回后发起人在【我的待办】改完点提交。

- [ ] **Step 1: 改文档，回读中文无乱码**

---

## Self-Review

| 规格章节 | 对应任务 |
|---|---|
| §3 不新增状态 | Global + Task 4 |
| §4 四个开关默认值 | Task 1、8 |
| §5 按钮出现条件 | Task 7、9 |
| §6 转交 | Task 3、6、9 |
| §7 加签（操作者仍 pending） | Task 3、9（notes） |
| §8 退回上一节点 | Task 2、4 |
| §9 打回发起人 + 提交 | Task 4、5、6、7、9 |
| §10 共用退回 | Task 4 `returnTo` |
| §11 或签/会签 | Task 3、4 |
| §12 进度 | Task 9 |
| §13 接口 | Task 6 |
| §14 无人可派进异常 | Task 4 |
| §15 不做的 | Task 10 不要测 |
| §16 主规格修订 | Task 10 |
| §17 验收场景 | Task 10 A-01～A-09 |

加签与唯一约束：计划写明用 `notes`，避免和 §12「加签进我处理的」字面冲突——操作者待办还在【我的待办】，进度靠 notes。
