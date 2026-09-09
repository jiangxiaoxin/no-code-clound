# 流程表单代码评审与修复记录（第 3 期）

日期：2026-09-08
评审方式：从 `master`（`2b487be`）拉出独立 worktree（分支 `fix/workflow-form-review`），对流程表单相关代码（引擎、版本定义、渲染、填报持久化、收件箱、流程设计器前端）做整轮复读与并发时序推演，发现的 bug 当场修复，本文逐条登记。
与上一轮的关系：`docs/reviews/2026-09-07-workflow-and-permission-review.md` 审的是重试路径与权限；本轮扫的是它没覆盖的主流转、版本并发、字段权限落地和前端设计器/收件箱。

> 本文所有行号基于本 worktree 修复后的未提交工作区，合入 master 后可能漂移；找不到行号时按函数名搜索。

---

## 一句话结论

**主流转路径整体是稳的，但这轮仍找到 13 条会让单据走错、卡死或越权的服务端问题（全部已修），以及 11 条前端体验/一致性问题（全部已修）。** 最重的几条：审批通过时必填校验在吃掉待办**之后**才跑，失败会把单据打成异常；转交/加签能指给「已经批过的人」，会签会因此永久卡死；草稿第一次提交沿用存草稿那天的旧流程图；子表单必填列设为「不可见」后单据永远交不上去。

---

## 怎么验证的

- 后端全量单测：**38 个测试文件、441 条全部通过**（`cd server && npx jest`）。其中 23 条是本轮新增的回归用例（`workflow.review-bugs-0908.spec.ts`、`workflow-inbox.service.spec.ts`、`form-record.persist.constraints.spec.ts`、`workflow.graph.spec.ts` 与 `form-record.coerce.spec.ts` 各有补充），每条对应本文一个问题。
- 前端单测：**221 条全部通过**（`cd front && node --test "src/**/*.spec.js"`），含连线规则 3 条新用例。
- 引擎、版本服务、渲染服务逐行复读；`transfer`/`addSign`/`returnTo`/`retry` 的并发时序手工推演；LogicFlow 键盘行为查了 `node_modules` 里 mousetrap 的源码确认「自定义快捷键无法覆盖默认行为」。
- 手工测试用例按 AGENTS.md 约定同步更新三处（专项、组合、README）。

---

## 必须修（会让单据走错、卡死或越权）——已修

### 1. 审批【通过】的必填校验跑在吃掉待办之后，失败会把单据打成异常

**界面上会看到什么：** 审批节点把「事由」设为可编辑必填。审批人清空事由点【同意】：待办先被标记已处理，随后写库校验失败，单据进异常——**待办白白消失，单据卡在异常**，审批人想补救都找不到入口。

**为什么：** `completeTask` 先把任务置 `done`、抢占实例写 `retryStep:'mongo'`，之后 `persist.persist` 才做必填校验；校验失败走 catch 把实例标成 `error`，但已消费的待办不会回来。

**怎么修：** `workflow.engine.ts` 的 `completeTask` 在消费待办**之前**（任务置 done 前）加校验：取节点 `fieldAccess` 里可编辑的字段 key，用 `mergeRecordData` 合并库里已有值与本次补丁后，`assertRequiredFields` + `assertSubformConstraints`，400 直接抛出，任务和实例都不动。前端配套见第 14 条。

### 2. 旧轮次残留的「僵尸待办」什么操作都能做

**界面上会看到什么：** 一张单被退回到上一节点又重新走过来后，第一轮没处理的一条旧待办还挂在某个人的【我的待办】里（历史数据）。他点【通过】/【驳回】/【转交】/【加签】/【退回】，操作看似成功，实际作用在一张已经走到别处的单上，进度记录错乱。

**为什么：** `completeTask` 和 `requirePendingApprove` 只校验 `status === 'running'` 和任务自身 pending，没校验 `task.round === instance.round` 和 `currentNodeKey === task.nodeKey`；退回会 `round + 1`，旧轮待办就脱离了守卫。

**怎么修：** 两处都补上三重守卫（running + 轮次一致 + 当前节点一致），不一致抛 409「单据状态已变化，请刷新后再看」；`requirePendingApprove` 另补 `findApproveNode` 找不到节点时的 404。`resubmitStart` 同样补轮次校验。

### 3. 转交/加签能指给「已经批过的人」，会签会永久卡死

**界面上会看到什么：** 会签节点张三已通过。李四打开待办点【转交】，选了张三：只拦「已有待办」，不拦「已处理」，转交成功——但张三已批过，引擎对 done 行既不复活也不重插待办，**新转来的人永远等不到待办，会签凑不齐人数，单据卡在审批中**。加签同理。

**为什么：** `transfer` 只检查 `existing.some(row => row.status === 'pending')`；`addSign` 的去重集合只算 pending，done 的人照样进 `toDispatch`。

**怎么修：** `transfer` 增加对 done 行的拦截（「该用户已在本节点处理过，不能转交」）；`addSign` 把 done 的人也从 `toDispatch` 过滤，全部被过滤时报「所选人员已在本节点处理过，不能加签」。

### 4. 草稿第一次提交沿用存草稿那天的旧流程图

**界面上会看到什么：** 配置者启用 V2（新增「总监审批」）后，用户打开一张**启用 V2 之前**存下的草稿点【提交】：单据走的是 V1 的图，总监审批凭空消失，而同期从【添加数据】新建的单都走 V2——同一张表单两套流程。

**为什么：** 规格 §5 说草稿首提交要钉「当前启用中的那一版」，但 `submit` 只在实例不存在（连实例都没建过）时才取 `requirePublished`；实例已存在且 `round === 0` 的草稿直接沿用旧图提交。

**怎么修：** `submit` 对 `round === 0` 的已有实例也走 `requirePublished` 刷新 `graph` + `definitionVersion`（条件展开进 started 更新，`refreshGraph` 存在才写）；`round > 0`（被驳回/异常后再提交）仍钉住当初那版。两条路径都有单测锁定（`workflow.review-bugs-0908.spec.ts`）。

### 5. 或签的重试路径会在推进后留下僵尸待办

**界面上会看到什么：** 或签节点甲通过时写库失败，单据进异常；期间乙也点了通过（或之后重试时）。重试补写成功推进到下一节点，但**乙（或其他人）在本节点的 pending 待办没被取消**，成了僵尸待办（用户看到的现象同第 2 条）。

**为什么：** 正常通过路径有 `cancelPending`，重试的 mongo 分支在「会签还有人没批」的判断里只处理了会签，或签场景补写成功直接推进；`retryStep === 'advance'` 分支更是直接 `advance`，从不清理本节点剩余 pending。

**怎么修：** mongo 分支在「会签且还有人没批」之外的路径补 `cancelPending(..., '或签其他人已通过')`；advance 分支在推进前若节点是或签也先取消。

### 6. 只读字段没有旧值可兜底时，会采纳请求体里的值

**界面上会看到什么：** 开始节点把「天数」设为只读。发起人先用旧配置存了一张带「天数=3」的草稿；配置者把「天数」改为只读并启用后，发起人提交草稿——只读字段被请求体里的旧值写进库，绕过了「只读」。

**为什么：** `prepareStartPersistInput` 对只读字段的取值顺序是「旧值优先，没有旧值就落回请求体」；首次创建和发布后新加的字段都没有旧值，落回路径就变成了放行。

**怎么修：** `workflow.graph.ts` 的 `prepareStartPersistInput`：`access === 'readonly'` 时直接 `continue`，不再落回请求体。有单测锁定（`workflow.graph.spec.ts`）。

### 7. 旧版本图在「开始节点」没配字段权限时，发起人等待办期间一个字段都改不了

**界面上会看到什么：** 字段权限功能上线**之前**保存的图，开始节点没有 `fieldAccess`。这种单被退回发起人后，发起人打开【我的待办】想改字段重新提交，所有字段都是只读，只有【提交】按钮可用——想改都改不了。

**为什么：** 渲染服务的 `assertWritable` / 联动取值要求 `initiatorWritableKeys !== null` 才算发起人可编辑；而 `startWritableKeys` 对没配 `fieldAccess` 的图返回 `null`（语义是「没配置 = 全部可编辑」），两个约定打架，旧图被误判成全部只读。

**怎么修：** `workflow-render.service.ts` 两处把 `initiatorEditable` 的条件改为只看「发起人 + 状态允许」（draft/rejected/error/running-at-start），`initiatorWritableKeys` 为 null 表示不限制。有单测锁定。

### 8. 子表单必填子列设为「不可见」后，单据永远交不上去

**界面上会看到什么：** 子表单某个必填子列被设为「不可见」（或整张子表设为不可见）。填报界面根本不渲染它，但提交时服务端报「[明细.单价]不能为空」——**用户看不见也填不了这个字段，单据永远交不上去**。

**为什么：** `assertSubformConstraints` 和 coerce 的空行必填检查都只看 `child.required`，没看 `visible === false`；同类问题在容器层（必填子表设为不可见后空子表拦截）也存在。

**怎么修：** `form-record.persist.ts` 容器判断加 `field.visible !== false`，子列判断加 `child.visible === false` 跳过；`form-record.coerce.ts` 的 `requiredChild` 查找同样排除隐藏列。单测在 `form-record.persist.constraints.spec.ts` 与 `form-record.coerce.spec.ts`。

### 9. 复制版本撞唯一键直接 500

**界面上会看到什么：** 两人同时给同一张表单点【添加新版本】（或快速连点），一方因 `formId + version` 唯一键冲突报错，界面上就是一条莫名的失败。

**为什么：** `copyVersion` 用「当前最大 version + 1」算新编号，读和写之间没有锁，并发时撞唯一键直接抛。

**怎么修：** `workflow-definition.service.ts` 的 `copyVersion` 捕获唯一键冲突：重新查一遍现有版本，取 `max + 1` 重试一次。

### 10. 并发启用可以留下两行 enabled=true；启用还会用旧图覆盖并发保存的新图

**界面上会看到什么：** 甲正在【保存】V2 的新画布，乙同时点【保存并启用】：启用走整行 `save(row)`，把**读到的旧图**连同 enabled 一起写回去，甲刚保存的新图被旧图覆盖。两人同时启用两个不同版本时，还可能出现**两行同时 enabled**，`getRuntime` 取哪版全看运气。

**为什么：** `enableVersion` 先 `update` 全关再 `save(row)` 全开，两步不在事务里，且 `save` 是整行覆盖。

**怎么修：** `enableVersion` 改为 `versionRepo.manager.transaction` 包住两个 `manager.update`：全关一条、只翻目标行 `enabled` 位一条（不整行 save，避免覆盖并发保存的图）。

### 11. 抄送插入撞唯一键会让整次推进报错

**界面上会看到什么：** 同一节点给同一个人配了两条能同时命中的抄送路径（开始+分支都挂了同一个抄送人），推进时触发 `(instanceId, nodeKey, userId, round)` 唯一键冲突，**整个 advance 抛错**，单据莫名进异常，而原因只是抄送重复。

**为什么：** `dispatchCarbonCopies` 逐个 `insert`，没有容错。

**怎么修：** 插入包 try/catch：唯一键冲突（`ER_DUP_ENTRY`/`1062`/`23505`）视为「已抄送过」跳过；其他错误不中断流程，只在单据进度里追加一条「节点「xx」抄送发送失败，请知悉」的备注。

### 12. 退回先取消待办再抢占状态，并发时会把赢家的待办误杀

**界面上会看到什么：** 张三点【退回至发起人】的同时，李四对同一单点了【通过】且抢先落库。李四的通过把流程推进到下一节点并派了新待办；张三的退回随后把「本节点全部 pending」取消——**李四推进刚派出的新待办也被一起取消**，单据停在没人有待办的状态。

**为什么：** 旧实现先无条件取消本节点全部 pending，再做 `status:'running'` 的条件抢占；抢占失败（说明状态已变）时待办已经被杀了。

**怎么修：** `returnTo` 三个分支（上一节点/发起人/无审批人异常）都改为**先条件抢占成功、再取消待办**；抢占条件加 `currentNodeKey === task.nodeKey` 和 `round`，确保只有状态没变过的人才能取消。

### 13. 编辑门信了过期的 Mongo 状态，流程实际审批中却还能编辑

**界面上会看到什么：** 数据详情里流程明明已经「审批中」，发起人还能点【编辑】保存——写进去的改动绕过字段权限（审批节点的可编辑范围之外）。

**为什么：** `form-record.service.ts` 的编辑门看 Mongo 元数据里的 `workflowStatus`；提交瞬间 Mongo 与 MySQL 有先后差，过期的「草稿/已驳回」能让 running 的单放行编辑。

**怎么修：** 编辑门改为「Mongo 或 MySQL 任一边说是 running 就拒绝」：`if (status === 'running' || instance?.status === 'running')`，以数据库真值为准。

---

## 建议修（体验与一致性）——已修

### 14. 审批【同意】缺必填时前端不拦，等服务端报 400

**界面上会看到什么（修复前）：** 审批人清空可编辑必填字段点【同意】，只有一条笼统报错，不知道哪个字段、也不会跳过去。修复后与【再次提交】一致：先 `firstRequiredError` 前端校验，提示并跳到对应字段（`WorkflowInboxDrawer.vue` 的 `onApprove`）。

### 15. 画布快捷键：复制粘贴会造出重复 key 的节点，退格能删开始节点

**为什么：** LogicFlow 自带键盘（mousetrap 实现，`_fireCallback` 不阻断后续回调——**自定义快捷键无法覆盖默认行为**）：Ctrl+C/V 粘贴出的节点带着和原节点相同的 `properties.key`，保存后两个节点共用一个 key；Backspace 直接删开始节点，靠 `node:delete` 里再补一个回去。

**怎么修：** `WorkflowDesignPanel.vue` 关闭 LogicFlow 键盘（`keyboard: { enabled: false }`），组件自己在 document 上绑：Backspace/Delete 删当前选中的节点或连线（开始节点提示不能删）；Ctrl/Cmd+Z、Ctrl+Shift+Z、Ctrl+Y 撤销/重做。焦点在输入框、弹窗（`.el-overlay`）或画布外时不抢键盘。撤销/重做后统一再跑一遍 `validateCanvasEdge`（见第 16 条）。

### 16. 撤销会把「校验失败被删掉的连线」带回来；同毫秒建两个节点 key 相同

**界面上会看到什么（修复前）：** 拖一条不合规的连线被弹窗拦下并删除，随后 Ctrl+Z——**这条违规连线又回来了**（撤销恢复的是「删除」这步历史，而历史恢复不触发 `edge:add` 校验）。另外快速连点两次【添加节点】，两个节点落在同一毫秒，`nextKey` 生成相同 key。

**怎么修：** 撤销/重做后 `afterHistoryChange` 对全图连线重跑 `validateCanvasEdge`，不合规的删掉；`nextKey` 拼自增序号兜底（`WorkflowDesignPanel.vue`）。

### 17. 连线可以连回开始节点、也可以连自己

**界面上会看到什么（修复前）：** 拖线从审批节点连回【开始】，或节点连自己，画布都接受，保存后启用校验才报错（或干脆跑出环）。修复后 `validateCanvasEdge` 直接拒绝（「不能连回开始节点」「节点不能连接自己」），连线当场消失并提示；`workflowConnectRules.spec.js` 补 3 条用例。

### 18. 启用失败时错误信息显示为空

**界面上会看到什么（修复前）：** 后端启用校验失败返回错误数组，前端 `error?.message || error?.response?.data?.message` 里 axios 的 `error.message`（"Request failed with status code 400"）恒为真值，把真正的数组挤掉，数组判断又为假——**红色错误区什么都不显示**。修复后 `extractEnableErrors` 先取 `response.data.message`，数组、字符串、网络错误都能落成行（`WorkflowDesignPanel.vue`）。

### 19. 收件箱快速切换条目时，慢的旧响应覆盖新打开的单据

**修复：** `WorkflowInboxDrawer.vue` 的 `loadDetail` 加请求序号（loadSeq）守卫，过期响应直接丢弃，loading 只由最新请求收尾。

### 20. 顶栏待办角标不同步

**界面上会看到什么（修复前）：** 在【数据管理】详情里提交/重试流程单、或在工作台待办列表处理完一张，顶栏【我的待办】数字不动，要刷新页面才更新。

**修复：** 两处补发 `window` 事件 `workflow-inbox-changed`（顶栏已监听）：`AppWorkspaceView.vue` 的待办列表 `changed` 回调、`FormRecordDetailDrawer.vue` 的提交与重试成功后。

### 21. 角标刷新失败会闪成 0

**修复：** `AppHeader.vue` 与 `AppWorkspaceView.vue` 的计数接口失败时保留旧数字（catch 里不再置 0）。

### 22. 选人控件组织架构接口失败时抛未捕获的 Promise 异常

**修复：** `FormMemberSelect.vue` 的选人面板打开流程（`loadOrg`/`hydrateDraft`）包 try/catch；`hydrateSelectedNames`、`pruneByDeptField` 这几处 fire-and-forget 调用补 `.catch`，失败时错误已由 http 拦截器提示过，不再冒到控制台。

### 23. 开始节点上「子表单/当前用户/部门/流水号」的字段权限选项缺「可编辑」

**界面上会看到什么（修复前）：** 开始节点的字段权限里，这四类控件只有「只读/隐藏」两档，而它们的默认值是「可编辑」——**单选组落成一个空选择，界面看起来像没配上**。修复后开始节点保留三档（`WorkflowNodeProps.vue` 的 `accessOptions`）；审批/抄送节点维持两档不变。`restoreStart` 同时改为保留原节点的完整 properties。

### 24. 收件箱接口不校验 kind 参数

**修复：** `workflow.controller.ts` 的 `openInbox` 对 `kind` 做白名单校验，非法值返回 404「待办不存在」，不再把任意字符串透传给查询。

### 25. 僵尸待办不再出现在列表和角标里（2026-09-09 追加，收尾存疑第 2 条）

**界面上会看到什么（修复前）：** 历史遗留的僵尸待办一直挂在某人的【我的待办】列表和顶栏角标里，点【同意】被 409 拦下，提示「请刷新后再看」但刷新也弄不走它。

**为什么：** 待办列表和角标计数只按 `status = pending` 查（`workflow-inbox.service.ts` 的 `query`/`count`），不校验轮次和当前节点；操作侧守卫只保证点不动，查询侧不拦。

**怎么修：** 两层，都是随部署自动生效、不需要任何人工脚本——
- **查询侧过滤**：`query` 与 `count` 共用 `filterFreshTodo`，待办必须「单据审批中 + 轮次一致 + 当前节点一致」才出现在列表和角标里，判定与服务端操作守卫同源。退回发起人的重新提交待办天然被覆盖（退回后实例仍是审批中、当前节点就是开始节点）；异常单等待重试的待办会被临时隐藏，重试翻回审批中后重新出现。
- **惰性自愈**：打开待办详情时（`open`）发现待办落在旧轮次或别的节点，顺手把它取消（条件更新防并发，取消原因「单据状态已变化，待办自动撤回」），进度时间线同步显示。**例外**：异常单在当前节点等待重试的会签待办不能取消——重试续跑时要靠它数「还有人没批」。

**测试：** `workflow.review-bugs-0908.spec.ts` +7（取消方法各分支，含异常单例外）、`workflow-inbox.service.spec.ts` +3（列表过滤、角标过滤、打开详情顺手取消）。

---

## 没修、存疑或需要产品确认的

1. ~~**隐藏字段的全量数据仍会下发给审批人/抄送人**~~（**已拍板，2026-09-09，维持现状**）：产品确认「隐藏」的语义是**界面不渲染**，不是保密承诺，详情接口照常下发全量数据。潜在风险记录在案：懂技术的人用开发者工具能在响应里看到隐藏字段的值（规格已同步为「已知且接受的风险」）；将来若有字段要真保密，需按节点字段权限裁剪详情接口的 data，属新需求另立项。
2. ~~**收件箱查询侧不做僵尸待办过滤**~~：**已于 2026-09-09 修复，见第 25 条**——列表和角标按轮次/节点过滤，打开详情时旧待办被顺手取消，随部署自动生效，无需一次性清洗脚本。
3. **重试 dispatch 分支的窄窗口**：翻转状态成功与派单之间若进程崩溃，单据会是「审批中但零待办」；概率极低且下一次打开详情的兜底检查会修正，暂不加表级锁。
4. **会签写回重试用原始 dataPatch**：`retryPatch` 存的是通过时前端提交的原始补丁；入口处实例服务已按字段权限过滤过 dataPatch，重试直接补写不会越权，维持现状。
5. **画布 Ctrl+C/V 复制粘贴被移除（已确认为预期行为，2026-09-09）**：修第 15 条后画布不再支持复制粘贴。产品已确认：画布**不允许**用复制粘贴快捷键，这不是缺口，无需补「复制节点」功能；该行为由回归用例 B-27 锁定（见 `docs/testcases/2026-09-08-workflow-supplement-test-cases.md` §8 与 README「不要测」）。

---

## 修复涉及的文件

- 服务端：`server/src/application/workflow/workflow.engine.ts`（第 1/2/3/4/5/11/12/25 条）、`workflow-inbox.service.ts`（25）、`workflow.graph.ts`（6）、`workflow-render.service.ts`（7）、`workflow-definition.service.ts`（9/10）、`workflow.controller.ts`（24）、`form-record/form-record.persist.ts` + `form-record.coerce.ts`（8）、`form-record/form-record.service.ts`（13）
- 前端：`front/src/components/workflow-design/WorkflowDesignPanel.vue`（15/16/18/23）、`workflowConnectRules.js`（17）、`front/src/components/workflow-inbox/WorkflowInboxDrawer.vue`（14/19）、`front/src/views/AppWorkspaceView.vue`（20/21）、`front/src/components/form-workspace/FormRecordDetailDrawer.vue`（20）、`front/src/components/AppHeader.vue`（21）、`front/src/components/form-fill/FormMemberSelect.vue`（22）、`front/src/components/workflow-design/WorkflowNodeProps.vue`（23）
- 新增测试：`workflow.review-bugs-0908.spec.ts`（14 条）、`workflow-inbox.service.spec.ts` +3、`form-record.persist.constraints.spec.ts`（3 条）、`workflow.graph.spec.ts` +1、`form-record.coerce.spec.ts` +1、`workflowConnectRules.spec.js` +3
- 手工用例：`docs/testcases/2026-09-08-workflow-supplement-test-cases.md`（B-22～B-31）、README 同步更新
