# 流程表单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务推进。默认在 `master` 上改。未经使用者允许不开分支、不建 worktree。未经使用者要求不 commit。

**Goal:** 让【人事】里的【请假单】能按画布走审批：建表时选流程表单、发布流程后才能填，提交后按节点派人，首页和应用内用同一套【我的待办】/【我发起的】/【我处理的】处理。

**Architecture:** 表单类型写在现有 `app_form.formKind`。流程配置、实例、待办三张 MySQL 表；填报仍走 Mongo，根上冗余 `workflowStatus`。**流程代码放在 `server/src/application/workflow/`，和填报、字典同属 `ApplicationModule`**——流程要读表单、调保存，填报要读流程定义、调引擎，拆成两个 Nest 模块必然互相 import。保存只留一套 `FormRecordPersistService.persist`，两扇门（工作台 / 数据管理的 `records` + `intent`；首页【我发起的】的 `/api/workflow/instances/...`）鉴权各自做，保存成功后才调引擎；引擎自己只在审批写回时调保存。访问判定先落到 `AppAccessService`（本期只认所有者；配置名单和使用范围见另一份计划）。

**Tech Stack:** NestJS + TypeORM + MySQL + Mongo；前端 Vue 3 + Element Plus + LogicFlow 2.x。后端 Jest，前端纯函数 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-05-workflow-form-design.md`（全文第 1 期）；权限规格第 1 期见 `docs/superpowers/specs/2026-09-05-permission-design.md` §8、§12.1、§13。

**配套计划:** `docs/superpowers/plans/2026-09-06-app-permission.md`（配置名单、使用范围、移交）。本计划做完后，应用暂时仍只有所有者能进；没有使用权的审批人只走首页。不要等第 2 期才做侧栏三行和待办抽屉。

## Global Constraints

- 默认在 `master` 开发；未经允许不开分支、不建 worktree；不自动 commit。
- TypeORM `synchronize: false`。SQL 脚本写好后必须停下，等使用者点名该文件并同意后才能执行。禁止打开 `synchronize`。
- 表名单数下划线、列驼峰、普通索引 `IDX_表名_属性`、唯一约束 `uk_表名_属性`。
- 模板不写行内 JS；布局优先 flex（流程画布是二维连线，允许用 LogicFlow，不算违反 flex 规则）；相邻 `el-button` 容器不加 `gap`；`el-dialog` 默认 `draggable`。
- 可见文案用普通标签，不要用 `el-text`；间距不用 `el-space`。
- 图标必须先确认 `@element-plus/icons-vue` 有该导出再 import。本计划首页四入口用已在项目里用过的：`Tickets`（【我的待办】）、`EditPen`（【我发起的】）、`Finished`（【我处理的】）、`Grid`（【我的应用】）。
- 不删不改使用者已有的注释和 `console.log`。
- 文件一律 UTF-8 无 BOM；写完中文要回读确认没变成乱码。
- 界面用词固定：【添加数据】【数据管理】【新增】【编辑】【删除】【保存草稿】【提交】【再次提交】【通过】【驳回】【撤回】【重试】【我的应用】【我的待办】【我发起的】【我处理的】【表单设计】【流程设计】【表单发布】【转为流程表单】。例子用应用【人事】、表【请假单】。
- **不要做**：转办、加签、并行两条线、流程转回普通、首页【我发起的】删除、已通过后在【我发起的】里改、流程表单导入 Excel、审批里编辑子表行、按表收权、站外通知。
- 待办抽屉的读和写全部走 `/api/workflow/...`。不要给待办或失权发起人开放 `PATCH /apps/:appId/forms/:formId/records/:id`。
- **引擎不直接写 Mongo 的 `data`。** 两扇门负责保存字段；引擎只读数据算分支、改实例和待办、写 `workflowStatus` / `workflowInstanceId`；唯一例外是审批写回，由引擎调 `FormRecordPersistService.persist`。
- 未经使用者批准不要用浏览器点页面。

## File Structure

```text
server/sql/2026-09-06-workflow-form.sql                          # formKind + 三张流程表；只生成，不执行
server/src/application/access/app-access.service.ts              # canUse / canConfigure；本期只认所有者
server/src/application/access/app-access.service.spec.ts
server/src/application/app-form.entity.ts                        # 加 formKind
server/src/application/dto/create-form.dto.ts                    # 建表可选 formKind
server/src/application/dto/convert-form-kind.dto.ts              # 只接受 formKind=workflow
server/src/application/application.service.ts                    # 用 AppAccessService；建表/转换/删表删应用连带流程表
server/src/application/application.module.ts                     # 注册流程实体和服务
server/src/application/form-record/form-record.persist.ts        # FormRecordPersistService：从鉴权拆出的保存
server/src/application/form-record/form-record.persist.spec.ts
server/src/application/form-record/form-record.required.ts       # 主表必填校验
server/src/application/form-record/form-record.required.spec.ts
server/src/application/form-record/form-record.service.ts        # 工作台/数据管理这扇门；intent 分流
server/src/application/form-record/form-record.query.ts          # workflowStatus、pickApproved
server/src/application/form-record/form-record.store.ts          # 分批回填 / 写流程冗余
server/src/application/form-record/dto/create-record.dto.ts      # intent
server/src/application/form-record/dto/patch-record.dto.ts       # intent
server/src/application/form-record/dto/query-records.dto.ts      # workflowStatus、pickApproved
server/src/application/workflow/workflow-definition.entity.ts
server/src/application/workflow/workflow-instance.entity.ts
server/src/application/workflow/workflow-task.entity.ts
server/src/application/workflow/workflow.types.ts                # WorkflowGraph / ApproverRule 等类型
server/src/application/workflow/workflow.graph.ts                # 规范化、发布校验、沿连线走（纯函数）
server/src/application/workflow/workflow.graph.spec.ts
server/src/application/workflow/workflow.approver.ts             # 三种来源解析成人 id
server/src/application/workflow/workflow.approver.spec.ts
server/src/application/workflow/workflow.engine.ts               # 提交 / 通过 / 驳回 / 撤回 / 重试
server/src/application/workflow/workflow.engine.spec.ts
server/src/application/workflow/workflow-definition.service.ts   # 草稿、发布、启用
server/src/application/workflow/workflow-instance.service.ts     # 首页【我发起的】这扇门
server/src/application/workflow/workflow-inbox.service.ts        # 三个列表 + 打开抽屉
server/src/application/workflow/workflow-render.service.ts       # 选记录 / 联动 / 上传
server/src/application/workflow/workflow.controller.ts           # /api/workflow/...
server/src/application/workflow/app-workflow.controller.ts       # /api/apps/:appId/forms/:formId/workflow
server/src/application/workflow/dto/*.dto.ts
front/src/api/workflow.js
front/src/components/workflow-design/workflowGraph.js            # 产品图 ↔ LogicFlow
front/src/components/workflow-design/workflowGraph.spec.js
front/src/components/workflow-design/workflowValidate.js
front/src/components/workflow-design/workflowValidate.spec.js
front/src/components/workflow-design/WorkflowDesignPanel.vue
front/src/components/workflow-design/WorkflowNodePalette.vue
front/src/components/workflow-design/WorkflowNodeProps.vue
front/src/components/workflow-design/WorkflowEdgeProps.vue
front/src/components/workflow-design/RolePicker.vue              # 选角色弹框（权限计划的使用范围页复用）
front/src/components/workflow-inbox/workflowStatus.js
front/src/components/workflow-inbox/WorkflowInboxList.vue
front/src/components/workflow-inbox/WorkflowInboxCard.vue
front/src/components/workflow-inbox/WorkflowInboxDrawer.vue
front/src/components/workflow-inbox/WorkflowMiniGraph.vue
front/src/components/form-fill/FormFillGrid.vue                  # 加 fieldAccess（隐藏 / 只读按节点）
front/src/components/form-workspace/recordDataSource.js          # 从详情抽屉抽出读/写
front/src/views/WorkflowInboxView.vue
front/src/views/FormDesignView.vue                               # 加【流程设计】页签
front/src/views/AppWorkspaceView.vue                             # 建表类型、转为流程、侧栏三行
front/src/views/HomeView.vue / front/src/components/AppHeader.vue # 顶栏四入口
docs/testcases/2026-09-06-workflow-form-test-cases.md
docs/testcases/2026-08-31-complex-form-manual-tests.md
docs/testcases/README.md
docs/guides/2026-09-06-workflow-form-usage.md
docs/TODO.md
```

职责：`workflow.graph.ts` 只算图（校验、选下一条线），不碰库。`workflow.approver.ts` 只把节点规则变成启用中的用户 id。`workflow.engine.ts` 改实例 / 待办 / Mongo 冗余键；审批写回调 `FormRecordPersistService`。`FormRecordService`（工作台门）和 `WorkflowInstanceService`（首页门）都先鉴权、再 `persist`、再调引擎。**引擎不注入 `FormRecordService`，`FormRecordService` 注入引擎**，避免 provider 互相依赖。

依赖关系（箭头指向被注入方）：

```text
FormRecordController ─▶ FormRecordService ─▶ FormRecordPersistService
                                          └▶ WorkflowEngine ─▶ FormRecordPersistService
WorkflowController ─▶ WorkflowInstanceService ─▶ FormRecordPersistService
                                             └▶ WorkflowEngine
                   ─▶ WorkflowInboxService / WorkflowRenderService
ApplicationService ─▶ WorkflowDefinition 仓库（直接读，不经服务）
```

---

### Task 1: 访问判定入口（本期只认所有者）

**Files:**
- Create: `server/src/application/access/app-access.service.ts`
- Create: `server/src/application/access/app-access.service.spec.ts`
- Modify: `server/src/application/application.module.ts`
- Modify: `server/src/application/application.service.ts`（`requireOwnedApp` 换成判定服务）
- Modify: `server/src/application/dictionary/dictionary.service.ts`
- Modify: `server/src/application/form-record/form-record.service.ts`（`requireForm` 里的所有者查询）
- Modify: 上述三个服务的 `*.spec.ts`，把「非所有者」用例改成打判定服务的桩

**Interfaces:**
- Produces:

```ts
export type AppAccess = {
  app: Application;
  canUse: boolean;
  canConfigure: boolean;
  isOwner: boolean;
};

@Injectable()
export class AppAccessService {
  getAccess(userId: number, appId: number): Promise<AppAccess>;
  requireUse(userId: number, appId: number): Promise<Application>;
  requireConfigure(userId: number, appId: number): Promise<Application>;
  requireOwner(userId: number, appId: number): Promise<Application>;
}
```

- 拒绝时一律 `NotFoundException('应用不存在')`，和现在对非创建人一样，不要改成 403。
- 本期 `canUse` / `canConfigure` / `isOwner` 三者相同：`application.ownerId === userId`。第 2 期只改这个服务内部，不要再扫一遍调用点。
- 同一次 `getAccess` 调用内算完三个布尔；调用方在一个 HTTP 处理里需要多次判定时，先拿 `AppAccess` 再读布尔，不要连查四张表。不要做成跨请求缓存。
- 删应用、移交（第 2 期）继续走 `requireOwner`。读字典本期先走 `requireUse`（和现在结果一样，都是所有者）。

- [ ] **Step 1: 写失败测试**

```ts
it('所有者能使用也能配置', async () => {
  appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 3, name: '人事' });
  await expect(service.getAccess(3, 8)).resolves.toMatchObject({
    canUse: true,
    canConfigure: true,
    isOwner: true,
  });
});

it('其他人当作应用不存在', async () => {
  appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 3, name: '人事' });
  await expect(service.requireUse(9, 8)).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.requireConfigure(9, 8)).rejects.toMatchObject({
    message: '应用不存在',
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- app-access.service.spec.ts`

Expected: FAIL，文件或类还不存在。

- [ ] **Step 3: 写最小实现并替换调用**

```ts
@Injectable()
export class AppAccessService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
  ) {}

  async getAccess(userId: number, appId: number): Promise<AppAccess> {
    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException('应用不存在');
    const isOwner = app.ownerId === userId;
    return { app, isOwner, canConfigure: isOwner, canUse: isOwner };
  }

  async requireUse(userId: number, appId: number) {
    const access = await this.getAccess(userId, appId);
    if (!access.canUse) throw new NotFoundException('应用不存在');
    return access.app;
  }

  async requireConfigure(userId: number, appId: number) {
    const access = await this.getAccess(userId, appId);
    if (!access.canConfigure) throw new NotFoundException('应用不存在');
    return access.app;
  }

  async requireOwner(userId: number, appId: number) {
    const access = await this.getAccess(userId, appId);
    if (!access.isOwner) throw new NotFoundException('应用不存在');
    return access.app;
  }
}
```

`ApplicationService` / `DictionaryService` / `FormRecordService` 的 `requireOwnedApp` 删掉，改调 `AppAccessService`。`list(ownerId)` 本期仍按 `ownerId` 查，第 2 期再改首页列表。`deleteApp` / 改应用名仍 `requireOwner`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test --prefix server -- app-access.service.spec.ts application.service.spec.ts dictionary.service.spec.ts form-record.service.spec.ts`

Expected: PASS。非所有者进应用、读表单、读写记录、读字典仍提示「应用不存在」。

- [ ] **Step 5: 提交（仅当使用者要求）**

```bash
git add server/src/application/access server/src/application/application.service.ts server/src/application/application.module.ts server/src/application/dictionary server/src/application/form-record/form-record.service.ts
git commit -m "$(cat <<'EOF'
抽出应用访问判定服务，调用点不再各自查所有者

- 新增 AppAccessService，本期 canUse / canConfigure 仍只认所有者
- 应用、字典、填报三个服务改走统一入口，拒绝文案保持「应用不存在」
EOF
)"
```

---

### Task 2: 表单类型列和新建表单

**Files:**
- Create: `server/sql/2026-09-06-workflow-form.sql`（本任务先写 `ALTER TABLE app_form`，三张流程表放到 Task 5 同一文件后续追加）
- Modify: `server/src/application/app-form.entity.ts`
- Modify: `server/src/application/dto/create-form.dto.ts`
- Modify: `server/src/application/application.service.ts`（`createForm`、`toFormItem`、`toFormDetail`、`directory`）
- Modify: `server/src/application/application.service.spec.ts`
- Modify: `front/src/views/AppWorkspaceView.vue`
- Modify: `front/src/api/apps.js`（`createFormApi` 已能传 payload，确认带上 `formKind`）

**Interfaces:**
- `AppForm.formKind`: `'normal' | 'workflow'`，默认 `'normal'`。
- `CreateFormDto.formKind` 可选；缺省当 `'normal'`；传了但不是这两个值 → DTO 校验 400（`@IsIn(['normal', 'workflow'])`）。
- `toFormItem` / 目录节点增加 `formKind`。
- 目录、`getForm` 都要带上，前端才能决定顶栏有没有【流程设计】。

- [ ] **Step 1: 写 SQL 和失败测试**

`server/sql/2026-09-06-workflow-form.sql` 先写：

```sql
ALTER TABLE `app_form`
  ADD COLUMN `formKind` varchar(16) NOT NULL DEFAULT 'normal';
```

测试：`createForm` 不传类型时返回 `formKind: 'normal'`；传 `'workflow'` 时返回 `'workflow'`；DTO 传 `'foo'` 时 `ValidationPipe` 400（在 DTO 单测或 e2e 里断言）。

- [ ] **Step 2: 停下问使用者是否执行 SQL**

把脚本路径和 `ALTER` 内容给使用者看。未点名该文件、未明确同意，不得对数据库执行。实体可以先写上；没跑 SQL 时启动不会报错，但一查 `app_form` 就会报缺列——这是预期，等同意后再跑。

- [ ] **Step 3: 实现建表类型**

```ts
// create-form.dto.ts
@IsOptional()
@IsIn(['normal', 'workflow'])
formKind?: 'normal' | 'workflow';
```

`createForm` 写入 `formKind: dto.formKind ?? 'normal'`。已有表单没有这一列时，SQL 默认 `normal`，行为不变。

【新建表单】对话框：名称下面加单选，默认「普通表单」。两项各带一句说明（普通：填完点保存就是正式数据；流程：填完点提交进入审批，要先发布流程才能填）。`el-dialog` 加 `draggable`。改到名称提交函数时抽 `submitNameDialog`，不要在 `@click` 里写语句。

- [ ] **Step 4: 跑测试**

Run: `npm test --prefix server -- application.service.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交（仅当使用者要求）**

提交信息写明：新建表单可选普通 / 流程，类型落在 `app_form.formKind`。

---

### Task 3: 只允许普通 → 流程

**Files:**
- Create: `server/src/application/dto/convert-form-kind.dto.ts`
- Modify: `server/src/application/application.controller.ts`（`PATCH /apps/:appId/forms/:formId/kind`）
- Modify: `server/src/application/application.service.ts`
- Modify: `server/src/application/form-record/form-record.store.ts`（分批回填）
- Test: `server/src/application/application.service.spec.ts`
- Test: `server/src/application/form-record/form-record.store.spec.ts`
- Modify: `front/src/views/AppWorkspaceView.vue`（表单树菜单）
- Modify: `front/src/api/apps.js`

**Interfaces:**
- `PATCH` body：`{ formKind: 'workflow' }`。已经是流程、或想改回 `normal`：`BadRequestException`，文案「流程表单不能转回普通表单」/「请指定转为流程表单」。
- `FormRecordStore.backfillApprovedMissing(formId): Promise<number>`：只给还没有 `workflowStatus` 的文档写 `'approved'`，每批 500 条，循环到改不动为止，返回总条数。不要一条 `updateMany` 锁整集合。不建流程实例。不改 `data`。
- 鉴权：`requireConfigure`（第 1 期等于所有者；第 2 期自动扩到配置名单）。
- 返回转换后的表单项（含 `formKind: 'workflow'`）。

- [ ] **Step 1: 写失败测试**

```ts
it('普通表单转为流程并回填已有记录', async () => {
  formRepo.findOne.mockResolvedValue({ id: 12, applicationId: 8, formKind: 'normal' });
  store.backfillApprovedMissing.mockResolvedValue(3);
  const result = await service.convertFormKind(1, 8, 12, { formKind: 'workflow' });
  expect(store.backfillApprovedMissing).toHaveBeenCalledWith(12);
  expect(result.formKind).toBe('workflow');
});

it('流程表单不能转回普通', async () => {
  formRepo.findOne.mockResolvedValue({ id: 12, applicationId: 8, formKind: 'workflow' });
  await expect(service.convertFormKind(1, 8, 12, { formKind: 'normal' }))
    .rejects.toThrow('流程表单不能转回普通表单');
});
```

`form-record.store.spec.ts`：`updateMany` 桩前两次返回 `modifiedCount: 500`、第三次 `120`，断言调用 3 次且返回 1120；过滤条件是 `{ workflowStatus: { $exists: false } }`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- application.service.spec.ts form-record.store.spec.ts`

Expected: FAIL，`convertFormKind` / `backfillApprovedMissing` 不存在。

- [ ] **Step 3: 实现接口和菜单**

```ts
// form-record.store.ts
async backfillApprovedMissing(formId: number): Promise<number> {
  const col = this.col(formId);
  let total = 0;
  for (;;) {
    const ids = await col
      .find({ workflowStatus: { $exists: false } }, { projection: { _id: 1 } })
      .limit(500)
      .toArray();
    if (!ids.length) return total;
    const result = await col.updateMany(
      { _id: { $in: ids.map((item) => item._id) }, workflowStatus: { $exists: false } },
      { $set: { workflowStatus: 'approved' } },
    );
    total += result.modifiedCount;
    if (result.modifiedCount === 0) return total;
  }
}
```

表单树普通表单菜单加【转为流程表单】。确认框写清：「已有的 N 条数据将记为已通过，且发布流程之前不能再填报」。条数用现有 query 的 `total`（没有就写「已有数据」）。流程表单菜单**不要**出现「转为普通表单」。删表单确认框顺手改成「将同时删除该表单已填报的 N 条数据，不可恢复」（权限规格 §6.3，现在就能改，不要等第 2 期）。

- [ ] **Step 4: 跑测试确认通过**

Expected: PASS。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 4: 拆出保存服务，创建人改当前登录人，补主表必填

**Files:**
- Create: `server/src/application/form-record/form-record.persist.ts`
- Create: `server/src/application/form-record/form-record.persist.spec.ts`
- Create: `server/src/application/form-record/form-record.required.ts`
- Create: `server/src/application/form-record/form-record.required.spec.ts`
- Modify: `server/src/application/form-record/form-record.service.ts`
- Modify: `server/src/application/form-record/form-record.service.spec.ts`
- Modify: `server/src/application/form-record/dto/create-record.dto.ts`
- Modify: `server/src/application/form-record/dto/patch-record.dto.ts`
- Modify: `server/src/application/form-record/form-record.controller.ts`（把 `intent` 传进去）
- Modify: `server/src/application/application.module.ts`（注册 `FormRecordPersistService`）

**Interfaces:**
- Consumes: Task 1 的 `requireUse`。
- Produces:

```ts
export type PersistRecordInput = {
  form: AppForm;
  actorId: number;
  data: Record<string, unknown>;
  /** 有则更新（合并到已有 data），无则新建 */
  recordId?: string;
  /**
   * 要校验必填的主表字段 key。缺省 = 不校验主表必填（普通表单保持现状，只校验子表）。
   * 传 [] 表示不校验；传 ['field_reason'] 只校验这些（审批写回用）；
   * 传 'all' 校验全部主表必填（流程草稿 / 提交用）。
   */
  requiredKeys?: string[] | 'all';
  /** 新建时也不生成流水号（审批写回不会新建，此项为保险） */
  skipSerial?: boolean;
};

@Injectable()
export class FormRecordPersistService {
  persist(input: PersistRecordInput): Promise<FormRecordDoc>;
}

// form-record.required.ts（纯函数）
export function assertRequiredFields(
  fields: FormField[] | null,
  data: Record<string, unknown>,
  keys: string[] | 'all',
): void; // 缺什么抛 BadRequestException('请填写xxx')，和前端 firstRequiredError 同一句
```

- `persist` **不查**应用权限，也不看 `intent`。类型转换（`coerceRecordData` / `mergeRecordData`）、子表约束、唯一（更新时排除自己）、流水号（只在新建且未 `skipSerial` 时生成）、主表必填都在这里。`createdBy` / `updatedBy` 写 `actorId`。
- `FormRecordService.create/update` 先 `requireUse`，再调 `persist`。第一个参数改名为 `actorId`，语义就是登录人，**不要**再写 `application.ownerId`。
- `intent` 本任务先接进 DTO 和方法签名，真正按草稿/提交分流在 Task 10。本任务：所有表单忽略 `intent`，行为与现在保存相同，只是创建人已是当前用户。
- `assertRequiredFields` 对子表 `subform`、分割线、登录人姓名/部门、关联子表单、标签页容器本身不算必填项；标签页里的字段要算（用 `flattenFields`）。

- [ ] **Step 1: 写失败测试**

`form-record.service.spec.ts` 里把 `ownedApp.ownerId` 改成 `9`，登录人仍是 `1`：

```ts
it('创建人是当前登录人不是应用所有者', async () => {
  access.requireUse.mockResolvedValue({ id: 8, ownerId: 9 });
  formRepo.findOne.mockResolvedValue(form);
  await service.create(1, 8, 12, { name: '张三' });
  expect(store.insert).toHaveBeenCalledWith(
    expect.objectContaining({ createdBy: 1, updatedBy: 1 }),
  );
});
```

`form-record.required.spec.ts`：

```ts
const fields = [
  { key: 'reason', title: '事由', type: 'textarea', required: true },
  { key: 'tabs', title: '页签', type: 'tabs', fields: [
    { key: 'days', title: '天数', type: 'number', required: true },
  ] },
  { key: 'rows', title: '明细', type: 'subform', required: true, fields: [] },
];

it('主表必填为空时提示请填写', () => {
  expect(() => assertRequiredFields(fields, { reason: '' }, 'all')).toThrow('请填写事由');
});

it('标签页里的必填也算', () => {
  expect(() => assertRequiredFields(fields, { reason: 'x' }, 'all')).toThrow('请填写天数');
});

it('只校验指定 key', () => {
  expect(() => assertRequiredFields(fields, { reason: '' }, ['days'])).toThrow('请填写天数');
});

it('子表单不在这里校验', () => {
  expect(() => assertRequiredFields(fields, { reason: 'x', days: 1 }, 'all')).not.toThrow();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- form-record`

Expected: 创建人断言失败（现在写入的是传入的第一个参数，而调用方把它当所有者）；`assertRequiredFields` 不存在。

- [ ] **Step 3: 抽出 persist 并改调用**

```ts
@Injectable()
export class FormRecordPersistService {
  constructor(
    private readonly store: FormRecordStore,
    private readonly serialSeq: FormSerialSeqService,
  ) {}

  async persist(input: PersistRecordInput): Promise<FormRecordDoc> {
    const { form, actorId, recordId } = input;
    const fields = parseFormSchema(form.fields).fields;
    const existing = recordId ? await this.store.findById(form.id, recordId) : null;
    if (recordId && !existing) throw new NotFoundException('记录不存在');
    const data = existing
      ? mergeRecordData(existing.data ?? {}, input.data, fields)
      : coerceRecordData(fields, input.data);
    if (input.requiredKeys) assertRequiredFields(fields, data, input.requiredKeys);
    assertSubformConstraints(fields, data);          // 从 FormRecordService 挪过来的私有函数
    await this.assertUniqueFields(form.id, fields, data, recordId);
    if (!existing && !input.skipSerial) await this.applySerialNumber(form.id, fields, data);
    if (existing) {
      const doc = await this.store.replaceData(form.id, recordId!, data, actorId);
      if (!doc) throw new NotFoundException('记录不存在');
      return doc;
    }
    const now = new Date();
    const inserted = await this.store.insert({
      appId: form.applicationId, formId: form.id,
      createdBy: actorId, createdAt: now, updatedBy: actorId, updatedAt: now,
      data,
    });
    const doc = await this.store.findById(form.id, inserted.id);
    if (!doc) throw new NotFoundException('记录不存在');
    return doc;
  }
}
```

`FormRecordService` 里原来的 `assertSubformConstraints` / `assertUniqueFields` / `applySerialNumber` 挪到 persist（或抽成同目录纯函数被两边引用），`create` / `update` 变成：先 `requireUse` 取 app，再 `formRepo.findOne` 取 form，再 `persist`，最后 `toView`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test --prefix server -- form-record`

Expected: PASS。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 5: 流程三张表、类型文件、模块注册

**Files:**
- Modify: `server/sql/2026-09-06-workflow-form.sql`（追加三张表）
- Create: `server/src/application/workflow/workflow-definition.entity.ts`
- Create: `server/src/application/workflow/workflow-instance.entity.ts`
- Create: `server/src/application/workflow/workflow-task.entity.ts`
- Create: `server/src/application/workflow/workflow.types.ts`
- Modify: `server/src/application/application.module.ts`（`forFeature` 加三张表）
- Modify: `server/src/application/application.service.ts`（`deleteForm` / `deleteApp` 连带删流程三张表）

**Interfaces:**
- 表名：`workflow_definition`、`workflow_instance`、`workflow_task`。
- `workflow_definition`：`appId`、`formId`（`uk_workflow_definition_formId`）、`enabled`、`draftGraph`、`publishedGraph`、`publishedVersion`（默认 0）、`publishedAt`、时间列。`IDX_workflow_definition_appId`。
- `workflow_instance`：`appId`、`formId`、`recordId`（varchar 24）、`definitionVersion`、`graph`（JSON 快照）、`initiatorId`、`status`、`currentNodeKey`、`visitedNodeKeys`（JSON 数组）、`hasApproved`、`round`、`errorReason`、`retryStep`、**`notes`（JSON 数组，系统进度说明：`{ at, text }`，如「发起人没有所属部门，本节点按角色全公司派发」「审批人已停用」「未经过审批即结束」）**、`startedAt`、`endedAt`。`uk_workflow_instance_formId_recordId`。`IDX_workflow_instance_initiatorId`、`IDX_workflow_instance_appId_status`。
- `workflow_task`：`instanceId`、`nodeKey`、`round`、`assigneeId`、`status`、`action`、`comment`、`cancelReason`、`finishedAt`。`uk_workflow_task_instanceId_nodeKey_assigneeId_round`。`IDX_workflow_task_assigneeId_status`、`IDX_workflow_task_instanceId`。
- 状态字面量：实例 `draft | running | approved | rejected | error`；任务 `pending | done | cancelled`；动作 `approve | reject`；`retryStep`：`'mongo' | 'advance' | null`。
- 本期不另建 history 表，任务表 + `notes` 当历史。
- `workflow.types.ts` 放 Task 6 要用的 `WorkflowGraph` / `WorkflowNode` / `WorkflowEdge` / `ApproverRule` / `FieldAccess`：

```ts
export type FieldAccess = 'editable' | 'readonly' | 'hidden';
export type ApproverRule = {
  userIds: number[];
  roleIds: number[];
  memberFieldKeys: string[];
  /** 只作用于 roleIds；缺省当 true */
  sameDeptAsInitiator?: boolean;
};
export type WorkflowNodeBase = { key: string; title: string; x: number; y: number };
export type WorkflowNode =
  | (WorkflowNodeBase & { type: 'start' | 'end' | 'branch' })
  | (WorkflowNodeBase & {
      type: 'approve';
      approver: ApproverRule;
      signMode: 'any' | 'all';
      commentRequiredOnApprove: boolean;
      fieldAccess: Record<string, FieldAccess>;
    });
export type WorkflowEdgeCondition = {
  logic: 'all' | 'any';
  items: { key: string; op: string; value?: unknown }[];
};
export type WorkflowEdge = {
  key: string;
  from: string;
  to: string;
  title?: string;
  sort?: number;
  isDefault?: boolean;
  when?: WorkflowEdgeCondition;
};
export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
export type InstanceStatus = 'draft' | 'running' | 'approved' | 'rejected' | 'error';
export type TaskStatus = 'pending' | 'done' | 'cancelled';
export type TaskAction = 'approve' | 'reject';
export type InstanceNote = { at: string; text: string };
```

SQL 追加：

```sql
CREATE TABLE IF NOT EXISTS `workflow_definition` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `draftGraph` json NULL,
  `publishedGraph` json NULL,
  `publishedVersion` int NOT NULL DEFAULT 0,
  `publishedAt` datetime(6) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_definition_formId` (`formId`),
  KEY `IDX_workflow_definition_appId` (`appId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workflow_instance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `recordId` varchar(24) NOT NULL,
  `definitionVersion` int NOT NULL,
  `graph` json NOT NULL,
  `initiatorId` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `currentNodeKey` varchar(64) NULL,
  `visitedNodeKeys` json NULL,
  `hasApproved` tinyint(1) NOT NULL DEFAULT 0,
  `round` int NOT NULL DEFAULT 1,
  `errorReason` varchar(255) NULL,
  `retryStep` varchar(32) NULL,
  `notes` json NULL,
  `startedAt` datetime(6) NULL,
  `endedAt` datetime(6) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_instance_formId_recordId` (`formId`, `recordId`),
  KEY `IDX_workflow_instance_initiatorId` (`initiatorId`),
  KEY `IDX_workflow_instance_appId_status` (`appId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workflow_task` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instanceId` int NOT NULL,
  `nodeKey` varchar(64) NOT NULL,
  `round` int NOT NULL,
  `assigneeId` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `action` varchar(16) NULL,
  `comment` varchar(1000) NULL,
  `cancelReason` varchar(64) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `finishedAt` datetime(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_task_instanceId_nodeKey_assigneeId_round` (`instanceId`, `nodeKey`, `assigneeId`, `round`),
  KEY `IDX_workflow_task_assigneeId_status` (`assigneeId`, `status`),
  KEY `IDX_workflow_task_instanceId` (`instanceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 1: 写实体、类型文件，追加 SQL，注册进 `ApplicationModule.forFeature`**

不新建 Nest 模块。`deleteForm`：删 `app_form` 之前按 `formId` 删 `workflow_task`（按该表实例 id）、`workflow_instance`、`workflow_definition`。`deleteApp`：按 `appId` 同样三张表都删（配置名单 / 使用范围两张表在权限计划 Task 7 补）。

- [ ] **Step 2: 再次把完整 SQL 给使用者看，未同意不执行**

- [ ] **Step 3: 提交（仅当使用者要求）**

---

### Task 6: 流程图纯函数（校验 + 沿连线走）

**Files:**
- Create: `server/src/application/workflow/workflow.graph.ts`
- Create: `server/src/application/workflow/workflow.graph.spec.ts`
- Create: `front/src/components/workflow-design/workflowValidate.js`（发布前前端同一套规则，文案给人看）
- Create: `front/src/components/workflow-design/workflowValidate.spec.js`

**Interfaces:**
- Consumes: Task 5 `workflow.types.ts`。
- Produces:

```ts
export function validatePublishedGraph(graph: WorkflowGraph, formFields: FormField[] | null): string[];
export function matchEdgeCondition(when: WorkflowEdgeCondition | undefined, data: Record<string, unknown>): boolean;
export type NextStay =
  | { kind: 'approve'; nodeKey: string; visited: string[] }
  | { kind: 'end'; visited: string[]; passedApprove: boolean }
  | { kind: 'error'; visited: string[]; reason: string };
export function nextStay(graph: WorkflowGraph, fromNodeKey: string, data: Record<string, unknown>): NextStay;
```

- `validatePublishedGraph` 规则按规格 §5.6：开始必须恰好一个且一条出线、至少一个审批、至少一个结束、审批有名称和一条出线、分支出线 ≥2 且恰好一条「其他情况」、非默认线有条件、从开始走不到的节点、走不到结束、环、结束不能有出线、审批人三种来源至少一种、人员字段还在表单上、条件引用的字段还在。
- `matchEdgeCondition`：复用选项过滤那套 `eq/ne/contains/ncontains/empty/nempty`，数字 `gt/gte/lt/lte`，日期按 `dayjs` 比较，人员/部门 `eq/empty`。本期不做动态相对日期；配了 `dynamic` 当不满足。
- `nextStay`：从该节点出线往下走，穿过分支（按 `sort` 第一条命中，否则 `isDefault`），直到审批或结束。经过的分支 key 也进 `visited`。走到结束且沿途没有经过任何审批 → `passedApprove: false`（引擎据此写 note「未经过审批即结束」）。

- [ ] **Step 1: 写失败测试（用规格里的请假单图）**

```ts
const leaveGraph = { /* 规格 §15.1 那份 JSON */ };

it('事假走到部门审批', () => {
  const stay = nextStay(leaveGraph, 'start', { field_leave_type: '事假' });
  expect(stay).toMatchObject({ kind: 'approve', nodeKey: 'n1' });
  expect(stay.visited).toEqual(['br1', 'n1']);
});

it('病假跳过部门审批', () => {
  expect(nextStay(leaveGraph, 'start', { field_leave_type: '病假' }))
    .toMatchObject({ kind: 'approve', nodeKey: 'n2' });
});

it('只有分支直达结束时标记未经审批', () => {
  expect(nextStay(branchToEndGraph, 'start', {}))
    .toMatchObject({ kind: 'end', passedApprove: false });
});

it('缺其他情况不能发布', () => {
  const errors = validatePublishedGraph(brokenBranch, fields);
  expect(errors.some((item) => item.includes('其他情况'))).toBe(true);
});

it('环不能发布', () => {
  expect(validatePublishedGraph(cycleGraph, fields).join('')).toContain('不能绕回');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- workflow.graph.spec.ts`  
Run: `node --test front/src/components/workflow-design/workflowValidate.spec.js`

Expected: FAIL。

- [ ] **Step 3: 实现纯函数**

前端 `workflowValidate.js` 只做人话列表，算法与后端相同，不要一个过一个不过。条件匹配前后端各写一份小函数，用例对齐规格例子。

- [ ] **Step 4: 跑测试确认通过**

Expected: PASS。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 7: 审批人解析成人

**Files:**
- Create: `server/src/application/workflow/workflow.approver.ts`
- Create: `server/src/application/workflow/workflow.approver.spec.ts`
- Modify: `server/src/application/application.module.ts`（`forFeature` 加 `UserRole`、`UserDepartment`、`Role`、`Department`）

**Interfaces:**
- Consumes: `ApproverRule`（Task 5）；`User`、`UserRole`、`UserDepartment`、`Role` 仓库。
- Produces:

```ts
export type ResolvedApprovers = {
  userIds: number[];
  /** 为空时的人话原因；有人时不填 */
  emptyReason?: string;
  /** 发起人没有部门记录、部门限定退化为不限定时为 true，引擎写 note */
  unrestrictedByMissingDept?: boolean;
};

@Injectable()
export class WorkflowApproverService {
  resolve(input: {
    nodeTitle: string;
    approver: ApproverRule;
    initiatorId: number;
    recordData: Record<string, unknown>;
  }): Promise<ResolvedApprovers>;
}
```

- 三种来源并集去重。停用账号、停用角色不要。
- `sameDeptAsInitiator` 缺省 `true`。只作用于 `roleIds`。发起人没有部门记录：不限定部门，`unrestrictedByMissingDept: true`。
- 勾了同部门但交集为空：`userIds: []`，`emptyReason: '节点「部门审批」在发起人所在部门没有可用的审批人'`。
- 三种来源都空：`emptyReason: '节点「xxx」没有可用的审批人'`。
- 判定角色用角色 **id** 且 `role.status = 'active'`，不要用登录态 `roleCodes`。

- [ ] **Step 1: 写失败测试**

覆盖：指定人员过滤停用；角色 ∩ 同部门；取消同部门勾选取全公司；人员字段多选；同一人角色+指定只出现一次；发起人无部门不失败且 `unrestrictedByMissingDept` 为真；同部门交集为空的 `emptyReason` 文案带「在发起人所在部门」。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- workflow.approver.spec.ts`

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 8: 流程草稿、发布、启用

**Files:**
- Create: `server/src/application/workflow/workflow-definition.service.ts`
- Create: `server/src/application/workflow/workflow-definition.service.spec.ts`
- Create: `server/src/application/workflow/app-workflow.controller.ts`
- Create: `server/src/application/workflow/dto/save-draft.dto.ts`、`dto/patch-enabled.dto.ts`
- Modify: `server/src/application/application.module.ts`
- Modify: `server/src/application/application.service.ts`（`getForm` / `directory` 直接查 `WorkflowDefinition` 仓库，附带 `workflowPublished`、`workflowEnabled`）

**Interfaces:**
- `GET /api/apps/:appId/forms/:formId/workflow`：`{ draftGraph, publishedGraph, publishedVersion, enabled, runningCount }`。`runningCount` = 该表 `status='running'` 的实例数，顶栏那句「当前已发布版本 v3。审批中的 2 条仍按提交时的版本走」用。没有行时返回空草稿（画布上预置一个开始节点由前端做）。鉴权 `requireConfigure`。
- `PUT .../workflow/draft`：只存 `draftGraph`，不改 `enabled`、不改 `publishedGraph`。
- `POST .../workflow/publish`：用 `validatePublishedGraph`，失败 400 并把错误数组放进 `message`（数组，前端逐条显示）。成功后 `publishedGraph = draftGraph`，`publishedVersion += 1`，`enabled = true`，写 `publishedAt`。
- `PATCH .../workflow` body `{ enabled: boolean }`：从未发布过（`publishedVersion === 0`）时打开开关要拒绝，「请先发布流程」。关掉只影响新数据，不改在途实例。
- 一张表一行定义，靠 `formId` 唯一约束；保存用先查再改，不要 insert 出第二行。
- `WorkflowDefinitionService.getRuntime(formId): Promise<{ published: boolean; enabled: boolean; graph: WorkflowGraph | null; version: number }>` 给 Task 10 / 12 的两扇门用。

- [ ] **Step 1: 写失败测试**

发布缺审批人 → 400，且 `enabled` 仍为 false。发布成功 → `enabled === true` 且版本 1。只保存草稿 → `publishedVersion === 0` 且 `getRuntime().published === false`。从未发布时 `PATCH enabled=true` → 400「请先发布流程」。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 9: 引擎（提交、通过、驳回、撤回、重试）

**Files:**
- Create: `server/src/application/workflow/workflow.engine.ts`
- Create: `server/src/application/workflow/workflow.engine.spec.ts`
- Modify: `server/src/application/form-record/form-record.store.ts`（`setWorkflowMeta`）
- Modify: `server/src/application/application.module.ts`

**Interfaces:**
- Consumes: Task 4 `FormRecordPersistService.persist`、Task 6 `nextStay`、Task 7 `WorkflowApproverService.resolve`、Task 8 `getRuntime`。
- Produces:

```ts
// form-record.store.ts
setWorkflowMeta(formId: number, id: string, meta: {
  workflowStatus: InstanceStatus;
  workflowInstanceId?: number;
}): Promise<void>; // $set，幂等

@Injectable()
export class WorkflowEngine {
  /** 保存草稿后调用：没有实例就建 draft 实例并写 Mongo 冗余；已有 draft 实例只刷 updatedAt */
  ensureDraft(input: { form: AppForm; recordId: string; actorId: number }): Promise<WorkflowInstance>;

  /**
   * 门已保存字段后调用。实例 status 属于 draft / rejected / error → running，
   * 没有实例则新建（首次直接提交）。用实例上钉死的图；新建时用当前已发布图。
   */
  submit(input: { form: AppForm; recordId: string; actorId: number }): Promise<WorkflowInstance>;

  /** 已通过后在数据管理再提交：换成当前已发布图和版本；没有实例则拒绝 */
  resubmitApproved(input: { form: AppForm; recordId: string; actorId: number }): Promise<WorkflowInstance>;

  /** 通过 / 驳回；dataPatch 只含本节点可编辑字段 */
  completeTask(input: {
    taskId: number; actorId: number; action: TaskAction; comment: string;
    dataPatch: Record<string, unknown>;
  }): Promise<{ waitingOthers: boolean; nextNodeTitle?: string }>;

  cancel(input: { instanceId: number; actorId: number }): Promise<void>;
  retry(input: { instanceId: number }): Promise<void>;

  /** 门删记录时调用：draft 实例连任务一起删；其它状态实例保留 */
  onRecordDeleted(formId: number, recordId: string): Promise<void>;
}
```

- **引擎不负责保存字段**（`submit` / `resubmitApproved` / `ensureDraft` 都假定门已经 `persist` 成功）。只有 `completeTask` 在通过时调 `persist({ recordId, requiredKeys: 可编辑字段 keys, skipSerial: true })`。
- 写库顺序（规格 §15.3）：① MySQL 待办 `pending → done`（条件更新）② Mongo `persist` + `setWorkflowMeta` ③ 派下一节点或结束。① 成功后 `retryStep = 'mongo'`，② 成功后 `retryStep = 'advance'`，③ 成功后清空。①失败不进异常，直接抛「这条待办已处理」。
- 完成待办：`UPDATE workflow_task SET status='done', action=?, comment=?, finishedAt=NOW() WHERE id=? AND status='pending' AND assigneeId=?`，影响 0 行 → `ConflictException('这条待办已处理')`。
- 撤回：`UPDATE workflow_instance SET status='draft', currentNodeKey=NULL, retryStep=NULL, errorReason=NULL WHERE id=? AND status IN ('running','error') AND hasApproved=0`，影响 0 行 → `ConflictException('审批人已开始处理，不能撤回')`。然后 pending 任务全部 `cancelled`，`cancelReason='发起人撤回'`；`setWorkflowMeta(draft)`。
- 或签：一人通过/驳回，取消其余 pending（原因「或签其他人已通过」/「或签其他人已驳回」）。会签：通过后立刻写回可编辑字段；还有 pending 则 `waitingOthers: true`，不派、不走；pending 清零才往下走。会签推进用条件更新 `UPDATE workflow_instance SET currentNodeKey=? ... WHERE id=? AND currentNodeKey=<本节点>`，影响 0 行说明另一个「最后一人」已推进，直接返回。驳回：或签、会签相同，其余 pending `cancelled`（「会签节点已驳回」/「或签其他人已驳回」），实例 `rejected`；驳回**不写** `dataPatch`。
- 通过后 `hasApproved = 1`。
- `submit`：`round` 按现有 +1（新建为 1），`hasApproved = 0`，`visitedNodeKeys = []`，条件更新 `WHERE id=? AND status IN ('draft','rejected','error')`；然后 `advance(instance, 'start')`。
- `resubmitApproved`：条件更新 `WHERE id=? AND status='approved'`；同时把 `graph`、`definitionVersion` 换成 `getRuntime()` 的当前已发布图；没有实例 → `BadRequestException('这条数据没有审批记录，不能重新提交')`。
- `advance(instance, fromNodeKey)`：`nextStay` → `approve` 时 `resolve` 审批人，空则实例 `error` + `errorReason`；有人则按唯一约束 `INSERT IGNORE` 派任务，写 `currentNodeKey`、`visitedNodeKeys`；`unrestrictedByMissingDept` 时追加 note「发起人没有所属部门，本节点按角色全公司派发」。`end` 时 `approved`、`endedAt`、`setWorkflowMeta(approved)`，`passedApprove=false` 追加 note「未经过审批即结束」。`error` 时 `error` + reason。
- `retry`：读 `retryStep`。`'mongo'` → 重放 ②③；`'advance'` → 只做 ③；`null` 且 `status='error'` → 重新 `advance(currentNodeKey ?? 'start')`（重新解析审批人）。所有更新带 `WHERE status='error'`，幂等。**审批人全部停用**：`retry` 时先把该节点 pending 任务里账号已停用的 `cancelled`（原因「审批人已停用」），再重新解析派发。
- `onRecordDeleted`：实例 `draft` → 删任务、删实例；其它状态保留（列表标「数据已删除」）。

- [ ] **Step 1: 写失败测试（按规格例子）**

```ts
describe('WorkflowEngine', () => {
  // 用 jest.fn 桩 instanceRepo / taskRepo / persist / approver / definition / store
  it('事假：提交后派给同部门经理，或签一人通过后另一人取消', async () => {
    approver.resolve.mockResolvedValue({ userIds: [21, 22] });
    await engine.submit({ form, recordId, actorId: 5 });
    expect(taskRepo.insert).toHaveBeenCalledTimes(1); // 一次批量插两人
    taskRepo.update.mockResolvedValueOnce({ affected: 1 });   // ① 21 done
    approver.resolve.mockResolvedValueOnce({ userIds: [9, 10] }); // 人事备案
    await engine.completeTask({ taskId: 1, actorId: 21, action: 'approve', comment: '', dataPatch: {} });
    expect(taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ nodeKey: 'n1', status: 'pending' }),
      expect.objectContaining({ status: 'cancelled', cancelReason: '或签其他人已通过' }),
    );
    expect(store.setWorkflowMeta).toHaveBeenCalledWith(12, recordId, expect.objectContaining({ workflowStatus: 'running' }));
  });

  it('病假：直接到人事备案，不经部门审批', async () => { /* visited 不含 n1 */ });

  it('会签：张三通过后仍等李四', async () => {
    taskRepo.count.mockResolvedValue(1); // 本节点还有 pending
    const result = await engine.completeTask({ taskId: 3, actorId: 9, action: 'approve', comment: '', dataPatch: { field_reason: '改' } });
    expect(result.waitingOthers).toBe(true);
    expect(persist.persist).toHaveBeenCalledWith(expect.objectContaining({ recordId, skipSerial: true, requiredKeys: ['field_reason'] }));
    expect(instanceRepo.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'approved' }));
  });

  it('会签：李四也通过后已通过', async () => { taskRepo.count.mockResolvedValue(0); /* status approved */ });

  it('会签：张三驳回则整单驳回且李四待办取消', async () => {
    await engine.completeTask({ taskId: 3, actorId: 9, action: 'reject', comment: '不批', dataPatch: { field_reason: '改' } });
    expect(persist.persist).not.toHaveBeenCalled();
    expect(taskRepo.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cancelReason: '会签节点已驳回' }));
  });

  it('撤回：有人通过过则失败', async () => {
    instanceRepo.update.mockResolvedValue({ affected: 0 });
    await expect(engine.cancel({ instanceId: 1, actorId: 5 })).rejects.toThrow('审批人已开始处理，不能撤回');
  });

  it('异常态也能撤回', async () => { /* WHERE status IN (running,error) */ });

  it('同一待办第二次完成失败', async () => {
    taskRepo.update.mockResolvedValue({ affected: 0 });
    await expect(engine.completeTask({ taskId: 1, actorId: 21, action: 'approve', comment: '', dataPatch: {} })).rejects.toThrow('这条待办已处理');
  });

  it('派发无人进异常且原因带节点名', async () => {
    approver.resolve.mockResolvedValue({ userIds: [], emptyReason: '节点「部门审批」在发起人所在部门没有可用的审批人' });
    await engine.submit({ form, recordId, actorId: 5 });
    expect(instanceRepo.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'error', errorReason: expect.stringContaining('在发起人所在部门') }));
  });

  it('没有实例的已通过不能重审', async () => {
    instanceRepo.findOne.mockResolvedValue(null);
    await expect(engine.resubmitApproved({ form, recordId, actorId: 5 })).rejects.toThrow('这条数据没有审批记录，不能重新提交');
  });

  it('重试从 mongo 步开始不再改待办', async () => {
    instanceRepo.findOne.mockResolvedValue({ id: 1, status: 'error', retryStep: 'mongo', currentNodeKey: 'n1' });
    await engine.retry({ instanceId: 1 });
    expect(taskRepo.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), expect.objectContaining({ status: 'done' }));
  });
});
```

用仓库桩，不要真连 MySQL。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- workflow.engine.spec.ts`

- [ ] **Step 3: 实现**

核心骨架（省略仓库注入）：

```ts
async completeTask(input) {
  const task = await this.taskRepo.findOne({ where: { id: input.taskId } });
  if (!task) throw new NotFoundException('待办不存在');
  const done = await this.taskRepo.update(
    { id: task.id, status: 'pending', assigneeId: input.actorId },
    { status: 'done', action: input.action, comment: input.comment, finishedAt: new Date() },
  );
  if (!done.affected) throw new ConflictException('这条待办已处理');
  const instance = await this.requireInstance(task.instanceId);
  const node = findApproveNode(instance.graph, task.nodeKey);
  if (input.action === 'reject') {
    await this.cancelPending(instance.id, task.nodeKey, node.signMode === 'all' ? '会签节点已驳回' : '或签其他人已驳回');
    await this.instanceRepo.update({ id: instance.id }, { status: 'rejected', currentNodeKey: null, endedAt: new Date() });
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, { workflowStatus: 'rejected' });
    return { waitingOthers: false };
  }
  await this.instanceRepo.update({ id: instance.id }, { retryStep: 'mongo', hasApproved: true });
  await this.writeBack(instance, node, input.dataPatch, input.actorId); // persist + 失败则 error
  await this.instanceRepo.update({ id: instance.id }, { retryStep: 'advance' });
  if (node.signMode === 'all') {
    const pending = await this.taskRepo.count({ where: { instanceId: instance.id, nodeKey: task.nodeKey, round: instance.round, status: 'pending' } });
    if (pending > 0) { await this.instanceRepo.update({ id: instance.id }, { retryStep: null }); return { waitingOthers: true }; }
  } else {
    await this.cancelPending(instance.id, task.nodeKey, '或签其他人已通过');
  }
  return this.advance(instance, task.nodeKey);
}
```

`advance` 里对 `approve` 结果先 `UPDATE workflow_instance SET currentNodeKey=? WHERE id=? AND currentNodeKey=<from>`，影响 0 行直接返回（另一个人已推进）。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 10: 工作台 / 数据管理这扇门（records + intent）

**Files:**
- Modify: `server/src/application/form-record/form-record.service.ts`
- Modify: `server/src/application/form-record/form-record.service.spec.ts`
- Modify: `server/src/application/form-record/form-record.query.ts`
- Modify: `server/src/application/form-record/form-record.query.spec.ts`
- Modify: `server/src/application/form-record/dto/query-records.dto.ts`

**Interfaces:**
- Consumes: Task 8 `getRuntime`、Task 9 引擎、Task 4 `persist`。
- `create(actorId, appId, formId, data, intent?)` / `update(actorId, appId, formId, recordId, data, intent?)`，`intent?: 'draft' | 'submit'`。
- `remove(actorId, appId, formId, recordId)`。
- `RecordQueryBody` 新增 `workflowStatus?: InstanceStatus`、`pickApproved?: boolean`。
- 返回的 `FormRecordView` 新增 `workflowStatus?: InstanceStatus`、`workflowInstanceId?: number`。

分流规则（写成一个私有 `routeWorkflow(form, existing, intent, actorId)`）：

| 表单 / 流程状态 | 请求 | 处理 |
|---|---|---|
| 普通表单 | 任意 `intent` | 忽略 `intent`，普通保存，不写 `workflowStatus` |
| 流程表单，从未发布 | 任意 | `BadRequestException('这张表单还没有配置流程，发布流程之后才能使用')`，**不调 persist** |
| 流程表单，已发布但 `enabled=false` | 任意 | `persist` 后 `setWorkflowMeta(approved)`，不建实例 |
| 流程表单，已启用，新建 | `draft` | `persist({ requiredKeys: 'all' })` → `engine.ensureDraft` |
| 同上 | `submit` | `persist({ requiredKeys: 'all' })` → `engine.submit` |
| 同上 | 不带 `intent` | 当 `draft`（前端不会这样调；保险） |
| 已有记录，`workflowStatus` 为 `draft` / `rejected` / `error` | `draft` / `submit` | 必须 `instance.initiatorId === actorId`，否则 `ForbiddenException('只有发起人能修改这条数据')`；`persist` → `ensureDraft` / `submit` |
| 已有记录，`running` | 任意 | `BadRequestException('审批中的数据不能编辑，请到「我发起的」撤回或等待审批')` |
| 已有记录，`approved` 且有实例 | `submit` | 必须 `instance.initiatorId === actorId`；`persist({ requiredKeys: 'all' })` → `engine.resubmitApproved` |
| 已有记录，`approved` 且有实例 | 不带 / `draft` | `BadRequestException('已通过的数据要重新提交审批，请点「提交」')` |
| 已有记录，`approved` 无实例（回填 / 停用期保存） | 任意 | 若当前 `enabled=false` → 普通保存保持 approved；否则 `BadRequestException('这条数据没有审批记录，不能重新提交')` |

- **发起人只看实例 `initiatorId`**，不要用 `createdBy` 兜底。
- `remove`：普通表单照旧。流程表单：`running` → `BadRequestException('审批中的数据不能删除')`；`draft` / `rejected` / `error` → 必须发起人；`approved` → 能进【数据管理】就能删（本期不再限发起人，规格 §11）。删成功后 `engine.onRecordDeleted`。发布页【删除】开关由前端控制按钮，服务端本期不校验开关（与现状一致）。
- `query`：
  - `workflowStatus` 有值则加过滤。
  - `pickApproved: true` 且 `form.formKind === 'workflow'` → 强制 `workflowStatus: 'approved'`。选择数据 / 关联数据弹窗、关联子表单列表传它；【数据管理】列表不传。
  - **带 `ids` 的查询不加 approved 条件**（关联格子回显标题，规格 §11「已经关联上的格子仍显示原来的标题」）。
  - 不要写「缺键也算通过」。判断是否流程表只看 `formKind`。

- [ ] **Step 1: 写失败测试**

```ts
it('未发布流程的流程表单一条数据都不写', async () => {
  formRepo.findOne.mockResolvedValue({ ...form, formKind: 'workflow' });
  definition.getRuntime.mockResolvedValue({ published: false, enabled: false, graph: null, version: 0 });
  await expect(service.create(1, 8, 12, { name: 'x' }, 'draft')).rejects.toThrow('这张表单还没有配置流程');
  expect(persist.persist).not.toHaveBeenCalled();
});

it('关掉启用后保存直接记为已通过且不建实例', async () => {
  definition.getRuntime.mockResolvedValue({ published: true, enabled: false, graph: g, version: 2 });
  await service.create(1, 8, 12, { name: 'x' });
  expect(store.setWorkflowMeta).toHaveBeenCalledWith(12, doc._id.toHexString(), { workflowStatus: 'approved' });
  expect(engine.submit).not.toHaveBeenCalled();
});

it('已通过只有实例发起人能再提交', async () => {
  store.findById.mockResolvedValue({ ...doc, createdBy: 1, workflowStatus: 'approved', workflowInstanceId: 7 });
  instanceRepo.findOne.mockResolvedValue({ id: 7, initiatorId: 2 });
  await expect(service.update(1, 8, 12, id, { name: 'y' }, 'submit')).rejects.toThrow('只有发起人能修改这条数据');
});

it('普通表单带 intent 仍当普通保存', async () => {
  await service.create(1, 8, 12, { name: 'x' }, 'submit');
  expect(store.setWorkflowMeta).not.toHaveBeenCalled();
  expect(engine.submit).not.toHaveBeenCalled();
});

it('审批中不能删除，草稿删除后引擎清实例', async () => { /* ... */ });
```

`form-record.query.spec.ts`：`pickApproved` + 流程表 → filter 带 `workflowStatus: 'approved'`；普通表不带；带 `ids` 时即使 `pickApproved` 也不带。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- form-record`

- [ ] **Step 3: 实现**

```ts
async create(actorId, appId, formId, data, intent?) {
  await this.access.requireUse(actorId, appId);
  const form = await this.requireForm(appId, formId);
  if (form.formKind !== 'workflow') {
    const doc = await this.persist.persist({ form, actorId, data });
    return this.view(doc, form);
  }
  const runtime = await this.definition.getRuntime(formId);
  if (!runtime.published) throw new BadRequestException('这张表单还没有配置流程，发布流程之后才能使用');
  if (!runtime.enabled) {
    const doc = await this.persist.persist({ form, actorId, data });
    await this.store.setWorkflowMeta(formId, doc._id.toHexString(), { workflowStatus: 'approved' });
    return this.view(doc, form);
  }
  const doc = await this.persist.persist({ form, actorId, data, requiredKeys: 'all' });
  const recordId = doc._id.toHexString();
  if (intent === 'submit') await this.engine.submit({ form, recordId, actorId });
  else await this.engine.ensureDraft({ form, recordId, actorId });
  return this.view(await this.store.findById(formId, recordId), form);
}
```

`update` 按上表分流；`remove` 按上文规则。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 11: 三个列表和打开抽屉

**Files:**
- Create: `server/src/application/workflow/workflow-inbox.service.ts`
- Create: `server/src/application/workflow/workflow-inbox.service.spec.ts`
- Create: `server/src/application/workflow/workflow.controller.ts`
- Create: `server/src/application/workflow/dto/query-inbox.dto.ts`

**Interfaces:**
- `POST /api/workflow/inbox/query` body：`{ kind: 'todo' | 'mine' | 'done'; appId?: number; page; pageSize }`。已登录即可，**不**调 `requireUse`。有 `appId` 只查该应用。
- `GET /api/workflow/inbox/count?appId=`：`{ todo: number }`，顶栏和侧栏【我的待办】角标用。
- `todo`：`assigneeId=我 AND status=pending`。关掉启用的表，在途待办仍要出现。
- `mine`：`initiatorId=我`，含 `draft/running/approved/rejected/error`。
- `done`：我点过通过或驳回的任务（`status=done` 且 `action` 有值）。取消的不算。
- 卡片字段：应用名、表单名、摘要（取表单前几个可见字段的文本）、状态中文、当前节点名、发起人名、时间。记录已删：`recordMissing: true`，标题「数据已删除」。待办卡片若该节点其它 pending 任务的处理人账号已停用、且自己也停用（列表里看不到）——**发起人和其它人**在 `mine` / 抽屉进度里要看到「审批人已停用」：抽屉返回 `tasks[].assigneeDisabled: boolean`。
- `GET /api/workflow/inbox/:kind/:id`：`todo`/`done` 的 id 是 taskId，`mine` 是 instanceId。一次返回：表单 fields、本条 record（或空）、该应用启用字典项、实例快照（`graph`、`status`、`currentNodeKey`、`visitedNodeKeys`、`round`、`errorReason`、`notes`）、任务列表（含 `assigneeName`、`assigneeDisabled`、`action`、`comment`、`cancelReason`、`finishedAt`）、人名、本条已有图片 / 文件的 URL、底部可做的动作（`canApprove` / `canReject` / `canDraft` / `canSubmit` / `canCancel` / `canRetry` / `readOnly`）、当前节点 `fieldAccess`（仅 `todo`）、`commentRequiredOnApprove`。不要让前端再调 `/apps/:appId/dictionaries`。
- 鉴权（规格 §10.5）：`todo` = 这条 pending 任务的处理人；`mine` = 实例发起人；`done` = 这条任务的处理人且任务已 done。否则 404。
- `mine` 里 `approved` → `readOnly: true`；`draft` / `rejected` / `error` → `canDraft`、`canSubmit`；`running` → `canCancel`（若 `hasApproved=false`）；`error` → 另加 `canRetry`、`canCancel`。
- 没有实例的已通过记录不在 `mine` 里（没有实例）。

- [ ] **Step 1: 写失败测试**

非应用成员仍能 query 到派给自己的待办。带 `appId` 不要串出别的应用。记录删除后 inbox 仍返回、`recordMissing` 为真。`mine` 里已通过 `readOnly`。非处理人打开 `todo` → 404。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 12: 首页【我发起的】这扇门 + 通过 / 驳回 / 撤回 / 重试路由

**Files:**
- Create: `server/src/application/workflow/workflow-instance.service.ts`
- Create: `server/src/application/workflow/workflow-instance.service.spec.ts`
- Modify: `server/src/application/workflow/workflow.controller.ts`
- Create: `server/src/application/workflow/dto/complete-task.dto.ts`、`dto/instance-data.dto.ts`

**Interfaces:**
- Consumes: Task 4 `persist`、Task 9 引擎、Task 1 `getAccess`。
- Produces:

```ts
@Injectable()
export class WorkflowInstanceService {
  saveDraft(instanceId: number, actorId: number, data: Record<string, unknown>): Promise<void>;
  submit(instanceId: number, actorId: number, data: Record<string, unknown>): Promise<{ nextNodeTitle?: string }>;
  cancel(instanceId: number, actorId: number): Promise<void>;
  retry(instanceId: number, actorId: number): Promise<void>;
  complete(taskId: number, actorId: number, dto: CompleteTaskDto): Promise<{ waitingOthers: boolean }>;
}
```

- `POST /api/workflow/tasks/:taskId/complete` `{ action, comment, data }`。引擎自己按 `assigneeId` 条件更新，这里不必再查。`comment` 在 `reject` 时必填，`approve` 时按节点 `commentRequiredOnApprove`。`data` 只保留本节点 `fieldAccess === 'editable'` 的 key，其它 key 丢掉。
- `POST /api/workflow/instances/:instanceId/draft`、`.../submit`：只认 `instance.initiatorId === actorId`，**不调 `requireUse`**。实例状态必须是 `draft / rejected / error`，否则 400「当前状态不能修改」。内部 `persist({ form, actorId, recordId: instance.recordId, data, requiredKeys: 'all' })` 成功后再 `engine.ensureDraft` / `engine.submit`。不要在这里直接写 Mongo `data`。
- `POST .../cancel`：只认发起人 → `engine.cancel`。
- `POST .../retry`：发起人，或 `getAccess(actorId, instance.appId).canConfigure`。其它人（审批人、系统管理员）404。
- 找不到实例、非发起人一律 `NotFoundException('单据不存在')`，不要 403 泄露存在性。

- [ ] **Step 1: 写失败测试**

```ts
it('失权发起人仍能在首页再存草稿', async () => {
  instanceRepo.findOne.mockResolvedValue({ id: 1, initiatorId: 5, status: 'rejected', formId: 12, recordId, appId: 8 });
  access.getAccess.mockResolvedValue({ canUse: false, canConfigure: false, isOwner: false });
  await service.saveDraft(1, 5, { field_reason: '改' });
  expect(persist.persist).toHaveBeenCalledWith(expect.objectContaining({ recordId, actorId: 5, requiredKeys: 'all' }));
  expect(engine.ensureDraft).toHaveBeenCalled();
  expect(access.requireUse).not.toHaveBeenCalled();
});

it('非发起人调提交当单据不存在', async () => {
  instanceRepo.findOne.mockResolvedValue({ id: 1, initiatorId: 5, status: 'rejected' });
  await expect(service.submit(1, 6, {})).rejects.toBeInstanceOf(NotFoundException);
});

it('审批中不能再存草稿', async () => {
  instanceRepo.findOne.mockResolvedValue({ id: 1, initiatorId: 5, status: 'running' });
  await expect(service.saveDraft(1, 5, {})).rejects.toThrow('当前状态不能修改');
});

it('审批人不能重试，配置者可以', async () => {
  instanceRepo.findOne.mockResolvedValue({ id: 1, initiatorId: 5, status: 'error', appId: 8 });
  access.getAccess.mockResolvedValue({ canConfigure: false });
  await expect(service.retry(1, 21)).rejects.toBeInstanceOf(NotFoundException);
  access.getAccess.mockResolvedValue({ canConfigure: true });
  await service.retry(1, 3);
  expect(engine.retry).toHaveBeenCalledWith({ instanceId: 1 });
});

it('通过时丢掉不可编辑字段', async () => {
  // fieldAccess: { field_reason: 'editable', field_days: 'readonly' }
  await service.complete(3, 9, { action: 'approve', comment: '', data: { field_reason: 'a', field_days: 9 } });
  expect(engine.completeTask).toHaveBeenCalledWith(expect.objectContaining({ dataPatch: { field_reason: 'a' } }));
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

```ts
private async requireInitiator(instanceId: number, actorId: number, allowed: InstanceStatus[]) {
  const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
  if (!instance || instance.initiatorId !== actorId) throw new NotFoundException('单据不存在');
  if (!allowed.includes(instance.status)) throw new BadRequestException('当前状态不能修改');
  return instance;
}

async submit(instanceId, actorId, data) {
  const instance = await this.requireInitiator(instanceId, actorId, ['draft', 'rejected', 'error']);
  const form = await this.formRepo.findOneOrFail({ where: { id: instance.formId } });
  await this.persist.persist({ form, actorId, recordId: instance.recordId, data, requiredKeys: 'all' });
  const updated = await this.engine.submit({ form, recordId: instance.recordId, actorId });
  return { nextNodeTitle: titleOf(updated.graph, updated.currentNodeKey) };
}
```

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 13: 抽屉窄接口（选记录、联动、上传）

**Files:**
- Create: `server/src/application/workflow/workflow-render.service.ts`
- Create: `server/src/application/workflow/workflow-render.service.spec.ts`
- Modify: `server/src/application/workflow/workflow.controller.ts`

**Interfaces:**
- 授权：当前用户是该实例发起人，或该实例某一条任务的处理人（含已处理）。否则 404。
- 写入资格：发起人仅 `draft / rejected / error`；`todo` 处理人仅当前节点 `fieldAccess === 'editable'` 的字段；`done` 只读。
- `POST /api/workflow/render/:instanceId/source-records` body `{ fieldKey, filters?, page, pageSize, keyword? }`：只查**该字段配置的源表**（从表单 fields 读 `sourceFormId`），源表 `formKind==='workflow'` 则强制 `approved`。内部复用 `buildRecordQuery` + `store.query`，不要走 `FormRecordController`。
- `POST .../linkage` body `{ fieldKey, conditions }`：按该字段已配好的联动查带出；返回值里只保留目标字段中本节点 `editable`（或发起人可写）的 key，只读 / 隐藏目标不返回，前端自然不会改。
- `POST .../files` `{ fieldKey, file }`：复用现有 `FileInterceptor` 限制和落盘目录，返回 URL；调用人对该字段要有写入资格。
- **`GET .../files/:fileId` 本期不做**：现在 `/uploads/` 由 `main.ts` 的 `useStaticAssets` 静态托管、不鉴权，没有 fileId 概念。抽屉直接用 inbox 响应里的 URL 回显。若以后静态目录加鉴权，再补这条。计划执行时要向使用者说明这一点。
- 这些接口都不走 `/apps/:appId/...`。

- [ ] **Step 1: 写失败测试**

没有使用权的审批人能查出源表已通过记录且不含 `running`。发起人在 `running` 调上传 → 400「当前状态不能修改」。联动结果里只读目标不返回。`done` 处理人调 source-records 写入意图 → 只读放行读取、拒绝上传。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 14: 数据管理列表限制和选择数据过滤（前端）

**Files:**
- Modify: `front/src/components/form-workspace/FormRecordList.vue`
- Modify: `front/src/components/form-workspace/FormRecordManage.vue`
- Modify: `front/src/components/form-workspace/FormRecordCell.vue`（流程表整表关闭内联编辑）
- Modify: `front/src/components/form-workspace/FormRecordDetailDrawer.vue`（已通过谁能点【编辑】；流程进度区）
- Modify: `front/src/components/form-workspace/relateTitles.js`（按 `ids` 查，不传 `pickApproved`）
- Modify: `front/src/components/form-fill/FormDataSelect.vue`、`FormRelateSubform.vue`（查询带 `pickApproved: true`）
- Modify: `front/src/components/FormPublishPanel.vue`（流程表强制关掉导入开关展示，并加说明「改已通过的数据会重新进入审批，通过之前不能再被别的表选到」）
- Modify: `front/src/api/apps.js`（`queryFormRecordsApi` 透传 `workflowStatus`、`pickApproved`）

**Interfaces:**
- 列表每条带 `workflowStatus`。流程表增加「流程状态」列（默认开、列设置可关）和状态下拉：全部 / 草稿 / 审批中 / 已通过 / 已驳回 / 异常。
- 流程表：内联编辑整表关闭（`FormRecordCell` 加 `inlineDisabled` 入参，由 `FormRecordList` 按 `form.formKind` 传）；导入按钮和下载模版不出现。
- 点行看详情和进度，不能在【数据管理】里【通过】/【驳回】。
- 【编辑】按钮出现条件：发布页【编辑】开 且（草稿 / 已驳回 / 异常 且 我是发起人）或（已通过 且 有实例 且 我是发起人）。审批中不出现。已通过编辑抽屉底部只有【提交】（走 `PATCH` + `intent:'submit'`）。
- 【删除】：审批中不出现；草稿 / 已驳回 / 异常仅发起人；已通过跟发布页【删除】开关，能进数据管理就能删。
- 异常：发起人或配置者（接口返回 `canConfigure`）可点【重试】，走 `POST /api/workflow/instances/:id/retry`。
- 没有实例的已通过：详情流程区只显示「转为流程表单之前保存，没有审批记录」或「流程停用期间保存，没有审批记录」，不画空图，没有【编辑】/【提交】。
- 「我是发起人」用详情接口返回的 `workflowInstance.initiatorId` 比当前登录用户，不用 `createdBy`。

- [ ] **Step 1: 改列表、单元格、详情抽屉、发布页**

事件抽函数，不写行内 JS。

- [ ] **Step 2: `node --test` 跑 `FormRecordCell.spec.js`、`relateTitles.spec.js`（补 `inlineDisabled`、不传 `pickApproved` 的断言）**

- [ ] **Step 3: 提交（仅当使用者要求）**

---

### Task 15: 前端 — 设计顶栏、建表、转换（接 Task 2/3）

**Files:**
- Modify: `front/src/views/FormDesignView.vue`
- Modify: `front/src/views/AppWorkspaceView.vue`（若 Task 2/3 已改完，本任务只补【流程设计】页签）
- Modify: `front/src/api/apps.js`（`convertFormKindApi`、`getFormApi` 读 `formKind`）

**Interfaces:**
- `PAGE_TABS` 对流程表单加入 `'workflow'`。顶栏顺序：【表单设计】【流程设计】【表单发布】【数据管理】。普通表单仍三个页签。
- 路由 `?tab=workflow`。普通表单访问 `?tab=workflow` 回落到 `design`。

- [ ] **Step 1: 改顶栏**

`form.formKind === 'workflow'` 才渲染【流程设计】。页签点击已有 `setPage`，不要行内 JS。

- [ ] **Step 2: 由使用者本地点一张普通表和一张流程表看页签数量（不要自己开浏览器）**

- [ ] **Step 3: 提交（仅当使用者要求）**

---

### Task 16: 前端 — 流程设计画布

**Files:**
- Create: `front/src/components/workflow-design/*`（见 File Structure，含 `RolePicker.vue`）
- Modify: `front/package.json`（加 `@logicflow/core`、`@logicflow/vue-node-registry`，安装当时最新 2.x，不要锁死 patch）
- Modify: `front/src/views/FormDesignView.vue`（`page === 'workflow'` 时挂 `WorkflowDesignPanel`）
- Create: `front/src/api/workflow.js`（应用下的草稿 / 发布 / 启用；`/api/workflow/...` 的 inbox / render / 动作）

**Interfaces:**
- 打开：`GET` 草稿；没有草稿则画布预置一个不可删的开始。顶部显示「当前已发布版本 vN。审批中的 M 条仍按提交时的版本走。」（`publishedVersion`、`runningCount`）；从未发布显示「尚未发布」。
- 左侧：审批、分支、结束。开始不进左侧。
- 中间：LogicFlow。保存时 `toProductGraph(lf.getGraphRawData())`，打开时 `toLogicflowGraph(product)`。不要把 LogicFlow 字段当协议。
- 右侧：
  - 审批 → 名称、三种审批人、或签/会签、字段权限、通过意见选填/必填。
  - 字段权限列表按规格 §12：主表字段（含标签页里的）三选一，默认只读；**子表单 `subform` 只有只读 / 隐藏**；**关联子表单 `relate-subform`、分割线不出现**；**登录人姓名、登录人部门、流水号只有只读 / 隐藏**。
  - 分支 → 名称。
  - 线 → 分支线配条件（复用 `FormFilterConditions` 的字段 / 关系 / 值配法，字段只列主表含标签页、不列子表列）或「其他情况」，可上移 / 下移 `sort`；非分支线只改短标题。
- 指定角色：`RolePicker.vue` 新建（列启用中的角色，多选；数据来自登录端可用的角色列表接口，若现有只有 `/admin/roles`，在 `OrgModule` 下加一条只返回 `{ id, name }` 的 `GET /api/org/roles`，登录即可用）。勾选「限定与发起人同部门」默认勾上；取消时提示「该角色下所有部门的人都会收到待办」。
- 指定人员复用 `FormMemberSelect.vue`；表单内人员字段下拉列当前表单的 `member` / `member-multiple`（含标签页内，不含子表列）。
- 顶栏：【保存】（只存草稿）、【发布】、【启用流程】开关。发布成功提示后开关为开。从未发布过，开关是关的且打开会被后端拒绝。
- 发布失败把后端 `message` 数组逐条展示在顶部，不要只 toast 一句「失败」。发布前先跑前端 `workflowValidate`，同一套文案。

- [ ] **Step 1: 写 graph 转换单测**

`workflowGraph.spec.js`：产品图进出 LogicFlow 后 `key/type/x/y/signMode/when/fieldAccess/approver` 不丢；LogicFlow 的锚点、样式字段不进产品图。

- [ ] **Step 2: 安装依赖并实现面板**

节点 Vue 组件用 `@logicflow/vue-node-registry` 注册。图标先在 `@element-plus/icons-vue` 确认导出再 import：审批用 `CircleCheck`、结束用 `Finished`（两者项目已用）；分支图标候选 `Share`、`Promotion`，没有就用 `Tickets`。

- [ ] **Step 3: `node --test` 跑 graph / validate 单测**

- [ ] **Step 4: 提交（仅当使用者要求）**

---

### Task 17: 前端 — 【添加数据】按钮和【数据管理】【新增】

**Files:**
- Modify: `front/src/components/AppWorkspaceMain.vue`
- Modify: `front/src/api/apps.js`（create / update 带 `intent`）
- Modify: `front/src/components/form-workspace/FormRecordManage.vue`
- Modify: `front/src/components/form-workspace/FormRecordCreateDrawer.vue` / `FormRecordCreateTab.vue`（底部按钮）

**Interfaces:**
- 目录 / 表单详情带的 `formKind`、`workflowPublished`、`workflowEnabled` 决定三态，不要前端猜有没有定义行：
  - 流程表且未发布：【添加数据】顶部常驻「这张表单还没有配置流程，暂时不能填报」。【保存草稿】【提交】点了提示同一句，不发请求。【数据管理】【新增】同样拦。
  - 流程表且已启用：底部【保存草稿】【提交】，不要普通【保存】。成功后清空继续填下一张。提交成功提示「已提交，等待「部门审批」」（名称用返回的 `workflowInstance.currentNodeKey` 对应标题；直接结束则提示「已提交并通过」）。
  - 流程表且关掉启用：底部回到【保存】，保存后当已通过。
- 前端必填校验照旧先跑；服务端拦的文案「请填写xxx」直接 toast。

- [ ] **Step 1: 改按钮和提示**

事件抽函数。流程表把 `intent` 传给 API。

- [ ] **Step 2: 提交（仅当使用者要求）**

---

### Task 18: 前端 — 四入口、侧栏三行、共用抽屉

**Files:**
- Modify: `front/src/components/AppHeader.vue`
- Modify: `front/src/views/HomeView.vue`
- Modify: `front/src/views/AppWorkspaceView.vue`
- Modify: `front/src/router/index.js`
- Create: `front/src/views/WorkflowInboxView.vue`
- Create: `front/src/components/workflow-inbox/*`
- Create: `front/src/components/form-workspace/recordDataSource.js`
- Modify: `front/src/components/form-workspace/FormRecordDetailDrawer.vue`（改成接收 `dataSource`，默认仍走应用 records，供【数据管理】用）
- Modify: `front/src/components/form-fill/FormFillGrid.vue`、`FormFillField.vue`（加 `fieldAccess` prop：`hidden` 不渲染、`readonly` 禁用、`editable` 可改；子表单在待办抽屉里始终只读；缺省行为不变）

**Interfaces:**
- 顶栏产品名右侧：【我的应用】【我的待办】【我发起的】【我处理的】。当前页高亮。【我的待办】显示全站未处理条数（`GET /api/workflow/inbox/count`）。
- 路由：`/` 仍是【我的应用】；`/inbox/todo|mine|done` 为三个流程页，不带 `appId`。
- 应用内：应用名下、搜索/新建上三行。点中后主区挂同一套 `WorkflowInboxList`，请求带当前 `appId`；【我的待办】角标用带 `appId` 的 count。本应用没有流程单时三行仍在，点进去空状态「本应用还没有待办 / 发起过 / 处理过」。
- `recordDataSource.js`：

```js
// 数据管理：读写走 /apps/...
export function appRecordSource({ appId, formId }) {
  return {
    update: (recordId, data, intent) => updateFormRecordApi(appId, formId, recordId, data, intent),
    querySource: (sourceFormId, body) => queryFormRecordsApi(appId, sourceFormId, { ...body, pickApproved: true }),
    linkage: (body) => queryLinkageApi(appId, body),
    upload: (file) => uploadFileApi(appId, file),
  }
}
// 待办抽屉：全部走 /api/workflow/...
export function workflowInboxSource({ instanceId }) {
  return {
    querySource: (fieldKey, body) => renderSourceRecordsApi(instanceId, { fieldKey, ...body }),
    linkage: (fieldKey, body) => renderLinkageApi(instanceId, { fieldKey, ...body }),
    upload: (fieldKey, file) => renderUploadApi(instanceId, fieldKey, file),
  }
}
```

- `FormRecordDetailDrawer` 不再直接 `import { updateFormRecordApi }`，从 `dataSource` 拿。待办抽屉用 `WorkflowInboxDrawer`：顶部 `WorkflowMiniGraph`（只读，用 LogicFlow 静默渲染同一份快照，`visitedNodeKeys` 一种色、`currentNodeKey` 高亮）、进度列表（任务 + `notes`，取消的显示「未处理（已取消）」和原因，`assigneeDisabled` 的标「审批人已停用」）、表单区按 `fieldAccess`、底部按入口切换按钮：【我的待办】→ 意见框 + 【通过】【驳回】；【我发起的】→ 【保存草稿】【再次提交】【撤回】，`error` 时另有【重试】；【我处理的】→ 只读。没有实例的已通过只显示来源说明。
- 数据已删除：卡片和抽屉只读，不报错。
- 【重试】【通过】【撤回】点一次置灰，等请求结束。「这条待办已处理」「审批人已开始处理，不能撤回」直接 toast 并刷新列表。

- [ ] **Step 1: 抽出 dataSource，改详情抽屉，`FormFillGrid` 加 `fieldAccess`**

现有【数据管理】点行编辑仍能保存。不要改变普通表单的保存文案。

- [ ] **Step 2: 做列表、卡片、抽屉，挂到首页与侧栏**

侧栏三行用普通 `button` / `div`，不要 `el-text`。

- [ ] **Step 3: `node --test` 跑 `workflowStatus.spec.js`（状态中文、按钮可见性的纯函数）**

- [ ] **Step 4: 提交（仅当使用者要求）**

---

### Task 19: 手工测试用例、使用说明、TODO

**Files:**
- Create: `docs/testcases/2026-09-06-workflow-form-test-cases.md`
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`
- Modify: `docs/testcases/README.md`
- Create: `docs/guides/2026-09-06-workflow-form-usage.md`
- Modify: `docs/TODO.md`（P5「流程表单」勾选，注明第 2 期另立项）

按界面语言写，表名/按钮用【】。规格 §21 的 29 条验收直接当专项骨架，另补：

1. 建【请假单】选流程表单；未发布就进【添加数据】，顶部提示，点【保存草稿】【提交】都不写数据；【数据管理】【新增】同样拦。
2. 画规格里的图，发布成功后【启用流程】为开；顶部显示「当前已发布版本 v1」。
3. 或签 / 会签 / 驳回 / 撤回 / 并发（§21 第 6～12、28 条）。
4. 【驳回】后【再次提交】走旧版本；已通过后仅发起人在【数据管理】【编辑】再【提交】走当前已发布版本；不是发起人的所有者只能看（§21 第 14、29 条）。
5. 普通表【加班单】【转为流程表单】，旧数据在选择数据弹窗里能挑到；流程表不能转回（§21 第 20、21 条）。
6. 关掉启用后新保存的是已通过、无流程图；在途待办三入口仍在（§21 第 19 条）。
7. 已通过的记录在【数据管理】能【删除】（发布页开关开着），删后【我发起的】卡片标「数据已删除」只读；草稿删掉后实例一起没（§21 第 27 条）。
8. 异常：角色无人 / 发起人部门无该角色 / 审批人全部停用 → 【我发起的】显示异常和原因，【重试】幂等；抽屉进度里看到「审批人已停用」（§21 第 16、18 条）。
9. 无使用权审批人：第 1 期只有所有者能进应用，用「不是所有者的经理」当审批人即可覆盖（他天然没有使用权）：首页【我的待办】能打开、字典中文、选记录只列已通过，直接调 `/apps/:id/dictionaries` 404（§21 第 22 条）。失权发起人（§21 第 23 条）要等权限第 2 期有使用范围后才能造出来，用例里注明。
10. 联合：标签页 `tabs` 里的字段能配进节点权限和分支条件，隐藏后页签仍在；子表单 `subform` 在审批里只读 / 隐藏，属性里没有「可编辑」；流水号 `serialNumber` 审批写回不重算；选择数据 `data` / 关联数据 `relate` 只挑已通过，已关联的格子在源记录重审期间仍显示原标题；关联子表单 `relate-subform` 只列已通过。

README：目录表插入专项；调色板对照表不加行（流程不是控件），加一句「流程表单在建表时选，不在调色板」；执行顺序放在关联数据之后、权限专项之前；「不要测」写转办、转回普通、首页删除、导入流程表、失权发起人（第 2 期）。

使用说明：怎么建流程表单、画图、三种审批人和同部门勾选、或签会签、发布与启用、【添加数据】怎么交、首页三入口怎么用、已通过怎么改。

- [ ] **Step 1: 写专项、改联合、改纲领、写使用说明、勾 TODO**
- [ ] **Step 2: 回读中文，确认没有乱码**
- [ ] **Step 3: 提交（仅当使用者要求）**

---

## 覆盖自检

| 规格章节 | 任务 |
|---|---|
| §4.1 建表类型、未发布不写库 | 2, 10, 17 |
| §4.2 只允许普通→流程、回填已通过 | 3, 15 |
| §4.3 发布即启用、关掉当普通已通过 | 8, 10, 17 |
| §5–5.6 画布与发布校验、版本提示 | 6, 8, 16 |
| §7 三种审批人 + 同部门 + 无部门 note | 5, 7, 9, 16 |
| §8 草稿 / 提交 / 撤回（含异常态撤回、未经审批即结束） | 6, 9, 10, 12, 17 |
| §9 通过 / 驳回、会签写回、唯一 / 流水号 | 4, 9, 12, 18 |
| §10 两处三入口、鉴权按任务 | 11, 18 |
| §11 已通过只发起人在数据管理改、已通过可删、内联关闭、导入关 | 9, 10, 14 |
| §12 节点字段权限（子表只读 / 隐藏、系统字段不可编辑）；联动只写可编辑 | 13, 16, 18 |
| §13 版本钉死 / 已通过换新版 | 8, 9 |
| §14 关联格子不因重审抹掉、关联子表单只已通过 | 10, 14 |
| §14 / 权限 §12.1 判定入口 | 1 |
| §15 三张表、`notes`、Mongo 冗余、事务顺序、删记录连带 | 5, 9, 10 |
| §16 引擎、并发条件更新、异常重试、审批人已停用 | 9, 11, 12 |
| §17 两扇门一间库房、inbox / render / count | 4, 10, 11, 12, 13 |
| §18 前端入口 | 14–18 |
| §19 不做清单 | Global Constraints |
| §23 用例、使用说明、TODO 同一轮 | 19 |
| 权限 §8.2 待办不走 /apps；`GET files/:fileId` 本期以 URL 回显代替 | 11–13, 18 |

第 2 期（配置名单、使用范围、移交、首页按范围列应用、删应用连带权限表）不在本计划，见 `2026-09-06-app-permission.md`。
