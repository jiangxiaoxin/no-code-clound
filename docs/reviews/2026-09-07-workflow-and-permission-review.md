# 流程表单与应用权限评审（第 2 期修复复核 + 全区间复审）

日期：2026-09-07
审查对象：`6744690^..HEAD` 共 6 个提交——工作台 Tab 本机缓存（`6744690`）、设计规格与两份计划（`8aeefe2`）、合并（`765dc71`）、第 2 期实现（`1f98f33`）、忽略文件（`e6e2b5c`）、修复（`76993a9`）。
与上一轮评审的关系：`docs/reviews/2026-09-06-workflow-and-permission-review.md` 审的是 `1f98f33`。本轮补四块它没覆盖的：

1. `76993a9` 对上轮 10 条「必须修」的**修复本身**（此前没有任何人评审过修复代码）；
2. 工作台 Tab 本机缓存（`6744690`，上轮未评）；
3. 应用权限的**独立安全复核**（不预设上轮结论正确）；
4. 文档与手工用例的合规复核。

> 注意：工作区当前有 5 个文件的未提交改动（`WorkflowDesignPanel.vue`、`WorkflowNodePalette.vue`、`WorkflowNodeProps.vue`、`WorkflowFieldAccessRow.vue`、`AppWorkspaceView.vue`，进行中的前端工作）。本报告全部基于 HEAD（`76993a9`），行号以 HEAD 为准；涉及这几个文件的行号在改动合入后可能漂移。

---

## 一句话结论

**权限主路径干净，但移交有并发窗口、流程取数能跨应用读数据；流程引擎的修复本身引入/漏掉 3 条新问题，全部集中在【重试】路径上，会让已撤回的单派出待办、会签被跳过、或单据永久卡死。**

- 上轮 10 条「必须修」的修复：7 条服务端 + 3 条前端，逐条验证**修复真实且主路径正确**（见下文验证表）。
- 但修复代码里有 3 条新的「必须修」（第 1~3 条），都是重试分支的并发/边界漏洞，其中两条正好对应新用例 E-10、E-08 承诺却保证不了的行为。
- 权限：判定公式、404 伪装、注入面、字典读写分离全部复核证实；移交所有者存在并发窗口（上轮 19，本轮补充了更糟的组合后果）；新增发现「流程取数/联动可跨应用读数据」。
- 前端：三分支条件存不上、画布销毁、换应用刷新都修好了；但换应用的**请求竞态只修了一半**，本机缓存的默认页签会被 URL 残留的 `?tab=` 绕过。
- 文档与用例：修复记录声称的用例改动全部属实、三处同步到位；但 E-08、E-10 两条用例描述的是**没实现的行为**。

---

## 怎么验证的

- 后端全量单测：**33 个测试文件、321 条全部通过**（`cd server && npx jest` 或 `npm test`；输出里的 `mongo down`、`drop form collection failed formId=10` 是用例故意造的失败场景日志，不是测试失败）。
- 前端单测：**24 个 spec 文件、180 条全部通过**（`cd front && node --test "src/**/*.spec.js"`；`front/package.json` 没有 `test` script，命令要手敲）。
- 引擎、图算法、审批人解析、权限判定、渲染取数逐行复读，并发时序手工推演；关键条目（重试竞争、会签闸门、跨应用读、删异常单、发布开关、上传时序）由主评审亲自复核源码确认。
- 文档用例与代码逐条比对：E-06~E-10、P-06、U-09、D-02b/c、C-26/27 均真实存在，与修复记录声称一致。

---

## 必须修（会让单据走错或永久卡死，3 条都在 `workflow.engine.ts` 的【重试】路径）

### 1. 【重试】和【撤回】同时发生时没有竞争保护：已撤回的单会派出真待办

**界面上会看到什么：** 一张异常单，发起人点【撤回】的同时（或配置者点【重试】、发起人点【撤回】）。两边都可能提示成功：单据在【我发起的】里变回草稿，但审批人的【我的待办】里**出现这张已撤回的单**，点【通过】只会报「单据状态已变化」；【数据管理】里 Mongo 元数据可能显示「审批中」而 MySQL 已是「草稿」。这正是上轮第 3 条要消灭的不一致，修撤回时漏了重试这一边。手工用例 E-10 承诺的「不会出现已撤回但又派出了待办」实际保证不了，会间歇性失败。

**为什么：** 重试的派单分支把状态从「异常」翻回「审批中」后**不看 `affected`** 就继续派单：

```321:343:server/src/application/workflow/workflow.engine.ts
    if (instance.retryStep === 'dispatch' && stuckNode?.type === 'approve') {
      await this.cancelDisabledPending(instance);
      await this.instanceRepo.update(
        { id: instance.id, status: 'error' },
        { status: 'running', errorReason: null, retryStep: null },
      );                        // affected 被丢弃
      instance.status = 'running';
      // ... 照常 dispatchApprove
```

撤回（`cancel`，267-280 行）的条件是「状态 running/error 且没人批过」。两个时序都坏：撤回先落库 → 重试的条件更新影响 0 行但被忽略，照样派单到一张草稿单上；重试先落库 → 撤回的条件照样匹配（running 也在允许列表里），把单据改回草稿、取消待办，重试随后又把待办复活。派单尾部的 Mongo 写回（457-460 行）无条件写「审批中」，加剧分叉。两人同时点【重试】同理：一方撞唯一键被 catch 打回异常，另一方已派单成功。

**怎么修：** 327 行检查 `affected`，为 0 直接 return；派单前后再做一次「仍是 running 且 currentNodeKey 未变」的条件校验（或把翻转改成占位标记，`dispatchTasks` 和 Mongo 写回只在占位成功后执行）。补一条 retry-vs-cancel 并发单测。

### 2. 会签「写回失败 → 重试」会绕过「等所有人批完」的闸门，剩余会签人被跳过

**界面上会看到什么：** 会签节点 2 个人。张三先点【通过】且恰好写库失败，单据进异常。发起人点【重试】后，流程**直接推进到下一个节点**并给下一节点派了待办；李四的待办还挂在原节点，他再点【通过】不报错，但对流转毫无作用——「人人都要批」的会签被打破，和上轮第 1 条「重试跳过审批节点」是同一类问题，只是换了个入口。

**为什么：** 「是否还有 pending」的检查只存在于正常通过路径（243-255 行），且在 `writeBack` **之后**——所以非最后一人写库失败时还没走到检查就进异常了。重试的 mongo 分支补写成功后直接 `advance`，没有补做这个检查：

```298:315:server/src/application/workflow/workflow.engine.ts
    if (instance.retryStep === 'mongo') {
      // ... writeBack 补写
      await this.instanceRepo.update(
        { id: instance.id, status: 'error' },
        { retryStep: 'advance', retryPatch: null, retryActorId: null },
      );
      await this.advance(instance, instance.currentNodeKey ?? 'start'); // 直接往下走
```

**怎么修：** 重试 mongo 分支补写成功后，若该节点 `signMode === 'all'`，先 `count` 本节点本轮 pending：>0 则清 `retryStep` 直接返回等待；=0 才 `advance`。顺带给 `completeTask` 的实例抢占（226-227 行）加 `currentNodeKey === task.nodeKey` 条件，让流程已推进后的迟到通过明确 409，而不是静默无效。现有单测和 E-09 都只覆盖单人场景。

### 3. 会签里「已批的人通过、未批的人被停用」时，【重试】后单据永久卡在「审批中」且零待办

**界面上会看到什么：** 会签节点张三已【通过】、李四被停用。发起人打开单据，状态自动转「异常」（这个是对的），点【重试】：单据变回「审批中」，但**没有任何人收到待办**，流程不推进。此时 `hasApproved` 已为真、【撤回】被挡，状态不是「异常」、【重试】也消失——这张单**永久卡死**，谁也救不回来。规格 §16.5 明确禁止「审批中但没有任何待办」；手工用例 E-08 期望「重试后只给新解析出来的审批人派待办」，按现行为执行必然失败。

**为什么：** 重派时审批人解析只返回**启用**的人（`workflow.approver.ts:73-80`），即只剩张三；而 `dispatchTasks` 只复活「已取消」的待办、只插入「没有过」的人（466-507 行）——张三那条是「已通过」，既不复活也不重插。结果零待办、状态 running：

```475:478:server/src/application/workflow/workflow.engine.ts
    const toRevive = userIds.filter(
      (id) => byAssignee.get(id)?.status === 'cancelled',
    );
    const toInsert = userIds.filter((id) => !byAssignee.has(id));
```

**怎么修（需要先定口径）：** 解析结果在本节点本轮「全部已处理」时不能翻转成 running。可选：(a) 维持异常，文案写明「审批人李四已停用，恢复其账号或调整流程后再重试」——不跳过任何人的审批，与上轮第 1 条的修复原则一致；(b) 按节点完成处理直接推进——等于替停用者弃权，不建议。倾向 (a)。

---

## 建议修（健壮性、安全、与规格的偏差）

| # | 问题 | 界面上的后果 | 位置 |
|---|---|---|---|
| 4 | `retryPatch` 是单槽位，或签两人并发通过时后写覆盖先写 | 两人几乎同时【通过】，其中一人写库失败进异常；【重试】补写的是**另一个人**改的内容，先点通过那位改的字段静默丢失 | `workflow.engine.ts` 226-237、555-565 |
| 5 | 删除异常记录后实例不清理，重试会给已删数据派真待办 | 异常单被发起人删除后，「我发起的」卡片标「数据已删除」却还有【重试】；点了审批人真收到待办，审批人点【通过】必报「记录不存在」，单据再进异常，**无限循环** | `form-record.service.ts` 341-356；`workflow.engine.ts` 347-354（只清 draft 实例）；`form-record.persist.ts` 138-141 |
| 6 | 流程取数/联动不校验源表归属，可跨应用读数据 | A 应用配置者把「选择数据/关联数据」字段指向 B 应用的表后，A 应用全部使用人、乃至只是 A 应用某单据审批人（对 B 应用完全无权的外部人员）都能经取数接口读 B 应用记录，B 应用所有者无感知、无审计。服务端 `saveFields` 和渲染接口两侧都没校验 `sourceFormId` 属于本应用 | `workflow-render.service.ts` 47-48、86-87；`application.service.ts` saveFields |
| 7 | 【配置权限】【使用范围】的 load 竞态没修完 | 快速换应用时慢的旧响应盖掉新应用名单：看着【人事】的列表、点【移除】动的是【财务】的数据。上一轮第 9 条只修了「不刷新」，没修「乱序」 | `AppConfiguratorsView.vue` 111-125、209；`AppAccessScopesView.vue` 144-155、282 |
| 8 | 工作台默认页签会被 URL 残留的 `?tab=` 绕过 | 在表单 A 点过【数据管理】后 URL 带 `tab=list`，切到表单 B 时被原样带过去：即使 B 的本机缓存配的是「添加数据在前」，B 打开仍是【数据管理】，缓存只在全新进入时生效一次 | `AppWorkspaceView.vue` 394-402；`AppWorkspaceMain.vue` 139-140 |
| 9 | 移交所有者存在 TOCTOU（上轮 19 未修，本轮补充组合后果） | 两个移交并发时都能通过「当前所有者已变化」检查，后写覆盖前写；更糟的组合是「加配置者读到旧所有者、移交同时提交」，新所有者会**在名单里留下一条脏配置行**，他将来交出应用后靠这条行保留配置权 | `app-access-admin.service.ts` 260-288（事务外读、无行锁、`save` 全量 UPDATE 不带 `WHERE ownerId=旧`） |
| 10 | 加配置者与删他的「人员范围」不同事务（上轮 18 未修） | 加人成功、删范围失败时，以后把他移出名单，确认框说他会失去使用权，实际范围行仍放他进来 | `app-access-admin.service.ts` 121-132 |
| 11 | 表单发布开关服务端不执行（既有缺陷，本轮大改 form-record 仍未补） | 发布页整表关掉【删除】后，直接调删除接口照删；开关只在 `form-config.ts` 存取并返回前端，`form-record.service.ts` 的增删改导入完全不读它 | `form-config.ts` 44、60-63 是唯一引用处 |
| 12 | 上传先落盘后鉴权 | 已登录用户对任意应用/任意实例反复传 50MB 文件可把磁盘占满，且留下孤儿文件。文件上传拦截器先写盘，权限检查在 handler 里才执行 | `workflow.controller.ts` 149-179（`assertWritable` 在 176 行）；`application.controller.ts` 303-335、337-373 同款 |
| 13 | 删应用级联非原子（上轮 20 未修） | Mongo 删完后 MySQL 任一步失败即半删除：别人首页看不到应用了，所有者还看得到一个空壳 | `application.service.ts` 181-196 |
| 14 | 详情接口权限判定做两遍（上轮 17 未修） | 【数据管理】每点开一行多查一轮四张表，违反规格 §13「同一次请求内缓存判定」 | `form-record.service.ts` 210、218 |
| 15 | 文档同步缺口（4 处，详见「文档与用例」小节） | 规格里「对调」仍写成影响所有人；实例表缺 `retryPatch/retryActorId` 两列；两份计划内嵌已放宽的旧分支规则；E-02/E-06 前置自相矛盾 | 见下文 |

---

## 文档与用例

**做得好的：** 修复记录声称的用例改动（D-02b/c、E-03 改写、E-06~E-10、P-06、U-09、C-26/27、README 的 SQL 与「容易误判」）逐项属实；控件一律「调色板中文名 + type」并排写；抽查 8 个界面关键点（流程设计页签位置、抽屉按钮名、权限页列名、各类提示文案）与代码逐字一致；`AGENTS.md` 与 `.cursor/rules/` 21 个规则文件含义一致；全部文档 UTF-8 无 BOM、无乱码。

**要改的：**

| 条目 | 问题 | 位置 |
|---|---|---|
| 用例 E-10 | 承诺「不会出现已撤回但又派出了待办」，对应必须修第 1 条，代码保证不了；修完代码前先把期望改弱并注明现状 | `2026-09-06-workflow-form-test-cases.md:144` |
| 用例 E-08 | 承诺「重试后只给新解析出来的审批人派待办」，实际是零待办卡死（必须修第 3 条）；按现行为执行必记失败 | 同上 `:142` |
| 用例 E-02/E-06 | 组织准备里「经理丙属销售」与 E-02 要求「销售没有部门经理」自相矛盾；应写清触发动作（先把丙停用/移出，E-06 再启用回来） | 同上 `:29-35、136、140` |
| 用例 E-09 | 「写回表单恰好失败」没说怎么造，手工执行不了 | 同上 `:143` |
| 用例 S-04 | 「同样提示」与实际 toast 文案不同（常驻提示与拦截 toast 是两句话），逐字对照 S-02 的人会误判 | 同上 S-04 |
| README | 破坏性步骤清单没覆盖流程/权限专项的停用/启用类步骤（E-03/E-07/E-08、M-01、U-07），多人共用环境会互相影响 | `docs/testcases/README.md:170-181` |
| 规格 | 「工作台对调」仍写「只影响有使用权的人看到的顺序」，实现已改为只存配置者本机浏览器；实例表缺 `retryPatch`、`retryActorId` 两列；§15.3 三步表缺「派单失败（retryStep='dispatch'）重新解析当前节点」一行 | `2026-09-05-permission-design.md:342`；`2026-09-05-workflow-form-design.md:680-696、765-769` |
| 计划 | 两份实现计划内嵌「未经允许不开分支、不建 worktree」，与本次已放宽的 `AGENTS.md` 口径矛盾；建议改成引用规则文件，别再复制会过期的规则 | `2026-09-06-workflow-form.md:3、17`；`2026-09-06-app-permission.md:3、17` |
| TODO | 文末「查一下有没有转办功能」与 P5「转办、加签不做」口径相反 | `docs/TODO.md:114、183` |

---

## 违反项目规则的写法（上轮已登记，本轮确认全部仍在，另新增 1 处）

| 规则 | 位置（HEAD） |
|---|---|
| 模板行内 JS | `HomeView.vue` 45-46、109、141；`AppWorkspaceView.vue` 8、88；`AppBackendLayout.vue` 9 |
| 不使用 `el-text` / `el-space` | `HomeView.vue` 7、10、21；`AppWorkspaceView.vue` 10、83 |
| 优先 `el-button` 而非原生 `<button>` | `AppWorkspaceView.vue` 14-38；`WorkflowNodePalette.vue` 4、8、12；`WorkflowInboxCard.vue` 2 |
| **新增**：顶栏导航用原生 `<button>` | `AppHeader.vue` 6、15、25、34 |

`76993a9` 提交信息里的「前端残留问题」只指 8/9/10 三条功能修复，不含这批规则违规；它们自上轮起一直挂着。注意 `AppWorkspaceView.vue`、`WorkflowNodePalette.vue` 正在未提交改动中，合入后以新行号为准。

---

## 仅提示

- `cancel`（engine 266-293）与 `submit`（111-127）都不清 `retryPatch/retryActorId`，草稿/驳回单上残留审批人补丁数据（`retryStep` 已清不会被读，纯数据残留）。
- 或签两人并发通过时，输掉推进抢占的一方接口返回的是内存旧实例，`nextNodeTitle` 显示刚批完的节点（engine 259-263 + 406-407），纯展示。
- `retry` 对非异常状态静默返回 200（engine 297），与同文件「当前状态不能提交」的 409 风格不一致。
- 非待办处理人点【通过】仍返回 409「这条待办已处理」，泄漏 taskId 存在性（上轮 15 未修，维持）。
- 撤回未按规格 §8.3 在 `notes` 留「发起人撤回」，只在任务上写了 `cancelReason`（旧偏差，非本轮引入）。
- `WorkflowEdgeProps.vue` 现在点选任何非默认连线都会写一次空 `when` 进图形属性，行为无差异，保存的图多噪音字段。
- `AppWorkspaceMain.vue` 124-137 重复实现了 `normalizeWorkspaceTabOrder` 的去重补齐，可直接复用 util。
- `AdminUserOwnedApps.vue` 66-68 用登录态 `roleCodes` 控制「名下应用」显隐，与「显隐用接口返回字段」口径不一致（服务端有强制校验，仅显示层）。
- `AddConfiguratorsDto` 无 `ArrayMaxSize`；`QueryRecordsDto` 的 filters/groups 数组无大小上限，可放大单次查询成本。
- `removeConfigurator` 返回的 `canUse` 是「操作者本人」移除后的使用权（供自移除后跳首页），字段名易被误解为被移除者的状态。
- `listConfigurators`/`toScopeRow` 有 N+1 查询（每行单独 findOne），应用后台页面偏慢；`getAccess` 每请求 4-5 张表无缓存。
- `addAccessScope` 可添加当时已停用的部门/角色（列表标「当前不生效」），上轮已提、未变。
- `/uploads/` 静态目录无鉴权（UUID 文件名属能力 URL，既有行为）；`/inbox/:kind` 的 `kind` 前后端都不校验（上轮仅提示，维持）。
- `workflow-inbox.service.ts` 43-96 带 appId 查询时不校验对该应用的访问权——只返回「自己的」任务所以不泄漏，但「应用内三行」目前只由前端保证。
- `relateTitles.spec.js`、`FormRecordCell.spec.js` 用 `readFileSync`+正则断言源码文本，重构会误报，留意脆弱性。
- 删除表单后 `form-workspace-tab-order:*` 本机缓存键永久残留（量级可忽略）；`FormPublishPanel.vue` 写缓存无异常兜底且 user id 缺失时提示「已保存在本机」可能说谎（极低概率）。
- `front/package.json` 没有 `test` script，建议补一个固化单测入口。
- `ConvertFormKindDto` 的 `@IsIn(['workflow','normal'])` 收得过宽，靠服务层拒绝 `normal`，可把 DTO 收窄。
- 区间内新增调试输出位置（按规则属用户自己的、已保留）：`workspaceTabOrder.js:9`（🚀 log）、`FormRecordManage.vue:104-110、208、223`、`FormRecordList.vue:412`、`api/apps.js:154`。

---

## 上轮 10 条「必须修」修复验证

| 上轮问题 | 结论 | 证据 |
|---|---|---|
| 1 重试跳过审批节点 | **已修复且正确** | 派单失败一律 `markError(...,'dispatch')`（engine 422-447）；重试 dispatch 分支重新解析当前节点（321-343）；单测 spec 344-357 |
| 2 重试补不回审批人改动 | **已修复**（并发下有建议修 4 的缺口） | 通过时先存 `retryPatch/retryActorId`（226-234），重试补写（303-308），成功即清（239-242）；单测 spec 413-429 |
| 3 通过 vs 撤回同时成功 | **已修复且正确** | 通过抢占带 `status:'running'`（226-237），输家在 Mongo 写回前退出；撤回条件更新（267-280）；逐路径核对无 Mongo 写旧状态残留 |
| 4 驳回/结束覆盖他人结果 | **已修复且正确** | 驳回带 `status:'running'`（203-211）、结束走 `claimWhere`（371-383），输家静默返回 |
| 5 派待办失败卡「审批中」 | **已修复且正确** | 派单异常统一进 `markError(...,'dispatch')`（441-447），异常态有【重试】；单测 spec 377-385 |
| 6 审批人全停用不变异常 | **已修复且正确** | `markStuckByDisabledApprovers`（626-653）条件更新 + affected 检查；待办详情与数据管理详情两个入口都接了；并发时输家在 Mongo 写回前返回 |
| 7 重新启用后重试报数据库错误 | **已修复且正确** | `dispatchTasks` 复活已取消行 + 只插缺失者（466-507），绕开唯一键且幂等；单测 spec 359-375 |
| 8 分支连线条件存不上 | **已修复且正确** | `WorkflowEdgeProps.vue` 改为本地 ref 副本 + 按 `edge.key` 换线重建 + deep watch 写回 + 传 `appId`；已核实 `FormFilterConditions` 确实消费 `appId` 且就地改 `filters`，两条丢失路径都堵住 |
| 9 换应用不重新加载 | **修复了但有残留** | 两页改 `watch(appId, load, { immediate: true })`，切换会重查；但 load 无会话号守卫，慢响应会覆盖新应用（建议修 7） |
| 10 画布卸载不销毁 | **已修复**（浏览器实际回收效果未验证） | `WorkflowDesignPanel.vue:292`、`WorkflowMiniGraph.vue:68` 均调 `lf?.destroy?.()`；按项目规则未开浏览器，标待确认 |

## 上轮权限结论复核（独立视角，全部证实）

判定公式（canConfigure=所有者‖名单；canUse=canConfigure‖范围；人员要启用、部门只比本部门且启用、角色按 id 且启用）——`app-access.service.ts:49-65、134-166`，有单测。无权一律 404「应用不存在」——`requireUse/requireConfigure/requireOwner`、应用详情、目录、流程单据入口全一致，不泄漏存在性。移交四步同事务——`app-access-admin.service.ts:266-288` + 单测 199-223。配置名单跳过所有者、拒绝停用账号、列表第一行所有者不可移除——证实，且「完整真相」原则到位：服务端 `listAccessScopes` 返回 `always.users`（所有者/配置名单 + 停用状态），前端渲染「始终可用（不可移除）」。首页列表三方向索引反查去重、每项带 `isOwner/canConfigure`——证实。字典读走使用权、写走配置权、无漏网写接口——证实。权限 SQL 与实体逐列一致、`synchronize: false`——证实。注入面干净：无原生 SQL、Mongo 查询走字段白名单 + 操作符白名单 + hex 正则 + 正则转义——证实。管理端移交仅启用的 `system_admin`、目标必须已停用、无查看旁路——证实。「建议修」17~22 现状：17/18/19/20/21 未修（已并入上表），22 与规格的回退文案一致属维持现状。

## 测试盲区（新增）

单测全绿，但下面这些路径一条都没锁住——3 条必须修全部落在这里：

- 【重试】vs【撤回】并发、【重试】vs【重试】并发（必须修 1）
- 会签非最后一人写库失败后的 mongo 重试（必须修 2）；`completeTask` 抢占缺 `currentNodeKey` 条件的迟到通过
- 「解析结果在本节点全部已处理」的重派路径（必须修 3）
- 或签两人并发通过时 `retryPatch` 覆盖（建议修 4）
- 删除 error 记录后的实例清理（建议修 5）
- `source-records`/`linkage` 的跨应用归属校验（建议修 6）
- 并发移交、并发加配置者（建议修 9、10；上轮已列，仍未补）

## 建议的修复顺序

1. **必须修 1 + 3**（同一片代码：重试 dispatch 分支）。先定口径：会签里「未批的人已停用」时重试应保持异常（推荐）还是推进；然后补 `affected` 检查与「全部已处理」处置，并补两条并发单测。E-08/E-10 用例期望随后改写。
2. **必须修 2**（mongo 重试补 pending 计数），顺带 `completeTask` 抢占加节点条件。
3. **建议修 6**（跨应用读，安全项，两侧校验都补）。
4. **建议修 5、7、8**（删异常单清理、权限页竞态、`?tab=` 绕过），改动都小。
5. **建议修 9~14** 按上轮顺序推进（移交 TOCTOU 优先，因为有「幽灵配置权」后果）。
6. 文档表里的 9 条随下一轮代码一起改，重点是规格缺列、E-02/E-06 前置、E-08/E-10 期望。
7. 规则违规（行内 JS、el-text 等）继续挂着，建议单独开一轮清理。

---

## 附注

- 后端单测在该机器上 `npx jest` 与 `npm test` 均可运行；有评审环境反馈直接 `npx jest` 会命中全局缓存的 jest 报 ESM 错误，稳妥起见用 `cd server && npm test`。
- 本报告由 4 个并行评审（服务端流程修复验证、前端修复与 Tab 缓存、服务端权限独立安全复核、文档用例合规）汇总而成，关键结论经主评审逐条复读源码确认。
