# 流程表单与应用权限第 2 期代码审查

日期：2026-09-06
审查对象：提交 `1f98f33`（流程表单 + 应用权限第 2 期，127 个文件）
对照规格：`docs/superpowers/specs/2026-09-05-workflow-form-design.md`、`docs/superpowers/specs/2026-09-05-permission-design.md`
对照计划：`docs/superpowers/plans/2026-09-06-workflow-form.md`、`docs/superpowers/plans/2026-09-06-app-permission.md`

本文只记录审查结论，不含修改代码。每条问题都写清**用户在界面上会看到什么**，以及对应的文件和行号。

> 2026-09-07 补记：下面「必须修」的 10 条已全部改完，改法见文末「修复记录」。本文正文保留审查当时的描述，方便对照。

---

## 一句话结论

**权限第 2 期可以按现有行为验收；流程引擎的【重试】和并发路径必须先修，否则单据会绕过审批。**

- 应用权限：判定公式、「应用不存在」伪装、移交所有者、删应用顺序、首页列表、字典读写分离都与规格一致，主路径没有发现越权。
- 流程引擎：【重试】会**跳过**出问题的审批节点；【通过】与【撤回】/【驳回】同时发生会互相覆盖；派待办失败会让单据卡在「审批中」且没有任何待办。
- 前端：权限相关的按钮显隐是按接口返回的字段做的，没有靠前端猜身份。但**分支连线的条件在界面上配了存不上**，流程画布卸载时没有销毁。

---

## 怎么验证的

- 跑了后端全量单测：**33 个测试文件、314 条全部通过**（`cd server; npx jest`）。输出里的 `mongo down`、`drop form collection failed` 是用例故意造的失败场景日志，不是测试失败。
- 逐行读了引擎、图算法、审批人解析、权限判定、以及前端流程设计 / 待办 / 应用后台各页。
- 下面标「已确认无问题」的部分，都写了当时是怎么核对的。

---

## 必须修（会让单据走错或数据对不上）

### 1. 点【重试】会跳过出问题的那个审批节点

**界面上会看到什么：** 【请假单】走到「部门审批」，这个角色下暂时没有启用的人，单据进「异常」。发起人或所有者点【重试】，单据**不会**重新去找部门经理，而是直接跳到下一个节点、甚至直接变成「已通过」。**部门审批被绕过了。**

同一个问题也让手工用例 E-03（派发后把唯一审批人停用 →【重试】后重新派人）做不到：取消掉停用者的待办之后，单据同样往下跳，不会重新解析这个节点的审批人。

**为什么：** 找不到审批人时，代码已经把「当前节点」写成了这个审批节点，然后才标异常：

```352:386:server/src/application/workflow/workflow.engine.ts
    const where =
      fromNodeKey === 'start'
        ? { id: instance.id }
        : { id: instance.id, currentNodeKey: fromNodeKey };
    const claimed = await this.instanceRepo.update(where, {
      currentNodeKey: stay.nodeKey,   // 已经写成这个审批节点
      // ...
    });
    // ...
    if (!resolved.userIds.length) {
      await this.markError(instance, resolved.emptyReason || `...`, stay.visited);
```

而【重试】是从「当前节点」继续往下走：

```299:302:server/src/application/workflow/workflow.engine.ts
    if (instance.currentNodeKey) {
      await this.cancelDisabledPending(instance);
    }
    await this.advance(instance, instance.currentNodeKey ?? 'start');
```

`advance` 用的 `nextStay` 是从传入节点的**出线**往下找，永远不会停在传入节点自己身上：

```266:293:server/src/application/workflow/workflow.graph.ts
export function nextStay(
  graph: WorkflowGraph,
  fromNodeKey: string,
  data: Record<string, unknown>,
): NextStay {
  // ...
  let edges = outgoing(graph, current);   // 从出线往下走
```

「审批人已经点过通过、只是写库失败」这两种重试（`retryStep` 是 `mongo` 或 `advance`）往下走是对的。**只有「没派出去 / 图走不通」这一种，必须重新解析当前节点，不能复用「通过后往下走」这条路。**

---

### 2. 审批人改的内容在【重试】时补不回来

**界面上会看到什么：** 审批人在待办里改了「事由」再点【通过】，写库失败，单据进异常。点【重试】后，他刚才改的内容没了。如果那个字段是必填、原来又是空的，【重试】会一直提示「请填写事由」，单据卡住；此时【撤回】也已经被挡住（系统认为有人批过了），发起人自己也救不回来。

**为什么：** 通过时只记了「走到第几步」，没有把审批人填的内容存下来：

```220:225:server/src/application/workflow/workflow.engine.ts
    await this.instanceRepo.update(
      { id: instance.id },
      { retryStep: 'mongo', hasApproved: true },
    );
    await this.writeBack(instance, node, input.dataPatch, input.actorId);
```

重试时补写传的是空对象：

```281:287:server/src/application/workflow/workflow.engine.ts
    if (instance.retryStep === 'mongo') {
      // ...
      if (node) {
        await this.writeBack(instance, node, {}, instance.initiatorId);
      }
```

---

### 3. 【通过】和【撤回】可以同时成功，两边都提示成功

**界面上会看到什么：** 审批人点【通过】的同一瞬间，发起人点【撤回】。审批人看到「已通过」，发起人看到「已撤回」。之后【数据管理】里这条数据的状态和【我发起的】里显示的可能对不上。

**为什么：** 撤回的判断条件是「还没有人批过」，而「有人批过」这个标记是在待办被标成已处理**之后**才写的，中间有一段窗口两边都能通过判断：

```187:196:server/src/application/workflow/workflow.engine.ts
    const done = await this.taskRepo.update(
      { id: task.id, status: 'pending', assigneeId: input.actorId },
      { status: 'done', /* ... */ },
    );
    if (!done.affected) throw new ConflictException('这条待办已处理');
```

```250:256:server/src/application/workflow/workflow.engine.ts
    const cancelled = await this.instanceRepo.update(
      {
        id: input.instanceId,
        initiatorId: input.actorId,
        status: In(['running', 'error']),
        hasApproved: false,     // 此刻还是 false
      },
```

推进到下一个审批节点时有「抢占」保护（撤回后推进会失败并静默返回），所以不会真的派出下一轮待办。但**写回 MongoDB 用的是内存里那份旧状态**，会把 Mongo 写成「审批中」，而 MySQL 已经是「草稿」：

```449:452:server/src/application/workflow/workflow.engine.ts
      await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
        workflowStatus: instance.status === 'error' ? 'running' : instance.status,
```

---

### 4. 【驳回】和走到「结束」时没有状态保护，会覆盖别人的结果

**界面上会看到什么：** 或签节点上两个人几乎同时点，一个【通过】一个【驳回】，最终状态取决于谁**后**写库。已经驳回的单也可能被改写成「已通过」。别的表用【选择数据】挑记录时，只列已通过，可能挑到本该驳回的单。

**为什么：** 这两处更新只按 id，没有要求「当前还在审批中」：

```205:213:server/src/application/workflow/workflow.engine.ts
      await this.instanceRepo.update(
        { id: instance.id },
        { status: 'rejected', currentNodeKey: null, endedAt: new Date(), retryStep: null },
      );
```

```328:339:server/src/application/workflow/workflow.engine.ts
      await this.instanceRepo.update(
        { id: instance.id },
        { status: 'approved', currentNodeKey: null, /* ... */ },
      );
```

推进到下一个**审批节点**时有 `currentNodeKey` 抢占，但走到**结束**时没有同样的抢占。

---

### 5. 派待办失败后，单据卡在「审批中」却没有任何待办，也没有【重试】

**界面上会看到什么：** 提交时数据库抖一下，【我发起的】显示「审批中」，但谁的【我的待办】里都没有这张单，卡片上也**没有**【重试】按钮（只有「异常」才会出现）。规格明确要求不能出现这种「审批中但没人有待办」。

**为什么：** 派待办这一步没有兜住异常，此时状态已经被写成「审批中」了：

```388:396:server/src/application/workflow/workflow.engine.ts
    await this.taskRepo.insert(
      resolved.userIds.map((assigneeId) => ({
        instanceId: instance.id,
        nodeKey: stay.nodeKey,
        round: instance.round,
        assigneeId,
        status: 'pending' as const,
      })),
    );
```

而【重试】只认「异常」状态，非异常直接什么都不做：

```279:280:server/src/application/workflow/workflow.engine.ts
    const instance = await this.requireInstance(input.instanceId);
    if (instance.status !== 'error') return;
```

---

### 6. 审批人全部停用后，单据不会变「异常」，因此点不到【重试】

**界面上会看到什么：** 唯一的审批人被停用，抽屉的进度里能看到「审批人已停用」（这部分是对的），但单据一直是「审批中」，【我发起的】里**没有**【重试】。如果会签里已经有人批过，【撤回】也不行 —— 这张单就永久卡住了。

**为什么：** 代码里没有任何地方把「审批中」改成「异常」；重新解析审批人只发生在已经是异常、且走进重试的时候。而按钮只看状态：

```241:244:server/src/application/workflow/workflow-inbox.service.ts
      canCancel:
        (instance.status === 'running' || instance.status === 'error') &&
        !instance.hasApproved,
      canRetry: instance.status === 'error',
```

---

### 7. 把停用的审批人重新启用后再【重试】，接口报数据库错误

**界面上会看到什么：** 经理被停用 → 单据异常 → 管理员把他重新启用 → 点【重试】，提示一个看不懂的数据库错误，待办出不来。

**为什么：** 待办的唯一约束不含状态，被取消掉的那条也算占位，同一轮给同一个人再派就撞唯一键；代码用的是普通插入，冲突会直接抛出去（计划里写的是遇冲突忽略）：

```11:15:server/src/application/workflow/workflow-task.entity.ts
@Index(
  'uk_workflow_task_instanceId_nodeKey_assigneeId_round',
  ['instanceId', 'nodeKey', 'assigneeId', 'round'],
  { unique: true },
)
```

---

### 8. 分支连线的条件在界面上配了存不上

**界面上会看到什么：** 【流程设计】点一条从分支出来的连线，点【添加过滤条件】配好条件、或者改「符合全部 / 符合任一」，再点【保存】。刷新后条件没了，或者仍是原来那套。发布时可能提示连线没有条件，或者单据走错分支跑到「其他情况」。

**为什么：** 传给条件组件的是一个**每次都新建对象**的计算属性，而条件组件是就地改传进去的对象、不发事件；同时这里写好的 `onFilters` 从头到尾没有绑到组件上：

```12:17:front/src/components/workflow-design/WorkflowEdgeProps.vue
      <FormFilterConditions
        v-if="!edge.isDefault"
        :filters="filterModel"
        :source-fields="conditionFields"
        :form-fields="conditionFields"
      />
```

```42:45:front/src/components/workflow-design/WorkflowEdgeProps.vue
const filterModel = computed(() => ({
  match: props.edge?.when?.logic === 'any' ? 'any' : 'all',
  conditions: props.edge?.when?.items || [],
}))
```

条件组件确实是就地改的（`front/src/components/form-design/FormFilterConditions.vue` 第 317–326 行 `props.filters.conditions.push / splice`）。所以：**新连线第一次加条件一定丢**（`|| []` 造的是临时数组），**「符合全部 / 任一」一定改不了**（计算属性重新求值就还原）。

顺带一处：这里没给条件组件传 `appId`，条件里的字典下拉可能是空的。

---

### 9. 应用后台换应用时不重新加载，可能把权限配到另一个应用上

**界面上会看到什么：** 从【人事】的【配置权限】直接改网址（或从别处跳）到另一个应用的同一页，名单**还是【人事】的**，但此时点【移除】【添加人员】，改的是新应用的权限。**会把权限配错到别的应用上。**

**为什么：** 这两个新页只在挂载时读一次，没有跟着应用 id 变化重新读：

```208:208:front/src/views/app-backend/AppConfiguratorsView.vue
onMounted(load)
```

```281:281:front/src/views/app-backend/AppAccessScopesView.vue
onMounted(load)
```

同目录里更早的【字典管理】是有这层保护的，可以照着它做（`front/src/views/app-backend/AppDictionariesView.vue` 第 368–373 行 `watch(appId, ...)`）。

---

### 10. 流程画布卸载时没有销毁，来回切会越来越卡

**界面上会看到什么：** 反复进出【流程设计】、反复打开待办抽屉，页面逐渐变卡；设计页的键盘快捷键还可能残留到别的页面。

**为什么：** 卸载时只把变量置空，没有调 LogicFlow 的 `destroy()`（设计页还开了键盘绑定）：

```288:291:front/src/components/workflow-design/WorkflowDesignPanel.vue
onBeforeUnmount(() => {
  // ...
  lf = null
})
```

小流程图同样（`front/src/components/workflow-inbox/WorkflowMiniGraph.vue` 第 44–68 行），而它在每次打开待办 / 数据详情抽屉时都会新建一个实例。

---

## 建议修（健壮性、体验、与规格的细小偏差）

| # | 问题 | 界面上的后果 | 位置 |
|---|---|---|---|
| 11 | 草稿第一次提交用的是存草稿那会儿的流程图 | 先存草稿 → 再发布新流程（加了「人事备案」）→ 再提交，新节点不会出现 | `workflow.engine.ts` 109–133 |
| 12 | 走过的节点被整段覆盖，不是累加 | 部门审批通过后，抽屉顶部小流程图上「部门审批」不再显示成走过了 | `workflow.engine.ts` 356–362 |
| 13 | 【驳回】【撤回】【结束】写 Mongo 失败没有补救 | 点【驳回】报错后，【数据管理】里仍显示「审批中」，既不能再驳一次（待办已处理），也没有【重试】 | `workflow.engine.ts` 199–218、249–276 |
| 14 | 抽屉接口把整份数据都给审批人，隐藏字段只靠前端不画 | 审批人抓包能看到本节点标成隐藏的字段（如内部备注） | `workflow-inbox.service.ts` 156–157 |
| 15 | 非待办处理人点【通过】返回的是 409「这条待办已处理」 | 猜到待办编号的人能确认这张单存在；规格要求「待办不存在」 | `workflow-instance.service.ts` 99–130 |
| 16 | 异常且已有人批过时，【再次提交】仍能开新一轮 | 同样的单，【撤回】被拒但【再次提交】可以，两套口径 | `workflow.engine.ts` 109–125 |
| 17 | 打开一条记录会把权限判定做两遍 | 【数据管理】点开一行偏慢；规格 §13 要求同一次请求内缓存判定 | `form-record.service.ts` 204–220、480–481 |
| 18 | 加入配置名单与删掉他的「人员范围」不在同一事务 | 加人成功、删范围失败时，以后把他从【配置权限】移除，确认框说他会失去使用权，首页却还看得到 | `app-access-admin.service.ts` 121–132 |
| 19 | 移交时事务外读所有者，没有按行锁 | 两人同时移交同一应用，可能有人既不是所有者、首页也没有这个应用 | `app-access-admin.service.ts` 266–287 |
| 20 | 删应用时 Mongo 之后的清理不在一个事务 | 中途失败：别人首页看不到这个应用了，所有者还看得到一个空应用 | `application.service.ts` 175–190 |
| 21 | 【使用范围】连加多条，中途失败会半成功 | 选 3 个角色，第 2 个失败，刷新后发现加进去一部分 | `AppAccessScopesView.vue` 208–259 |
| 22 | 部门 / 角色被删后只显示 id | 删掉【研发部】后，使用范围里看不到「研发部」四个字，只有部门 id | `app-access-admin.service.ts` 345–347 |
| 23 | 数据管理的【重试】只有 loading，没有防连点守卫 | 连点可能发两次重试（待办抽屉那边是有守卫的） | `FormRecordDetailDrawer.vue` 238–251 |
| 24 | 【配置权限】的【移除】没有 loading | 连点会打两次删除，第二次弹一次失败提示 | `AppConfiguratorsView.vue` 167–188 |
| 25 | 切卡片 / 切表 / 点行时旧请求会盖新数据 | 连点两张待办卡片，抽屉可能显示后一张、数据是前一张，容易对错单点【通过】 | `WorkflowInboxDrawer.vue` 195–210；`WorkflowInboxList.vue` 69–86；`FormRecordManage.vue` 206–215；`FormDesignView.vue` 128–154 |
| 26 | 详情接口失败时退回用列表行打开抽屉 | 列表行没有 `canConfigure` 和流程实例，发起人可能看不到【重试】，进度也缺一块 | `FormRecordManage.vue` 210–215 |
| 27 | 人员字段只认数字编号 | 历史数据里人员存成字符串时，节点会报「没有可用的审批人」，其实人填过了 | `workflow.approver.ts` |
| 28 | 表单被删后仍用一个空壳继续写库 | 表删了再点【通过】/【重试】，可能写出缺字段定义的数据，或抛难读的错 | `workflow.engine.ts` 419–421 |

### 违反项目规则的写法

| 规则 | 位置 |
|---|---|
| 禁止行内 JS（模板里赋值 / `$event` / 箭头函数 / `router.push`） | `HomeView.vue` 109、141、45；`AppWorkspaceView.vue` 8、88；`AppBackendLayout.vue` 9 |
| 不使用 `el-text` / `el-space` | `HomeView.vue` 7、10；`AppWorkspaceView.vue` 10、83 |
| 优先 `el-button` 而不是原生 `<button>` | `WorkflowNodePalette.vue` 4–15；`WorkflowInboxCard.vue` 2；`AppWorkspaceView.vue` 14–38 |

新增的 `workflow-design/`、`workflow-inbox/`、`app-backend/` 目录本身没有违反行内 JS，违规集中在被改动的首页和工作台上。

---

## 仅提示

- `workflowValidate.js` 自己又写了一份「展开标签页字段」的逻辑，和 `tabsField.js` 里的那份并行。以后标签页规则改了，发布校验可能漏报「连线用了已删除的字段」。
- `WorkflowNodeProps.vue` 第 202–206 行有一段没用上的样式。
- `RolePicker.vue` 挂载就去拉角色，弹框没打开也会请求。
- `WorkflowDesignPanel.vue` 在 import 中间插了一段 class 定义，能跑但读起来别扭。
- `GET /inbox/:kind/:id` 的 `kind` 没校验，非法值会当待办编号去查。
- 管理后台对**启用中**的所有者调移交接口，返回的是「人员不存在」，文案容易让人以为账号没了。
- 【使用范围】可以加当时已停用的部门 / 角色，列表会标「当前不生效」；用户可能误以为已经开放。
- `FormRecordManage.vue`（第 104–110、208、223 行）和 `api/apps.js`（第 154 行）里有你自己加的 `console.log` 和 `// debugger`，按规则保留，这里只做说明。

---

## 测试盲区

单测全绿，但下面这些关键分支**一条都没锁住** —— 上面「必须修」里的问题基本都落在这些空白里：

**流程引擎**

- 【重试】不重复派单、更新时带「仍是异常」这个条件、`retryStep` 为空时重新解析当前节点、停用后取消再派、空补丁不丢字段
- 【通过】+【撤回】、【通过】+【驳回】、会签两人同时当最后一人
- 非待办处理人点【通过】应当返回「待办不存在」
- 「异常态也能撤回」现有断言写成了 `status: expect.anything()`，等于没锁

**应用权限**

- 没分配部门的人不被「部门 = 某部门」命中
- 范围是上级部门、人在下级部门 → 不命中（规格明确不含下级）
- 人员范围命中但账号已停用 → 判定为不可用
- 移交时旧所有者已经有「人员 = 他」→ 不重复插入；以及移交**不会**给旧所有者加配置名单行
- 首页列表：我是所有者时 `isOwner` 为真；角色范围命中
- 配置名单成员停用后列表标「已停用」且仍可移除
- 管理后台：对启用中的所有者调移交应被拒；非系统管理员调移交
- 字典的 `list` / `getOne` / `update` 分别走使用权 / 配置权

---

## 已确认无问题

**审批人解析**（读 `workflow.approver.ts` 与其测试）：角色按**角色 id** 且要求角色是启用的；只取启用账号；发起人所在部门没有该角色时，提示带节点名（「节点「部门审批」在发起人所在部门没有可用的审批人」）；发起人没有部门时按全公司派并记一条说明。

**谁能点【重试】**（读 `workflow-instance.service.ts`）：发起人直接放行，否则要求配置权，都不满足就返回「单据不存在」。审批人、系统管理员都被挡住，且是 404 不是 403，与规格 §12 一致。

**权限判定公式**：`canConfigure = 是所有者 || 在配置名单`，`canUse = canConfigure || 使用范围命中`。使用范围：人员要求账号启用；部门**只比本人所在的那一个部门、不含下级**，且部门是启用的；角色按**角色 id** 且角色启用，不用登录态里的角色编码。

**无权访问一律「应用不存在」**：`requireUse` / `requireConfigure` / `requireOwner`、应用详情、目录都是 404，不回 403，也不泄漏应用是否存在。

**移交所有者（方案 A）**：同一个事务里改所有者、删新所有者的配置行、删「人员 = 新所有者」的范围行、给旧所有者补一条「人员 = 他」的使用范围。不会把所有者写进配置名单。应用内移交只有所有者能调，配置者会 404。

**配置名单**：表里只存人；加人时跳过当前所有者并提示「已是所有者，无需添加」；停用账号会被拒（「不能添加停用账号」）；列表第一行是所有者且没有【移除】。

**停用所有者移交**：要求 `system_admin`；目标账号必须是**已停用**；应用必须确实属于他。系统管理员没有任何「可见全部应用」的旁路，交给别人之后自己仍然打不开。

**删应用级联顺序**：先删 Mongo 数据，成功之后才清两张权限表，最后删应用。测试锁住了「Mongo 失败就不清权限表」。

**首页应用列表**：所有者、配置名单、范围命中三个方向分别走索引反查再去重，**不是**先拉全部应用再在内存里过滤；每项都带 `isOwner` 和 `canConfigure`。

**字典读写分开**：读（列表、详情、选项）走使用权，写（新增、修改、删除）走配置权，控制器没有漏网的写接口。

**建表脚本与实体一致**：两张权限表的唯一约束、索引、字段类型长度与实体定义对得上；`synchronize` 是 `false`，没有被打开。

**前端权限显隐**：都用接口返回的字段，没有靠前端猜身份。

| 入口 | 依据 |
|---|---|
| 【应用后台】【转为流程表单】【编辑表单】【新建表单】 | 应用详情的 `canConfigure` |
| 【表单设计】页 | 进页面先查应用，没有配置权就送回工作台 |
| 【删除应用】【移交所有者】 | `isOwner` |
| 【数据管理】里的【重试】 | 是发起人，或详情接口返回的 `canConfigure` |
| 首页【我发起的】的【重试】 | 接口返回的 `canRetry`，审批人拿不到 |

**其它已逐条核对的前端规则**：新增目录里 `el-dialog` 共 9 处**都有** `draggable`；没有 `display: grid`（首页 `.app-grid` 实际是 flex 换行）；并排 `el-button` 的容器都没有额外 `gap`；图标都从 `@element-plus/icons-vue` 导入，没有把 `Number` 这类全局当图标；日期时间统一走 `timeValue.js` 的 `formatDateTime`，没有手写补零、也没有把 `YYYY-MM-DD` 直接交给 `new Date`；单文件组件都是 `template` → `script setup` → `style`；源码里的中文没有乱码。

**待办抽屉的防连点**：【通过】【驳回】【撤回】【重试】在进行中会 loading + 置灰，函数开头也直接返回，符合「点一次置灰」。

---

## 建议的修复顺序

1. **第 1、5、6、7 条** —— 【重试】和异常状态。这几条是同一片区域，一起改：找不到审批人 / 审批人全停用时，重试要**重新解析当前节点**而不是往下走；派待办失败要进「异常」；重新派单遇到已取消的旧待办不要撞唯一键。
2. **第 3、4 条** —— 给【驳回】、走到「结束」、以及「有人批过」这个标记都加上状态条件，让同时操作只有一个人能成功。
3. **第 8、9 条** —— 分支连线条件存不上、应用后台换应用不刷新。这两条用户直接能撞到，且改动范围小。
4. **第 10 条** —— 画布销毁。
5. **第 2 条** —— 重试补写审批人改过的内容（需要先决定把补丁存在哪里，改动比前面几条大）。
6. 其余「建议修」按优先级排；补上「测试盲区」里流程引擎那几条，避免这类问题再回归。

修完第 1～4 条之后，`docs/testcases/2026-09-06-workflow-form-test-cases.md` 的 E-01～E-05 需要重跑。

---

## 修复记录（2026-09-07）

「必须修」10 条已全部改完。后端单测 33 个文件 321 条通过，前端 `node --test` 180 条通过。

### 要先跑的 SQL

**`server/sql/2026-09-07-workflow-retry-patch.sql` 必须先执行**，它给 `workflow_instance` 加了 `retryPatch`、`retryActorId` 两列。没跑之前，打开任何流程单据都会因为查不到这两列报错。

### 改了什么

| 原编号 | 现在的行为 | 改动 |
|---|---|---|
| 1、5、6、7 | 派不出待办时（没人可派、审批人全停用、插待办失败）单据进「异常」并记下「卡在派单这一步」。点【重试】会**重新解析当前这个审批节点**再派一次，不再往下跳。同一轮里给同一个人重新派单，会把他之前取消掉的那条待办改回「待处理」，不会撞唯一约束报错 | 引擎里把派单抽成 `dispatchApprove` / `dispatchTasks`，异常时记 `retryStep='dispatch'`；`retry` 见到这个标记就重派当前节点 |
| 6 | 审批人派出去之后被停用：发起人打开【我发起的】卡片、或所有者在【数据管理】打开详情时，单据自己转成「异常」，写「审批人已停用，请重试重新派发审批人」，底部出现【重试】。本期没有定时任务，不打开就不会自动转 | 引擎新增 `markStuckByDisabledApprovers`，由待办详情和数据管理详情两个入口调用 |
| 3、4 | 【驳回】、走到「结束」判已通过、以及「有人批过」这个标记，都只在单据仍是「审批中」（或推进前还停在原节点）时才生效。发起人撤回和审批人通过同时发生，只有一边成功，另一边提示「单据状态已变化，请刷新后再看」 | 这几处 `update` 都带上了状态 / 当前节点条件，`affected` 为 0 就不再往下走 |
| 2 | 审批人改了字段点【通过】，写回表单失败进异常后，点【重试】补写的是**他当时改的内容**，不再丢 | 通过时先把他填的内容和他的 id 存进实例的 `retryPatch`、`retryActorId`，写回成功即清空；重试按它补写 |
| 8 | 分支连线的过滤条件配完能存住，保存刷新后再点这条线还在。条件里选用了数据字典的字段时，值那一栏能拉出字典选项 | `WorkflowEdgeProps.vue` 自己存一份条件对象传给条件组件，改动后写回连线；顺带把 `appId` 传进去 |
| 9 | 停在【配置权限】【使用范围】直接从左侧换一个应用，名单和范围表跟着换 | 两个页面从 `onMounted(load)` 改成跟着地址里的应用 id 走 |
| 10 | 反复进出【流程设计】、反复打开待办抽屉不再堆积画布实例 | 两处卸载时调 `destroy()` |

### 跟着改的用例

- 流程专项：`D-02b`、`D-02c`（分支条件存得住、字典选项）；`E-03` 改写；新增 `E-06`～`E-10`（重试重派当前节点、重新启用后重派、会签里已批的人不重批、补写审批人改过的内容、重试与撤回同时发生）。
- 权限专项：新增 `P-06`、`U-09`（换应用后名单和范围表要跟着换）。
- 组合用例：新增 `C-26`、`C-27`。
- `README.md`：执行顺序第 12 步补上要先跑的两个 SQL；「容易误判」补 4 条（重试是重派不是往下走、停用要打开单据才发现、分支条件要刷新后验、换应用要跟着刷新）。

### 没有一起做的

「建议修」和「仅提示」两节维持原样，本轮没有动。「测试盲区」里除流程引擎重试 / 并发这几条已随本次补上单测外，其余仍未覆盖。
