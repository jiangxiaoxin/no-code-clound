# 流程抄送节点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务推进。默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 流程设计能拖抄送节点、挂在开始/审批/分支旁边；离开该节点时把人请进【抄送我的】只读查看；不挡主路、不能改表单、不填意见、不能再连出线。

**Architecture:** 不新建表。抄送写成 `workflow_task`：`status=done`、`action=cc`。`nextStay` 走主出线（目标不是抄送），同时带上本次离开的节点上挂着的抄送 key；`advance` 先写抄送再派下一审批。首页和应用内多一个 `kind=cc` 入口。

**Tech Stack:** NestJS + TypeORM + MySQL；前端 Vue 3 + Element Plus + LogicFlow。后端 Jest，前端纯函数 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-07-workflow-cc-design.md`

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- TypeORM `synchronize: false`。本期不改表结构、不写 SQL。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 容器不要加 `gap`。
- 可见文案用普通标签，不要 `el-text`；间距不要 `el-space`。
- 图标必须先从 `@element-plus/icons-vue` 确认有导出再 import。
- 不删不改使用者已有的注释和 `console.log`。
- 文件 UTF-8 无 BOM；写完中文回读。
- 界面用词：抄送节点、抄送人、不可见、简报、【抄送我的】、已抄送。不要把抄送放进【我的待办】或【我处理的】。
- 未经使用者批准不要用浏览器点页面。
- 手工用例写在 `docs/testcases/`，用人话写点击步骤。

## File Structure

```text
server/src/application/workflow/workflow.types.ts
server/src/application/workflow/workflow.graph.ts
server/src/application/workflow/workflow.graph.spec.ts
server/src/application/workflow/workflow.engine.ts
server/src/application/workflow/workflow.engine.spec.ts
server/src/application/workflow/workflow-definition.service.ts
server/src/application/workflow/dto/query-inbox.dto.ts
server/src/application/workflow/workflow.controller.ts
server/src/application/workflow/workflow-inbox.service.ts
server/src/application/workflow/workflow-inbox.service.spec.ts
front/src/components/workflow-design/workflowGraph.js
front/src/components/workflow-design/workflowValidate.js
front/src/components/workflow-design/workflowValidate.spec.js
front/src/components/workflow-design/fieldAccess.js
front/src/components/workflow-design/WorkflowNodePalette.vue
front/src/components/workflow-design/WorkflowNodeProps.vue
front/src/components/workflow-design/WorkflowDesignPanel.vue
front/src/components/workflow-inbox/WorkflowMiniGraph.vue
front/src/components/workflow-inbox/WorkflowProgressList.vue
front/src/components/workflow-inbox/WorkflowInboxList.vue
front/src/components/workflow-inbox/WorkflowInboxDrawer.vue
front/src/components/workflow-inbox/workflowStatus.js
front/src/components/AppHeader.vue
front/src/views/WorkflowInboxView.vue
front/src/views/AppWorkspaceView.vue
docs/testcases/2026-09-06-workflow-form-test-cases.md
docs/testcases/README.md
docs/guides/2026-09-06-workflow-form-usage.md
```

不新建库表。`action` 列已是 varchar(16)，写入 `cc` 即可。

---

### Task 1: 图校验和主路推进认出抄送

**Files:**
- Modify: `server/src/application/workflow/workflow.types.ts`
- Modify: `server/src/application/workflow/workflow.graph.ts`
- Modify: `server/src/application/workflow/workflow.graph.spec.ts`
- Modify: `front/src/components/workflow-design/workflowValidate.js`
- Modify: `front/src/components/workflow-design/workflowValidate.spec.js`
- Modify: `front/src/components/workflow-design/workflowGraph.js`

**Interfaces:**
- `WorkflowNode` 增加 `type: 'cc'`，带 `approver`、`fieldAccess`、`briefFieldKeys?`（没有或签、没有意见必填）
- `NextStay` 三种结果都带 `ccNodeKeys: string[]`（本次离开的节点上挂着的抄送；出错时为空数组）
- `mainOutgoing(graph, from)`：出线里目标不是抄送的
- `ccOutgoingKeys(graph, from)`：出线里目标是抄送的 key 列表

- [ ] **Step 1: 后端先写会失败的校验/推进测试**

在 `workflow.graph.spec.ts` 增加（沿用文件里已有的 `leaveGraph` / `fields`）：

```ts
const ccHang: WorkflowGraph = {
  nodes: [
    ...leaveGraph.nodes,
    {
      key: 'cc1',
      type: 'cc',
      title: '抄送经理',
      x: 400,
      y: 280,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
      fieldAccess: { field_reason: 'hidden' },
    },
  ],
  edges: [
    ...leaveGraph.edges,
    { key: 'e_cc', from: 'n1', to: 'cc1' },
  ],
};

test('审批多一条连到抄送的线仍能启用', () => {
  expect(validatePublishedGraph(ccHang, fields)).toEqual([]);
});

test('抄送可以不配人', () => {
  const graph = structuredClone(ccHang);
  const cc = graph.nodes.find((node) => node.key === 'cc1');
  if (cc && cc.type === 'cc') cc.approver = { userIds: [], roleIds: [], memberFieldKeys: [] };
  expect(validatePublishedGraph(graph, fields)).toEqual([]);
});

test('抄送有出线不能启用', () => {
  const graph = structuredClone(ccHang);
  graph.edges.push({ key: 'bad', from: 'cc1', to: 'end' });
  expect(validatePublishedGraph(graph, fields).join('')).toMatch(/抄送不能有出线/);
});

test('开始两条主出线不能启用', () => {
  const graph = structuredClone(leaveGraph);
  graph.edges.push({ key: 'extra', from: 'start', to: 'n2' });
  expect(validatePublishedGraph(graph, fields).join('')).toMatch(/主出线/);
});

test('通过部门审批时带上挂着的抄送，主路仍去人事备案', () => {
  const stay = nextStay(ccHang, 'n1', { field_leave_type: '事假' });
  expect(stay.kind).toBe('approve');
  if (stay.kind !== 'approve') return;
  expect(stay.nodeKey).toBe('n2');
  expect(stay.ccNodeKeys).toEqual(['cc1']);
});

test('驳回路径不走 nextStay（本文件只断言通过才带抄送）', () => {
  const stay = nextStay(ccHang, 'n1', {});
  expect(stay.kind).toBe('approve');
});
```

把原测试里「开始必须有且仅有一条出线」的期望改成「主出线」（实现时文案见 Step 3）。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test --prefix server -- workflow.graph.spec
```

Expected: FAIL，`type: 'cc'` 或新文案对不上。

- [ ] **Step 3: 改类型和 `workflow.graph.ts`**

`WorkflowNode` 增加抄送分支。`NextStay` 每条都加 `ccNodeKeys: string[]`。

```ts
function mainOutgoing(graph: WorkflowGraph, from: string): WorkflowEdge[] {
  return outgoing(graph, from).filter((edge) => {
    const to = nodeByKey(graph, edge.to);
    return to?.type !== 'cc';
  });
}

function ccOutgoingKeys(graph: WorkflowGraph, from: string): string[] {
  return outgoing(graph, from)
    .filter((edge) => nodeByKey(graph, edge.to)?.type === 'cc')
    .map((edge) => edge.to);
}
```

校验：

- 开始 / 审批：`mainOutgoing` 必须恰好 1 条。其余出线目标必须是抄送，否则「开始/审批「x」多出来的线只能连到抄送」。文案用「必须有且仅有一条主出线」。
- 分支：只拿 `mainOutgoing` 数条件线和「其他情况」；连到抄送的线不配条件、不算那两条。
- 抄送、结束：不能有出线。抄送文案「抄送不能有出线」。
- `canReachEnd` 跳过 `cc`（和结束一样，抄送是叶子）。
- 抄送人选了已删除的人员字段：和审批同样提示。不配人不报错。

`nextStay`：每次准备离开 `current` 时，把 `ccOutgoingKeys(graph, current)` 推进 `ccNodeKeys`（去重）。选下一条线只用 `mainOutgoing`（分支仍 `pickBranchEdge(mainOutgoing, data)`）。走到结束 / 审批时把已收集的 `ccNodeKeys` 带上。出错返回 `ccNodeKeys: []`。

- [ ] **Step 4: 前端图协议和校验跟上**

`workflowGraph.js`：`NODE_TYPES` 加入 `cc`。`toProductGraph` 在 `type === 'cc'` 时写出和审批相同的 `approver` / `fieldAccess` / `briefFieldKeys`，不要 `signMode`、不要意见勾选。

`workflowValidate.js` 与后端同一套主出线 / 抄送叶子规则（启用前本地拦一层，文案与后端一致）。

`workflowValidate.spec.js` 补：审批挂一条抄送能过；抄送有出线被拦。

- [ ] **Step 5: 跑测试确认通过**

```bash
npm test --prefix server -- workflow.graph.spec
node --test front/src/components/workflow-design/workflowValidate.spec.js
```

Expected: PASS。

---

### Task 2: 离开节点时写抄送任务

**Files:**
- Modify: `server/src/application/workflow/workflow.types.ts`（`TaskAction` 增加 `'cc'`）
- Modify: `server/src/application/workflow/workflow.engine.ts`
- Modify: `server/src/application/workflow/workflow.engine.spec.ts`
- Modify: `server/src/application/workflow/workflow-definition.service.ts`（启用时若抄送配了人，停用/删除的人和角色同样拦住；没配人放过）

**Interfaces:**
- `TaskAction = 'approve' | 'reject' | 'cc'`
- `advance` 在 `nextStay` 成功后调用 `dispatchCarbonCopies(instance, stay.ccNodeKeys, data)`，然后再 `end` 或 `dispatchApprove`
- 抄送任务：`status: 'done'`，`action: 'cc'`，`comment: null`，`finishedAt: now`
- 0 人：不插任务，`notes` 追加「没有可抄送的人」（带节点名：`节点「抄送经理」没有可抄送的人`）；已有相同句子则不再写
- 已有 `instanceId + nodeKey + assigneeId + round` 行则跳过（重试不重复发）

- [ ] **Step 1: 引擎单测先写失败用例**

在 `workflow.engine.spec.ts` 用现有 mock 风格，图为开始→审批 n1→结束，n1 另连 cc1（指定人员 9）：

1. `submit` 后不应给 9 写抄送（抄送挂在审批上，提交还没离开审批）。
2. `completeTask` 通过 n1 后，应 `insert` 一条 `{ nodeKey: 'cc1', assigneeId: 9, status: 'done', action: 'cc' }`，并且仍派下一节点或结束。
3. `completeTask` 驳回 n1：不应 insert 抄送。
4. 抄送 `approver` 为空：通过后不 insert 任务；`notes` 含「没有可抄送的人」。
5. 同一 round 再 `advance`/`retry`：对已有抄送行不再 insert。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test --prefix server -- workflow.engine.spec
```

Expected: FAIL。

- [ ] **Step 3: 实现 `dispatchCarbonCopies`**

放在 `advance` 里，`nextStay` 成功之后、改实例为已通过或派下一审批之前：

```ts
private async dispatchCarbonCopies(
  instance: WorkflowInstance,
  ccNodeKeys: string[],
  data: Record<string, unknown>,
) {
  const unique = [...new Set(ccNodeKeys)];
  let notes = instance.notes;
  for (const nodeKey of unique) {
    const node = instance.graph.nodes.find((item) => item.key === nodeKey);
    if (!node || node.type !== 'cc') continue;
    const resolved = await this.approver.resolve({
      nodeTitle: node.title,
      approver: node.approver || {
        userIds: [],
        roleIds: [],
        memberFieldKeys: [],
      },
      initiatorId: instance.initiatorId,
      recordData: data,
    });
    if (!resolved.userIds.length) {
      const text = `节点「${node.title || node.key}」没有可抄送的人`;
      if (!(notes || []).some((row) => row.text === text)) {
        notes = appendNote(notes, text);
      }
      continue;
    }
    const existing = await this.taskRepo.find({
      where: { instanceId: instance.id, nodeKey, round: instance.round },
    });
    const have = new Set(existing.map((row) => row.assigneeId));
    const rows = resolved.userIds
      .filter((id) => !have.has(id))
      .map((assigneeId) =>
        this.taskRepo.create({
          instanceId: instance.id,
          nodeKey,
          round: instance.round,
          assigneeId,
          status: 'done',
          action: 'cc',
          comment: null,
          finishedAt: new Date(),
        }),
      );
    if (rows.length) await this.taskRepo.save(rows);
  }
  if (notes !== instance.notes) {
    await this.instanceRepo.update({ id: instance.id }, { notes });
    instance.notes = notes;
  }
}
```

`completeTask` 里驳回分支不要调用 `advance`（现有逻辑已是这样，不要改成驳回也 advance）。

启用校验 `validateApproverTargets`：把 `type === 'cc'` 且配了 `userIds`/`roleIds` 的节点一并检查停用；完全没配人的抄送不要报「没有审批人」。

- [ ] **Step 4: 跑引擎和定义相关测试**

```bash
npm test --prefix server -- workflow.engine.spec workflow-definition.service.spec
```

Expected: PASS。

---

### Task 3: 【抄送我的】查询和打开抽屉接口

**Files:**
- Modify: `server/src/application/workflow/dto/query-inbox.dto.ts`
- Modify: `server/src/application/workflow/workflow.controller.ts`
- Modify: `server/src/application/workflow/workflow-inbox.service.ts`
- Modify: `server/src/application/workflow/workflow-inbox.service.spec.ts`

**Interfaces:**
- `kind: 'todo' | 'mine' | 'done' | 'cc'`
- 列表 `cc`：`assigneeId = 当前用户` 且 `action = 'cc'`，按 `finishedAt` 倒序
- 列表 `done`：`status = done` 且 `action` 为 `approve` 或 `reject`（必须排除 `cc`）
- 打开 `cc`：任务必须是当前用户的 `action=cc`；`actions.readOnly=true`，没有通过/驳回；`fieldAccess` 用该抄送节点的（`hidden` 的不给改，其余当只读）
- 卡片 `statusText`：`cc` 为「已抄送」；`time` 用 `finishedAt`
- `count` 仍只计 `pending`，不要把抄送算进待办数字

- [ ] **Step 1: 写 inbox 单测**

覆盖：

1. `query({ kind: 'cc' })` 的 `andWhere` 含 `action = :cc`。
2. `query({ kind: 'done' })` 排除 `cc`。
3. `open(..., 'cc', id)`：任务 `action=cc` 且接收人匹配时返回 `readOnly`；`fieldAccess` 来自抄送节点。
4. `open(..., 'cc', id)`：把一条通过任务当抄送打开 → `NotFoundException`。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test --prefix server -- workflow-inbox.service.spec
```

Expected: FAIL。

- [ ] **Step 3: 改 DTO、controller、inbox service**

`QueryInboxDto.kind` 的 `@IsIn` 加上 `'cc'`。`openInbox` 的 `kind` 联合类型加上 `'cc'`。

`query` 在 `kind === 'cc'` 时：

```ts
qb.andWhere('task.action = :action', { action: 'cc' });
```

`kind === 'done'` 时在现有 `status = done` 上再加：

```ts
qb.andWhere('task.action IN (:...actions)', { actions: ['approve', 'reject'] });
```

`toTaskCards` 增加 `kind: 'todo' | 'done' | 'cc'`。`kind === 'cc'` 时 `statusText = '已抄送'`，`time = task.finishedAt`。

`open`：`kind === 'cc'` 要求 `task.action === 'cc'`。`fieldAccess`：`kind === 'todo'` 仍用当前审批节点；`kind === 'cc'` 用 `task.nodeKey` 对应抄送节点的 `fieldAccess`；其它入口保持 `{}`。`actionsOf` 对 `cc` 与 `done` 相同（全只读）。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test --prefix server -- workflow-inbox.service.spec workflow.engine.spec
```

Expected: PASS。

---

### Task 4: 流程设计里出现抄送节点

**Files:**
- Modify: `front/src/components/workflow-design/WorkflowNodePalette.vue`
- Modify: `front/src/components/workflow-design/WorkflowNodeProps.vue`
- Modify: `front/src/components/workflow-design/WorkflowDesignPanel.vue`
- Modify: `front/src/components/workflow-design/fieldAccess.js`
- Modify: `front/src/components/workflow-inbox/WorkflowMiniGraph.vue`

**Interfaces:**
- 调色板发出 `'cc'`，默认标题「抄送」
- 右侧：节点名称 + 与审批相同的四种抄送人 + 每行只有不可见、简报
- 抄送 / 结束不能当连线起点：`edge:add` 若 `source` 是 `cc` 或 `end`，删掉这条线并提示「抄送和结束不能再连出线」
- `createLf` / 小流程图注册 `'cc'`
- `applyDefaultFieldAccessToGraph` 对 `cc` 也补默认只读

- [ ] **Step 1: 调色板加抄送**

先从 `@element-plus/icons-vue` 确认有 `ChatDotRound` 再 import；没有就换该包里真实存在的相近图标，不要用原生标签凑。按钮文案「抄送节点」，`emit('add', 'cc')` / `emit('drag-start', 'cc')`。

- [ ] **Step 2: 右侧属性**

`WorkflowNodeProps.vue` 增加 `node?.type === 'cc'`：

- 「节点名称」绑定已有 `onTitle`
- 抄送人：复用审批那四种（指定人员、选择角色、同部门勾选、表单人员字段、部门负责人）。不要或签/会签，不要意见必填。
- 字段权限表：表头只留「不可见」「简报」。`WorkflowFieldAccessRow` 的 `options` 对抄送固定 `['hidden']`（没勾不可见 = 只读可见）。简报列仍走现有 `brief`。
- 【删除节点】：抄送可以删（不要当成开始）。

点不可见时 `onAccess(key, checked ? 'hidden' : 'readonly')`。

- [ ] **Step 3: 画布创建和禁止出线**

`createNodeConfig`：`titles.cc = '抄送'`；`type === 'cc'` 时带上空的 `approver`（`sameDeptAsInitiator: true`）和 `withDefaultFieldAccess({}, props.formFields)`。

`createLf` 的注册列表加上 `'cc'`。`WorkflowMiniGraph.vue` 同样注册 `'cc'`。

`bindEvents` 里 `edge:add`：

```js
function onEdgeAdded({ data }) {
  const sourceType = lf.getNodeModelById(data.sourceNodeId)?.type
  if (sourceType === 'cc' || sourceType === 'end') {
    lf.deleteEdge(data.id)
    ElMessage.warning('抄送和结束不能再连出线')
    return
  }
  markDirty()
}
```

（若原来 `edge:add` 只绑了 `markDirty`，改成这个函数。）

`fieldAccess.js` 的 `applyDefaultFieldAccessToGraph`：`node.type === 'approve' || node.type === 'cc'` 都补默认只读。

- [ ] **Step 4: 前端纯函数测试**

`workflowGraph` 若无 spec 可只跑 `workflowValidate.spec.js`：挂抄送的图能过；从抄送连出被拦。

```bash
node --test front/src/components/workflow-design/workflowValidate.spec.js
```

Expected: PASS。

---

### Task 5: 首页和应用内【抄送我的】

**Files:**
- Modify: `front/src/components/AppHeader.vue`
- Modify: `front/src/views/WorkflowInboxView.vue`
- Modify: `front/src/views/AppWorkspaceView.vue`
- Modify: `front/src/components/workflow-inbox/WorkflowInboxList.vue`
- Modify: `front/src/components/workflow-inbox/WorkflowInboxDrawer.vue`
- Modify: `front/src/components/workflow-inbox/workflowStatus.js`
- Modify: `front/src/components/workflow-inbox/WorkflowProgressList.vue`

**Interfaces:**
- 路由仍是 `/inbox/:kind`，`kind=cc` 标题「抄送我的」
- 应用内 `?inbox=cc`，`INBOX_KINDS` 含 `cc`
- 抽屉 `kind === 'cc'`：表单只读、按返回的 `fieldAccess` 藏不可见字段、没有意见框、没有通过/驳回
- 进度：`action === 'cc'` 显示「已抄送」，不拼意见

- [ ] **Step 1: 入口**

`AppHeader.vue`：在【我处理的】旁加【抄送我的】，`goInbox('cc')`。`nav` 把 `kind === 'cc'` 认成当前。不要角标数字。

图标：确认 `@element-plus/icons-vue` 有导出后再用（例如 `ChatDotRound`）。

`WorkflowInboxView.vue`：`kind` 识别 `cc`；标题「抄送我的」。

`AppWorkspaceView.vue`：侧栏【我处理的】下加按钮「抄送我的」；`INBOX_KINDS` 加入 `'cc'`。不要给这段加待办数字。

- [ ] **Step 2: 列表空状态和抽屉**

`WorkflowInboxList.vue` 空状态：首页「还没有抄送」，应用内「本应用还没有抄送」。

`workflowStatus.js` 的 `inboxActionsVisible`：`kind === 'cc'` 返回 `{}`（没有任何通过/驳回/撤回）。

`WorkflowInboxDrawer.vue`：

- 标题：`cc` →「抄送我的」
- `formDisabled`：`kind === 'cc'` 为真
- `gridFieldAccess`：`kind === 'cc'` 时用 `withDefaultFieldAccess(detail.fieldAccess, fields)`（这样不可见会藏掉）
- 不要渲染意见框和通过/驳回（走 `visible`，cc 全空即可）

`WorkflowProgressList.vue`：在通过/驳回旁加 `task.action === 'cc'` → `parts.push('已抄送')`。

- [ ] **Step 3: 前端状态单测（若已有）**

`workflowStatus.spec.js` 若存在，补：`inboxActionsVisible('cc', { canApprove: true })` 仍没有 approve。

```bash
node --test front/src/components/workflow-inbox/workflowStatus.spec.js
```

Expected: PASS。

---

### Task 6: 手工用例和使用说明

**Files:**
- Modify: `docs/testcases/2026-09-06-workflow-form-test-cases.md`
- Modify: `docs/testcases/README.md`
- Modify: `docs/guides/2026-09-06-workflow-form-usage.md`
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`（补一条与标签页/子表的互动即可）

**Interfaces:** 无代码接口。步骤用人话写：点哪里、看见什么。控件同时写调色板名和 `type`。

- [ ] **Step 1: 流程专项补抄送**

在 `2026-09-06-workflow-form-test-cases.md` 增加一节「抄送」，至少：

| 编号 | 步骤 | 期望 |
|---|---|---|
| CC-01 | 【流程设计】左侧出现抄送节点；拖一个，从部门审批再拉一条线到它，指定人员张三，【保存并启用】 | 能启用；下拉里该版启用中 |
| CC-02 | 员工交事假 | 经理【我的待办】有单；张三【抄送我的】多一张；待办数字不含这张抄送 |
| CC-03 | 张三点开抄送抽屉 | 只能看，没有意见框，没有【通过】【驳回】 |
| CC-04 | 经理【驳回】 | 张三那张抄送还在 |
| CC-05 | 部门审批通过；人事备案也挂了抄送李四 | 此时李四【抄送我的】才出现，不是交单时就有 |
| CC-06 | 抄送人不配，仍启用并交单 | 进度有「没有可抄送的人」；【抄送我的】没有新卡片 |
| CC-07 | 从抄送往外拉线后点【保存并启用】 | 顶部拦住「抄送不能有出线」，仍是设计中 |
| CC-08 | 张三既是抄送人又是下一审批人 | 【抄送我的】和【我的待办】各一张 |
| CC-09 | 打开【我处理的】 | 没有这张抄送 |

冒烟 S-05 不必改路径；可在期望里写顶栏仍没有【发布】。

「不要测」补：抄送放进【我的待办】、抄送人改表单或填意见、从结束连出抄送、站外通知。

- [ ] **Step 2: 使用说明和 README**

`2026-09-06-workflow-form-usage.md` §2：左侧还有【抄送节点】；从审批再拉一条线到抄送；抄送人打开首页或应用内【抄送我的】只能看。新增一小节说明四个入口里【抄送我的】做什么。

`docs/testcases/README.md`：流程表单目录说明带上抄送；不要测清单与专项一致。

- [ ] **Step 3: 组合用例**

`2026-08-31-complex-form-manual-tests.md` 补一条：流程设计里抄送节点把标签页 `tabs` 里某字段勾不可见、子表单 `subform` 勾简报；被抄送的人打开【抄送我的】，该字段不出现，卡片摘要能看到子表相关简报约定（没有简报值则不写）。细项仍回流程专项 CC-01～CC-09。

写完打开这些 markdown，确认中文不是乱码。

---

## 自检（对照规格）

| 规格 | 任务 |
|---|---|
| 抄送挂旁边、无出线、主出线恰好一条 | Task 1、Task 4 |
| 可以不配人；运行时 0 人不挡主路 | Task 1、Task 2 |
| 提交离开开始 / 通过离开审批 / 走进分支时发抄送；驳回撤回不发 | Task 2 |
| 重试不重复发 | Task 2 |
| 【抄送我的】独立入口、不进待办/已处理 | Task 3、Task 5 |
| 只读、不可见 + 简报、无意见 | Task 3、Task 4、Task 5 |
| 手工验收 CC-01～CC-09 | Task 6 |
| 不新建表、`action=cc` | Task 2 |
| 站外通知、未读点、结束连出抄送 | 不做 |
