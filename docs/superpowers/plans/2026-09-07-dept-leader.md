# 部门负责人 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务推进。默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 人员管理里能为所选部门指定唯一一位负责人（后来的顶替先前的）；流程审批节点可勾「发起人所属部门的负责人」，提交后把待办派给这个人。

**Architecture:** 负责人记在 `department.leaderUserId`。人员保存时在同一事务里改这一列（换部门则清掉自己在旧部门的负责人身份）。派待办时 `WorkflowApproverService` 按发起人部门读这一列，只收启用账号，与指定人员 / 角色 / 表单人员字段取并集。

**Tech Stack:** NestJS + TypeORM + MySQL；前端 Vue 3 + Element Plus。后端 Jest，前端纯函数 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-07-dept-leader-design.md`

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- TypeORM `synchronize: false`。SQL 写好后停下，等使用者点名该文件并同意才能执行。
- 表名单数下划线、列驼峰、普通索引 `IDX_表名_属性`。
- 模板不写行内 JS；布局优先 flex；`el-dialog` 已有 `draggable` 不要拿掉。
- 可见文案用普通标签，不要用 `el-text`。开关用 `el-switch`。
- 不删不改使用者已有的注释和 `console.log`。
- 文件 UTF-8 无 BOM；写完中文回读。
- 界面用词：**是否为部门领导**（人员表单）、**负责人**（人员列表标签）、**发起人所属部门的负责人**（审批节点）。
- 一个部门只能有一位负责人；后来的直接顶替，不要拦报错。
- 「限定与发起人同部门」只作用于指定角色，不要拿去过滤负责人。
- 停用账号不自动摘掉 `leaderUserId`；派待办时不派给停用的人。
- 不要做正副职、部门编辑弹窗指定负责人、互斥的审批人类型。
- 未经使用者批准不要用浏览器点页面。
- 手工用例写在 `docs/testcases/`，用人话写点击步骤。

## File Structure

```text
server/sql/2026-09-07-dept-leader.sql
server/src/admin/department/department.entity.ts
server/src/admin/department/department.service.ts
server/src/admin/department/department.service.spec.ts
server/src/admin/user/dto/create-admin-user.dto.ts
server/src/admin/user/dto/update-admin-user.dto.ts
server/src/admin/user/admin-user.service.ts
server/src/admin/user/admin-user.service.spec.ts
front/src/components/admin/AdminUserForm.vue
front/src/views/admin/AdminUsersView.vue
front/src/views/admin/AdminDepartmentsView.vue
server/src/application/workflow/workflow.types.ts
server/src/application/workflow/workflow.approver.ts
server/src/application/workflow/workflow.approver.spec.ts
front/src/components/workflow-design/WorkflowNodeProps.vue
front/src/components/workflow-design/WorkflowDesignPanel.vue
front/src/components/workflow-design/workflowGraph.js
front/src/components/workflow-design/workflowValidate.js
front/src/components/workflow-design/workflowValidate.spec.js
docs/superpowers/specs/2026-08-22-admin-organization-rbac-design.md
docs/superpowers/specs/2026-09-05-workflow-form-design.md
docs/testcases/2026-09-07-dept-leader-test-cases.md
docs/testcases/2026-09-06-workflow-form-test-cases.md
docs/testcases/2026-08-31-complex-form-manual-tests.md
docs/testcases/README.md
```

`DepartmentService` 只负责树里带出负责人姓名；写 `leaderUserId` 放在 `AdminUserService` 保存人员的事务里，不要两边都能改。

---

### Task 1: 部门表加 leaderUserId

**Files:**
- Create: `server/sql/2026-09-07-dept-leader.sql`
- Modify: `server/src/admin/department/department.entity.ts`

**Interfaces:**
- `Department.leaderUserId: number | null`
- 索引 `IDX_department_leaderUserId`

- [ ] **Step 1: 写 SQL 和实体列**

```sql
ALTER TABLE `department`
  ADD COLUMN `leaderUserId` int NULL,
  ADD KEY `IDX_department_leaderUserId` (`leaderUserId`);
```

实体在 `sortOrder` 后增加：

```ts
@Column({ type: 'int', nullable: true })
leaderUserId: number | null;
```

- [ ] **Step 2: 停下等执行 SQL**

不要自己跑库。告诉使用者：要先执行 `server/sql/2026-09-07-dept-leader.sql`，否则打开人员管理保存负责人会报未知列。

- [ ] **怎样算做完**

实体和脚本对得上；本任务不提交。

---

### Task 2: 保存人员时写入 / 顶替负责人

**Files:**
- Modify: `server/src/admin/user/dto/create-admin-user.dto.ts`
- Modify: `server/src/admin/user/dto/update-admin-user.dto.ts`
- Modify: `server/src/admin/user/admin-user.service.ts`
- Modify: `server/src/admin/user/admin-user.service.spec.ts`

**Interfaces:**
- 创建 / 更新 DTO 增加可选 `isDeptLeader?: boolean`（缺省当 false）
- `AdminUserItem.departments` 每项增加 `isLeader: boolean`
- `create` / `update` 返回的对象可带 `leaderReplaceHint?: string`（发生顶替才有）

- [ ] **Step 1: 先写失败的单测（再改实现）**

在 `admin-user.service.spec.ts` 给 `manager` 补 `find` / `update`（按实体查部门）。给 `departmentRepo.findOne`。现有 `create` 调用要能带 `isDeptLeader: true`。

要覆盖的行为（界面语言对照规格 §2）：

1. 新建人员，选了部门并 `isDeptLeader: true`，该部门原来没有负责人 → 该部门 `leaderUserId` 写成新用户 id，返回值没有 `leaderReplaceHint`。
2. 同一部门再把另一个人设成负责人 → 部门 `leaderUserId` 改成新人；返回 `leaderReplaceHint` 为 `已将研发部原负责人张三替换为李四`（部门名、原负责人姓名、当前保存的人姓名用测试数据填进去）。
3. 把负责人的部门清空 → 原部门 `leaderUserId` 变成 null。
4. 把负责人调到另一个部门且新部门开关为关 → 只清旧部门，新部门不写他。
5. `isDeptLeader: true` 但 `departmentId` 为 null → 不当成负责人，不报错。
6. `toItem`：部门 `leaderUserId` 等于该用户时 `departments[0].isLeader === true`，否则 false。
7. 更新时带了 `isDeptLeader` 却没有 `users.assign_departments` → `ForbiddenException`（和改部门同一条权限）。

现有「hashes password and saves one department」不要坏。`create` 里没传 `isDeptLeader` 时行为与现在相同。

- [ ] **Step 2: 跑测，确认新用例失败**

Run: `cd server; npx jest src/admin/user/admin-user.service.spec.ts --no-coverage`

Expected: 新用例失败（还没有 `isDeptLeader` / `leaderUserId` 逻辑）。

- [ ] **Step 3: DTO**

两个 DTO 都加：

```ts
@IsOptional()
@Transform(({ value }) => {
  if (value === '' || value === undefined) return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return value;
})
@IsBoolean()
isDeptLeader?: boolean;
```

- [ ] **Step 4: 保存事务里改部门负责人**

在 `replaceRelations` 之后、事务提交前调用（创建、更新都要走）。权限：`update` 里若 `dto.isDeptLeader !== undefined` 且没有 `users.assign_departments`，与改部门一样抛 `ForbiddenException`。

推荐抽私有方法 `applyDeptLeader(manager, userId, displayName, departmentId, isDeptLeader): Promise<string | undefined>`：

1. 查出所有 `leaderUserId = userId` 的部门。若其 `id` 不是本次 `departmentId`，把这些行的 `leaderUserId` 置 null（换部门 / 清空部门）。
2. `departmentId == null`：结束。`isDeptLeader` 为 true 也忽略。
3. `isDeptLeader === true`：加载目标部门。若现有 `leaderUserId` 存在且不等于当前用户，查出原负责人 `displayName` 和部门 `name`，拼提示 `已将${部门名}原负责人${原姓名}替换为${当前姓名}`。然后把该部门 `leaderUserId` 写成当前用户。
4. `isDeptLeader === false` 或创建时没传（当 false）：若目标部门当前 `leaderUserId` 就是自己，置 null（自己关掉开关）。
5. 更新时 `departmentId === undefined`（调用方没改部门）：用该用户当前 `user_department` 的部门当目标部门；若本次也没传 `isDeptLeader`，只做第 1 步里「已不属于该部门」的清理——实际上没改部门则第 1 步不会清当前部门。没传 `isDeptLeader` 时不要动当前部门的负责人。

`create` / `update` 把 hint 挂到返回对象：`{ ...(await this.toItem(saved)), leaderReplaceHint }`。

`toItem` 里 `departments` 映射为 `{ id, name, isLeader: department.leaderUserId === user.id }`。

事务里用 `manager.getRepository(Department)` / `User`，不要用类上已经结束的 repo 去写，避免事务外提交。

- [ ] **Step 5: 再跑单测**

Run: `cd server; npx jest src/admin/user/admin-user.service.spec.ts --no-coverage`

Expected: 全部通过。

- [ ] **怎样算做完**

人员保存能指定 / 顶替 / 取消负责人；列表接口能看出谁是负责人；没有分配部门权限不能改这个开关。

---

### Task 3: 部门树带出负责人姓名

**Files:**
- Modify: `server/src/admin/department/department.service.ts`
- Modify: `server/src/admin/department/department.service.spec.ts`
- Modify: `server/src/admin/admin.module.ts`（若 `DepartmentService` 要注入 `User`：`User` 已在 `forFeature` 里，只需构造函数注入）

**Interfaces:**
- `DepartmentItem.leader: { id: number; displayName: string; status: 'active' | 'disabled' } | null`

- [ ] **Step 1: 先扩展 tree 单测**

现有 tree 用例的部门行补 `leaderUserId: null`，断言 `leader: null`。再加一条：研发 `leaderUserId: 9`，`userRepo.find` 返回 `{ id: 9, displayName: '张三', status: 'disabled' }`，树里研发节点 `leader` 为 `{ id: 9, displayName: '张三', status: 'disabled' }`。

- [ ] **Step 2: 跑测，确认失败**

Run: `cd server; npx jest src/admin/department/department.service.spec.ts --no-coverage`

- [ ] **Step 3: tree() 里批量查用户**

收集非空 `leaderUserId`，`userRepo.find({ where: { id: In(ids) } })`。拼进 `toItem` / 建树那一段。找不到用户则 `leader: null`（当账号已不存在）。`create` / `update` 部门走的 `toItem` 同样带 `leader`（新建部门为 null）。

- [ ] **Step 4: 再跑单测**

Expected: 全部通过。

- [ ] **怎样算做完**

打开部门管理接口，每个部门能看到当前负责人姓名和是否停用；没有负责人则为空。

---

### Task 4: 人员 / 部门管理界面

**Files:**
- Modify: `front/src/components/admin/AdminUserForm.vue`
- Modify: `front/src/views/admin/AdminUsersView.vue`
- Modify: `front/src/views/admin/AdminDepartmentsView.vue`

**Interfaces:**
- 表单字段 `isDeptLeader` 布尔，默认 `false`
- 保存 payload 在能分配部门时带 `departmentId` 和 `isDeptLeader`
- 创建 / 更新接口若返回 `leaderReplaceHint`，用它替换默认成功文案

- [ ] **Step 1: 人员表单**

部门 `el-form-item` 下面增加（仅 `form.departmentId` 有值时显示）：

```vue
<el-form-item v-if="form.departmentId" label="是否为部门领导">
  <el-switch
    v-model="form.isDeptLeader"
    :disabled="!canAssignDepartments"
  />
</el-form-item>
```

`watch` 打开弹窗时：`form.isDeptLeader = Boolean(props.user?.departments?.[0]?.isLeader)`。新建为 `false`。

`watch` 部门：从有到无时把 `isDeptLeader` 置 `false`。从无到有或换部门时也置 `false`（换部门不会把旧部门的「是负责人」带到新部门；若编辑的人本来就是**当前**部门负责人，第一次打开不要被这条清掉——只在 `departmentId` 相对打开时的初值发生变化时清）。

实现建议：打开弹窗时记下 `openedDepartmentId`。部门 `el-tree-select` 的 `@change` 抽函数 `onDepartmentChange`：若新值不等于 `openedDepartmentId` 则 `isDeptLeader = false`；新值为空也是 false。

`onSubmit`：能分配部门时 `payload.isDeptLeader = Boolean(form.departmentId) && form.isDeptLeader`。

- [ ] **Step 2: 人员列表部门列**

标签文案：`item.isLeader ? `${item.name}（负责人）` : item.name`。不要另起一列。

- [ ] **Step 3: 保存提示**

`onSubmit` 使用接口返回值：

```js
const result = editing.value
  ? await updateAdminUserApi(editing.value.id, payload)
  : await createAdminUserApi(payload)
ElMessage.success(result?.leaderReplaceHint || (editing.value ? '已保存人员' : '已创建人员'))
```

确认 `http` 封装返回的是接口 body（与现有 `createAdminUserApi` 一致）。

- [ ] **Step 4: 部门管理树**

在「部门名称」后加一列「负责人」，宽约 140：

- 有 `row.leader`：显示 `displayName`；`status === 'disabled'` 时后面加「（已停用）」
- 没有：显示 `-`

不要改部门新增 / 编辑弹窗。

- [ ] **怎样算做完**

新增人员：不选部门没有开关；选了默认关；打开保存后列表带「（负责人）」；同一部门把另一个人打开开关，提示替换句，前一个人标签不再带负责人。清空部门后原部门树的负责人列为空。编辑已是负责人的人，开关是开着的。没有分配部门权限时开关灰掉。

---

### Task 5: 派待办认部门负责人

**Files:**
- Modify: `server/src/application/workflow/workflow.types.ts`
- Modify: `server/src/application/workflow/workflow.approver.ts`
- Modify: `server/src/application/workflow/workflow.approver.spec.ts`
- Modify: `server/src/application/application.module.ts`（`WorkflowApproverService` 注入 `Department`：实体已在 `forFeature`）

**Interfaces:**
- `ApproverRule.deptLeaderOfInitiator?: boolean`（缺省当 false）
- `resolve` 签名不变

- [ ] **Step 1: 先写失败的单测**

`workflow.approver.spec.ts` 注入 `Department` repo（`findOne`）。现有用例的 `approver` 对象不传新字段，行为不变。

新增：

1. 只勾 `deptLeaderOfInitiator: true`。发起人 5 在部门 1，部门 `leaderUserId: 21`，21 启用 → `userIds` 含 21。
2. 负责人 23 已停用 → `userIds` 空，`emptyReason` 为 `节点「部门审批」没有可用的发起人部门负责人`。
3. 发起人没有部门 → 同上文案（不要写成角色那条「按角色全公司派发」，也**不要**设 `unrestrictedByMissingDept`）。
4. 同时指定人员 9 且负责人停用 → `userIds` 仍有 9，没有 emptyReason。
5. 只勾角色且部门交集为空、**没勾**负责人 → 仍是现在的「在发起人所在部门没有可用的审批人」。
6. 指定人员含 21、同时也勾负责人 21 → `userIds` 里 21 只出现一次。

- [ ] **Step 2: 跑测，确认新用例失败**

Run: `cd server; npx jest src/application/workflow/workflow.approver.spec.ts --no-coverage`

- [ ] **Step 3: 实现**

`ApproverRule` 增加 `deptLeaderOfInitiator?: boolean`。

`resolve` 在收完指定人员、表单人员、角色之后：

```ts
const othersConfigured =
  (input.approver.userIds || []).length > 0 ||
  (input.approver.roleIds || []).length > 0 ||
  (input.approver.memberFieldKeys || []).length > 0;
if (input.approver.deptLeaderOfInitiator) {
  const leaderIds = await this.resolveInitiatorDeptLeader(input.initiatorId);
  leaderIds.forEach((id) => collected.add(id));
  if (!leaderIds.length && !othersConfigured && collected.size === 0) {
    return {
      userIds: [],
      emptyReason: `节点「${input.nodeTitle}」没有可用的发起人部门负责人`,
    };
  }
}
```

`resolveInitiatorDeptLeader`：`user_department` 找发起人部门 → `department.leaderUserId` → `activeUserIds([leaderUserId])`。任一步没有就返回 `[]`。不要在发起人没部门时退化成全公司。

空名单且没勾负责人：保持现在的角色交集 / 通用文案，一字不改。

- [ ] **Step 4: 再跑审批人单测，并跑引擎单测防回归**

Run: `cd server; npx jest src/application/workflow --no-coverage`

Expected: 全部通过。

- [ ] **怎样算做完**

只配负责人时能派到启用中的那个人；派不到时异常文案带「没有可用的发起人部门负责人」；和其他来源叠用时有人就能走。

---

### Task 6: 流程设计开关与发布校验

**Files:**
- Modify: `front/src/components/workflow-design/WorkflowNodeProps.vue`
- Modify: `front/src/components/workflow-design/WorkflowDesignPanel.vue`（新建审批节点默认 `deptLeaderOfInitiator: false`）
- Modify: `front/src/components/workflow-design/workflowGraph.js`（缺省补 false，旧草稿没有该字段当 false）
- Modify: `front/src/components/workflow-design/workflowValidate.js`
- Modify: `front/src/components/workflow-design/workflowValidate.spec.js`

- [ ] **Step 1: 发布校验单测**

`workflowValidate.spec.js` 增加：

- 审批人 `userIds/roleIds/memberFieldKeys` 都空，但 `deptLeaderOfInitiator: true` → 错误列表**没有**「没有审批人」
- 四个来源都空 → 仍有「没有审批人」

Run: `cd front; node --test src/components/workflow-design/workflowValidate.spec.js`

Expected: 新用例失败。

- [ ] **Step 2: 改校验**

```js
const hasPeople =
  (rule.userIds || []).length > 0 ||
  (rule.roleIds || []).length > 0 ||
  (rule.memberFieldKeys || []).length > 0 ||
  Boolean(rule.deptLeaderOfInitiator)
```

- [ ] **Step 3: 属性面板开关**

放在「表单内人员字段」下面、「多人时」上面。文案：**发起人所属部门的负责人**。`el-checkbox`，`:model-value="Boolean(node.approver?.deptLeaderOfInitiator)"`，`@change` 抽 `onDeptLeader`，写入 `approver.deptLeaderOfInitiator`。不要绑到「限定与发起人同部门」。

新建节点在 `WorkflowDesignPanel.vue` 的 `createNodeConfig` 里 `deptLeaderOfInitiator: false`。`workflowGraph.js` 读草稿时缺字段当 false。

- [ ] **Step 4: 再跑前端相关测试**

Run: `cd front; node --test src/components/workflow-design/*.spec.js`

Expected: 全部通过。

- [ ] **怎样算做完**

审批节点能勾这个开关并保存草稿 / 发布；只勾它也可以点发布；旧图没这个字段仍能打开，等同没勾。

---

### Task 7: 文档与手工用例

**Files:**
- Modify: `docs/superpowers/specs/2026-08-22-admin-organization-rbac-design.md`（本期不实现里删掉「部门负责人」这一项，加一句见 2026-09-07 规格；岗位、汇报关系、兼任仍不做）
- Modify: `docs/superpowers/specs/2026-09-05-workflow-form-design.md` §7.1 增加第四种来源；§7.2 删掉「发起人部门的负责人」；不要改「限定同部门」那段
- Create: `docs/testcases/2026-09-07-dept-leader-test-cases.md`
- Modify: `docs/testcases/2026-09-06-workflow-form-test-cases.md`
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`
- Modify: `docs/testcases/README.md`

- [ ] **Step 1: 专项用例**

文件开头写预备：管理后台要有启用部门「研发部」，启用人员甲、乙、丙。丙没有部门。

至少覆盖：

| 编号 | 步骤（界面） | 期望 |
|---|---|---|
| S-01 | 新增人员，不选部门 | 没有「是否为部门领导」 |
| S-02 | 选研发部，开关默认关，保存甲 | 列表部门为「研发部」，没有「负责人」 |
| S-03 | 再编辑甲，打开开关保存 | 列表变成「研发部（负责人）」；部门管理研发部负责人列是甲 |
| S-04 | 新增乙到研发部并打开开关保存 | 成功提示含「已将研发部原负责人甲替换为乙」；甲不再带负责人；树上也是乙 |
| S-05 | 编辑乙，清空部门保存 | 研发部负责人列为空 |
| S-06 | 停用乙（乙仍是负责人） | 部门树显示「乙（已停用）」；人员列表仍标负责人 |
| F-01 | 请假单审批节点只勾「发起人所属部门的负责人」，发布，甲挂研发部并设为负责人，甲的同事提交事假 | 甲的【我的待办】有这张 |
| F-02 | 把负责人换成乙后再提一张 | 新单在乙的待办，不在甲 |
| F-03 | 丙（无部门）提交，节点只勾了负责人 | 单据异常，文案含「没有可用的发起人部门负责人」；【重试】在把丙调进研发部并指定乙为负责人后能派给乙 |
| F-04 | 节点同时指定张三和负责人，负责人停用 | 待办仍在张三那里，不是异常 |

- [ ] **Step 2: 流程专项 / 组合 / README**

流程专项「画布与发布」补一条：审批节点只勾负责人也能发布。组合用例补一条标签页里的请假字段不挡负责人派单（能选主表人员字段的同时勾负责人即可，点明不要测子表列当负责人）。README 目录表加上专项；执行顺序插在流程专项之后（先有负责人再测 F-01）；开始前准备写上要先执行 `server/sql/2026-09-07-dept-leader.sql`。

- [ ] **Step 3: 回读中文**

打开新建和改过的 md，确认没有乱码。

- [ ] **怎样算做完**

设计和用例与界面一致；旧规格不再写「组织里没有部门负责人」。

---

## 建议自测（实现者本机，不要用浏览器工具）

```text
cd server
npx jest src/admin/user/admin-user.service.spec.ts src/admin/department/department.service.spec.ts src/application/workflow --no-coverage

cd front
node --test src/components/workflow-design/*.spec.js
```

SQL 必须等使用者同意后再执行。
