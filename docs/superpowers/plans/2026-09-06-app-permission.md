# 应用配置权与使用范围 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务推进。分支 / worktree / commit 规则以根目录 `AGENTS.md`（`.cursor/rules/` 同义）为准，本计划不另复制。

**Goal:** 让应用不再只有创建人能进：所有者可以在应用后台把配置权交给具体的人、按部门/角色/人员开放使用，并能把所有者交给别人；所有者停用后，只有系统管理员能在管理后台替他交出去。

**Architecture:** 第 1 期已经有 `AppAccessService`（只认所有者）。本计划加 `app_configurator`、`app_access_scope` 两张表，只改判定服务内部和后台页面。流程接口、待办抽屉、`formKind` 转换不要重做——转换接口已经走 `requireConfigure`，名单一生效，配置者自动能【转为流程表单】。

**Tech Stack:** NestJS + TypeORM + MySQL；前端 Vue 3 + Element Plus。后端 Jest，前端纯函数 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-05-permission-design.md` 第 2 期（§5～§7、§9、§11、§12）。第 1 期已在 `docs/superpowers/plans/2026-09-06-workflow-form.md`。

**依赖:** 先做完流程计划 Task 1（`AppAccessService` 已替换各处 `requireOwnedApp`，返回 `AppAccess = { app, canUse, canConfigure, isOwner }`）。创建人改当前登录人已在流程计划 Task 4，本计划不要再改 `FormRecordPersistService`。流程计划 Task 16 已建 `RolePicker.vue` 和 `GET /api/org/roles`，使用范围页直接复用。第 3 期按表收权不做。

## Global Constraints

- 分支 / worktree / commit 规则见根目录 `AGENTS.md`「开发分支」，本计划不复制会过期的口径。
- TypeORM `synchronize: false`。SQL 写好后停下，等使用者点名该文件并同意才能执行。
- 表名单数下划线、列驼峰、普通索引 `IDX_表名_属性`、唯一约束 `uk_表名_属性`。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 容器不加 `gap`；`el-dialog` 默认 `draggable`。
- 可见文案用普通标签，不要用 `el-text`。
- 图标先确认 `@element-plus/icons-vue` 有导出。应用后台新菜单用已在项目里用过的 `UserFilled`（配置权限）、`Postcard`（使用范围）。
- 不删不改使用者已有的注释和 `console.log`。
- 文件 UTF-8 无 BOM；写完中文回读。
- 界面用词与流程计划同一套。【配置权限】【使用范围】【移交所有者】【始终可用（不可移除）】。例子：应用【人事】。
- 配置名单**只存人**，不存部门/角色行。名单里不存当前所有者。使用范围不存「始终可用」那些人。
- 移交走方案 A：完成后名单里既没有旧所有者，也没有新所有者；使用范围补「人员 = 旧所有者」（已有则不重复）；删掉「人员 = 新所有者」若已有的那一行。
- 判定角色用角色 id + `role.status='active'`，不要用登录态 `roleCodes`（管理后台认 `system_admin` 那一条除外，调用人身份可以看 `roleCodes`，因为 `getPrincipal` 已过滤停用角色）。
- 拒绝进应用一律「应用不存在」，不要 403。
- 不要做按表「谁可以」、不要做删人接口、不要让配置者删应用或移交、不要让系统管理员打开应用看数据。
- 未经使用者批准不要用浏览器点页面。

## File Structure

```text
server/sql/2026-09-06-app-permission.sql
server/src/application/access/app-configurator.entity.ts
server/src/application/access/app-access-scope.entity.ts
server/src/application/access/app-access.service.ts          # 扩展 canUse / canConfigure
server/src/application/access/app-access.service.spec.ts
server/src/application/access/app-access-admin.service.ts    # 名单、范围、移交的读写
server/src/application/access/app-access-admin.service.spec.ts
server/src/application/access/app-access.controller.ts       # /apps/:appId/configurators|access-scopes|transfer
server/src/application/application.service.ts                # list 改按访问；deleteApp 级联
server/src/application/dictionary/dictionary.service.ts      # 读 requireUse，写 requireConfigure
server/src/admin/user/admin-user.controller.ts               # 停用所有者移交
server/src/admin/user/admin-owned-app.service.ts
front/src/api/apps.js / front/src/api/admin.js
front/src/layouts/AppBackendLayout.vue
front/src/views/app-backend/AppConfiguratorsView.vue
front/src/views/app-backend/AppAccessScopesView.vue
front/src/components/app-backend/AppTransferDialog.vue
front/src/components/admin/AdminUserOwnedApps.vue
front/src/router/index.js
docs/testcases/2026-09-06-app-permission-test-cases.md
docs/testcases/2026-08-31-complex-form-manual-tests.md
docs/testcases/README.md
```

名单和范围的增删、移交时的行处理，都放 `AppAccessAdminService`，不要写进判定服务。判定服务只读表、算布尔。

---

### Task 1: 两张表

**Files:**
- Create: `server/sql/2026-09-06-app-permission.sql`
- Create: `server/src/application/access/app-configurator.entity.ts`
- Create: `server/src/application/access/app-access-scope.entity.ts`
- Modify: `server/src/application/application.module.ts`（`TypeOrmModule.forFeature` 加上这两张）

**Interfaces:**
- `AppConfigurator`：`appId`、`userId`。`uk_app_configurator_appId_userId`。`IDX_app_configurator_appId`、`IDX_app_configurator_userId`。
- `AppAccessScope`：`appId`、`type`（`'user' | 'department' | 'role'`）、`targetId`。`uk_app_access_scope_appId_type_targetId`。`IDX_app_access_scope_appId`、`IDX_app_access_scope_type_targetId`（两列联合，供首页反查）。
- 两张表都自己声明 `id`、`createdAt`、`updatedAt`，不要 BaseEntity。

```sql
CREATE TABLE IF NOT EXISTS `app_configurator` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `userId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_configurator_appId_userId` (`appId`, `userId`),
  KEY `IDX_app_configurator_appId` (`appId`),
  KEY `IDX_app_configurator_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_access_scope` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `type` varchar(16) NOT NULL,
  `targetId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_access_scope_appId_type_targetId` (`appId`, `type`, `targetId`),
  KEY `IDX_app_access_scope_appId` (`appId`),
  KEY `IDX_app_access_scope_type_targetId` (`type`, `targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 1: 写实体和 SQL**
- [ ] **Step 2: 把脚本给使用者看。未点名、未同意，不得执行**
- [ ] **Step 3: 提交（仅当使用者要求）**

---

### Task 2: 判定服务读名单和范围

**Files:**
- Modify: `server/src/application/access/app-access.service.ts`
- Modify: `server/src/application/access/app-access.service.spec.ts`

**Interfaces:**
- `getAccess` 仍返回流程计划 Task 1 定义的 `AppAccess`（`app` / `canUse` / `canConfigure` / `isOwner`），调用点一个都不改。布尔算法：

```text
isOwner        = app.ownerId === userId
inConfigurator = 存在 app_configurator(appId, userId)
scopeHit       = 存在范围行且目标仍有效：
                 type=user 且 targetId=我 且 该账号 status=active
                 或 type=department 且 targetId=我所在部门 且 部门 status=active
                 或 type=role 且 targetId 是我拥有的角色 id 且 角色 status=active
canConfigure   = isOwner || inConfigurator
canUse         = canConfigure || scopeHit
```

- 停用/删除的部门、角色、人员：行还在，但 `scopeHit` 为假。人员删除预留（管理后台现在只能停用）。
- 没分配部门的人：不被任何部门范围命中；可靠角色或人员范围。
- 不含下级部门。
- 自己查 `user_role` + `role`，不要用 `req.user.roleCodes`。
- 一次 `getAccess` 里把应用、名单行、范围命中算完，调用方复用返回值。

- [ ] **Step 1: 写失败测试**

```ts
it('配置名单上的人能配置也能使用', async () => {
  appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
  configuratorRepo.findOne.mockResolvedValue({ appId: 8, userId: 2 });
  const access = await service.getAccess(2, 8);
  expect(access).toMatchObject({ canConfigure: true, canUse: true, isOwner: false });
});

it('部门范围内启用账号能使用不能配置', async () => {
  appRepo.findOne.mockResolvedValue({ id: 8, ownerId: 1 });
  configuratorRepo.findOne.mockResolvedValue(null);
  userDeptRepo.findOne.mockResolvedValue({ userId: 5, departmentId: 3 });
  deptRepo.findOne.mockResolvedValue({ id: 3, status: 'active' });
  scopeRepo.find.mockResolvedValue([{ type: 'department', targetId: 3 }]);
  const access = await service.getAccess(5, 8);
  expect(access).toMatchObject({ canUse: true, canConfigure: false });
});

it('部门已停用则范围不命中', async () => {
  deptRepo.findOne.mockResolvedValue({ id: 3, status: 'disabled' });
  await expect(service.requireUse(5, 8)).rejects.toMatchObject({
    message: '应用不存在',
  });
});

it('角色已停用即使 user_role 还在也不命中', async () => {
  userRoleRepo.find.mockResolvedValue([{ userId: 5, roleId: 9 }]);
  roleRepo.find.mockResolvedValue([{ id: 9, status: 'disabled' }]);
  scopeRepo.find.mockResolvedValue([{ type: 'role', targetId: 9 }]);
  await expect(service.requireUse(5, 8)).rejects.toBeInstanceOf(NotFoundException);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --prefix server -- app-access.service.spec.ts`

Expected: FAIL（现在只有所有者为真）。

- [ ] **Step 3: 实现查询**

```ts
@Injectable()
export class AppAccessService {
  constructor(
    @InjectRepository(Application) private readonly appRepo: Repository<Application>,
    @InjectRepository(AppConfigurator) private readonly configuratorRepo: Repository<AppConfigurator>,
    @InjectRepository(AppAccessScope) private readonly scopeRepo: Repository<AppAccessScope>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserDepartment) private readonly userDeptRepo: Repository<UserDepartment>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(UserRole) private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
  ) {}

  async getAccess(userId: number, appId: number): Promise<AppAccess> {
    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException('应用不存在');
    const isOwner = app.ownerId === userId;
    if (isOwner) return { app, isOwner, canConfigure: true, canUse: true };

    const configurator = await this.configuratorRepo.findOne({ where: { appId, userId } });
    if (configurator) return { app, isOwner: false, canConfigure: true, canUse: true };

    const scopes = await this.scopeRepo.find({ where: { appId } });
    const canUse = scopes.length > 0 && (await this.scopeHit(userId, scopes));
    return { app, isOwner: false, canConfigure: false, canUse };
  }

  /** 范围行保留但目标停用 / 删除时不命中（权限规格 §7.2、§12.1） */
  private async scopeHit(userId: number, scopes: AppAccessScope[]): Promise<boolean> {
    if (scopes.some((s) => s.type === 'user' && s.targetId === userId)) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user?.status === 'active') return true;
    }
    const deptScopes = scopes.filter((s) => s.type === 'department');
    if (deptScopes.length) {
      const link = await this.userDeptRepo.findOne({ where: { userId } });
      if (link && deptScopes.some((s) => s.targetId === link.departmentId)) {
        const dept = await this.deptRepo.findOne({ where: { id: link.departmentId } });
        if (dept?.status === 'active') return true;
      }
    }
    const roleScopes = scopes.filter((s) => s.type === 'role');
    if (roleScopes.length) {
      const links = await this.userRoleRepo.find({ where: { userId } });
      const roleIds = links.map((l) => l.roleId).filter((id) => roleScopes.some((s) => s.targetId === id));
      if (roleIds.length) {
        const active = await this.roleRepo.count({ where: { id: In(roleIds), status: 'active' } });
        if (active > 0) return true;
      }
    }
    return false;
  }
}
```

`requireUse` / `requireConfigure` / `requireOwner` 不变。`ApplicationModule.forFeature` 补上 `AppConfigurator`、`AppAccessScope`、`Department`（`User`、`UserRole`、`UserDepartment`、`Role` 流程计划 Task 7 已加）。反查首页列表时（Task 7）会再用 `userId` / `type+targetId` 索引；本任务判定按 `appId` 查该应用的名单和范围即可。

- [ ] **Step 4: 跑测试确认通过**

Expected: PASS。原来的所有者用例仍过；流程计划里所有打 `AppAccessService` 桩的用例不用改。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 3: 配置权限页

**Files:**
- Create: `server/src/application/access/app-access-admin.service.ts`
- Create: `server/src/application/access/app-access-admin.service.spec.ts`
- Create: `server/src/application/access/app-access.controller.ts`
- Create: DTO `add-configurators.dto.ts`（`userIds: number[]`）
- Modify: `front/src/layouts/AppBackendLayout.vue`
- Create: `front/src/views/app-backend/AppConfiguratorsView.vue`
- Modify: `front/src/router/index.js`
- Modify: `front/src/api/apps.js`

**Interfaces:**
- `GET /api/apps/:appId/configurators`：`requireConfigure`。返回展示用列表：**第一行永远是当前所有者**（`isOwner: true`，没有移除），其余是名单表里的人。每行带 `status`，停用的人（**包括所有者本人停用时**）界面标「已停用」；所有者行停用了仍没有移除按钮，旁边提示要换人走停用后的管理后台移交。所有者不在表里。
- `POST /api/apps/:appId/configurators` `{ userIds }`：只写入启用中的人。勾中所有者：不写行，不报错，响应里带提示「已是所有者，无需添加」。加入名单时**删掉**该人「人员 = 他」的范围行（有才删）。不能添加停用账号。
- `DELETE /api/apps/:appId/configurators/:userId`：不能删所有者（即使误传 `ownerId` 也拒绝）。可以删自己。确认文案在前端：「他不能再配置本应用；如果使用范围也没有覆盖他，他同时失去使用权，首页不再出现这个应用。」删完后若当前用户不再 `canUse`，前端跳首页。
- 选人弹框复用 `FormMemberSelect` 的选人能力（或现有组织选人），用部门/角色只是找人，确定后只提交 `userIds`。不要把部门、角色写成名单行。

- [ ] **Step 1: 写失败测试**

列表第一行是所有者且 `configuratorRepo` 为空。POST 所有者 id 不 insert。POST 停用账号 400。DELETE 所有者 400。POST 某人后调用了删除「人员 = 他」范围行。

- [ ] **Step 2–4: 实现接口和页面**

菜单「配置权限」与「字典管理」并列。页面说明一句：所有者始终能配置，要从他手里拿走配置权请【移交所有者】。所有者行没有移除按钮。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 4: 使用范围页

**Files:**
- Modify: `server/src/application/access/app-access-admin.service.ts`
- Modify: `server/src/application/access/app-access.controller.ts`
- Create: DTO `add-access-scope.dto.ts`（`type` + `targetId`）
- Create: `front/src/views/app-backend/AppAccessScopesView.vue`
- Modify: `front/src/layouts/AppBackendLayout.vue`、`front/src/router/index.js`、`front/src/api/apps.js`

**Interfaces:**
- `GET /api/apps/:appId/access-scopes`：`requireConfigure`。返回两块：
  1. `always: { users: { id, displayName, status, reason: 'owner' | 'configurator' }[] }` 只读，不落库。
  2. `scopes: { id, type, targetId, label, effective, badge }[]`。`badge` 给人看：`研发部（已停用，当前不生效）` / `研发部（已删除，当前不生效）` / `部门（id:3，已删除，当前不生效）`。人员删除预留，当前停用用「已停用」。
- `POST`：部门 / 角色 / 人员各一条。选部门时接口和界面都写明「不含下级部门」。不能新加停用人员。人员目标若已是所有者或已在名单，不要拦（规格只要求加入名单/升为所有者时删人员行；反向加一条重复人员行没有必要，POST 人员且该人已在始终可用时直接忽略并提示「已在始终可用中，不必再加」）。
- `DELETE /api/apps/:appId/access-scopes/:id`：只删范围行，不能删「始终可用」。
- 页面顶部固定醒目提示：在按表收权做完之前，开放范围等于把本应用**所有表的全部数据**开放给范围内的人。

- [ ] **Step 1: 写失败测试**

始终可用不写范围行。停用部门的行 `effective: false` 且 label 含「已停用，当前不生效」。添加停用人员 400。

- [ ] **Step 2–4: 实现**

选部门 / 角色 / 人员三个入口。角色选择器直接复用流程计划 Task 16 的 `front/src/components/workflow-design/RolePicker.vue` 和 `GET /api/org/roles`，不要再写一个。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 5: 应用内移交所有者

**Files:**
- Modify: `server/src/application/access/app-access-admin.service.ts`（抽出 `transferOwner(appId, fromUserId, toUserId)`）
- Modify: `server/src/application/access/app-access-admin.service.spec.ts`
- Modify: `server/src/application/access/app-access.controller.ts`（`POST /api/apps/:appId/transfer`）
- Create: `front/src/components/app-backend/AppTransferDialog.vue`
- Modify: `front/src/layouts/AppBackendLayout.vue` 或配置权限页放入口
- Modify: `front/src/views/HomeView.vue`（若需要，仅确保跳 `/` 即可）

**Interfaces:**
- 只有 `requireOwner` 能调。配置者调 → 「应用不存在」。
- `toUserId` 必须是启用中的人，且不能是自己。
- 同一事务（MySQL）里做完：
  1. `application.ownerId = toUserId`
  2. 删配置名单里 `userId = toUserId` 若存在
  3. 删使用范围 `type=user AND targetId=toUserId` 若存在
  4. 若不存在 `type=user AND targetId=fromUserId`，插入一条（幂等）
  5. **不要**给旧所有者加名单行
- 成功后前端立刻 `router.push('/')`，不要留在应用后台。
- 移交后旧所有者再交出去：名单里本来就没有他，再交之后他仍只是普通人（范围再补「人员 = 他」）。

- [ ] **Step 1: 写失败测试**

```ts
it('移交后名单里没有新旧所有者，范围补旧所有者、去掉新所有者人员行', async () => {
  // 旧所有者 1，新所有者 2 原先在名单且有人员范围
  await admin.transferOwner(8, 1, 2);
  expect(appRepo.save).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 2 }));
  expect(configuratorRepo.delete).toHaveBeenCalledWith({ appId: 8, userId: 2 });
  expect(scopeRepo.delete).toHaveBeenCalledWith({
    appId: 8, type: 'user', targetId: 2,
  });
  expect(scopeRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ appId: 8, type: 'user', targetId: 1 }),
  );
});

it('配置者不能移交', async () => {
  access.requireOwner.mockRejectedValue(new NotFoundException('应用不存在'));
  await expect(controller.transfer(2, 8, { userId: 3 })).rejects.toMatchObject({
    message: '应用不存在',
  });
});
```

- [ ] **Step 2–4: 实现对话框**

入口放应用后台右上或【配置权限】页：「移交所有者」。选启用中的人，不能选自己。确认文案写清：交出去后你变成普通使用用户，将离开应用后台。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 6: 管理后台移交停用所有者

**Files:**
- Create: `server/src/admin/user/admin-owned-app.service.ts`
- Create: `server/src/admin/user/admin-owned-app.service.spec.ts`
- Modify: `server/src/admin/user/admin-user.controller.ts`
- Modify: `server/src/admin/admin.module.ts`（注入应用表 / 复用 `AppAccessAdminService.transferOwner`）
- Create: `front/src/components/admin/AdminUserOwnedApps.vue`
- Modify: `front/src/views/admin/AdminUsersView.vue` 或编辑人员抽屉
- Modify: `front/src/api/admin.js`

**Interfaces:**
- `GET /api/admin/users/:userId/owned-apps`：调用人必须 `roleCodes` 含 `system_admin`。目标用户必须已停用，否则返回空列表（启用中的所有者自己进应用后台交，这里不出现）。只返回 `{ id, name }`，不要表单、数据、字典。
- `POST /api/admin/users/:userId/owned-apps/:appId/transfer` `{ userId }`：同上，且该应用当前 `ownerId` 必须等于这个停用用户。新主人必须启用。库表变化调用同一份 `transferOwner`，不要复制一套。
- 只有 `admin.access`、没有 `system_admin`：两条都 403 或当不存在（与现有 PermissionsGuard 一致即可，另加角色校验）。
- 可以交给调用人自己。交给自己之前他仍打不开该应用。
- 系统管理员不能因此获得打开应用、删应用的权限。

- [ ] **Step 1: 写失败测试**

启用中的所有者 → 列表为空。非 `system_admin` → 拒绝。停用所有者 + 系统管理员 → 能交，且 `transferOwner` 被调用一次。

- [ ] **Step 2–4: 实现**

编辑已停用人员时，若他是某些应用的所有者，列出应用名，每一行一个【移交】。启用人员不渲染这块。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 7: 首页列表、删应用级联、字典读写分开

**Files:**
- Modify: `server/src/application/application.service.ts`（`list`、`deleteApp`）
- Modify: `server/src/application/application.service.spec.ts`
- Modify: `server/src/application/dictionary/dictionary.service.ts`
- Modify: `server/src/application/dictionary/dictionary.service.spec.ts`
- Modify: `front/src/views/HomeView.vue`（无需改结构，只是接口数据变多）

**Interfaces:**
- `GET /api/apps`：当前用户作为所有者的 + 在配置名单的 + 范围命中的，去重。三个方向都走索引：`application.ownerId`、`app_configurator.userId`、`app_access_scope (type,targetId)`（人员=我 / 部门=我所在部门 / 角色=我的启用角色 id）。不要先拉全部应用再在内存滤。**每项带 `isOwner`、`canConfigure`**，首页卡片只给所有者显示删除、只给配置者显示进后台的入口，避免点了 404。
- `deleteApp`：`requireOwner`。删应用前删掉该 `appId` 的配置名单行和使用范围行（流程三张表的连带已在流程计划 Task 5 做，这里核对一下确实删了）。现有 drop Mongo 集合逻辑保留。
- 字典：`list` / `itemsByCodes` 等读接口 `requireUse`；create / update / delete / 改项 `requireConfigure`。只有使用权的人读【请假单】下拉能看到「事假」，进不了应用后台，直接调写接口当作应用不存在。

- [ ] **Step 1: 写失败测试**

`list(5)`：他不是所有者，但部门范围命中【人事】，结果含【人事】且该项 `isOwner: false`、`canConfigure: false`。`deleteApp` 调用了两张权限表的 delete。字典写接口对仅 `canUse` 的人 404，读接口成功。

- [ ] **Step 2–4: 实现**

`list` 不要再只 `where: { ownerId }`。

- [ ] **Step 5: 提交（仅当使用者要求）**

---

### Task 8: 侧栏与设计入口按配置权收

**Files:**
- Modify: `front/src/views/AppWorkspaceView.vue`（【应用后台】、新建/删表、【转为流程表单】）
- Modify: `front/src/views/FormDesignView.vue`（进不了设计则回工作台）
- Modify: `server/src/application/application.controller.ts`（目录、设计、后台已由 `requireConfigure` / `requireUse` 分好；本任务核对每个方法）
- Modify: `front/src/stores/user.js` 或应用详情接口：给前端一个 `canConfigure`，避免只有使用权的人看见【应用后台】

**Interfaces:**
- `GET /api/apps/:id` 和目录增加 `canConfigure`、`isOwner`（不要只靠前端猜）；首页 `GET /api/apps` 每项同样带（Task 7）。
- 只有使用权：侧栏没有【应用后台】，表单树没有编辑表单 / 转为流程 / 删除表单（改名也不要）。仍有【添加数据】【数据管理】、侧栏三行待办。
- 配置者：有后台、能转类型、能删表单，没有【移交所有者】、删不了应用。
- 所有者：都有。首页应用卡片的删除按钮只在 `isOwner` 时渲染，接口继续走 `requireOwner`。
- 【数据管理】里异常单据的【重试】按钮按详情接口返回的 `canConfigure` 显示（流程计划 Task 14 已按此字段做，这里只是确认第 2 期起配置者也能看到）。

- [ ] **Step 1: 核对后端每个应用接口用的是 `requireUse` / `requireConfigure` / `requireOwner`**

| 动作 | 判定 |
|---|---|
| 目录、表单详情、填报、读字典 | `requireUse` |
| 保存字段、流程草稿/发布、发布页、改名、新建/删分组和表单、转类型、改名单/范围、写字典 | `requireConfigure` |
| 删应用、应用内移交 | `requireOwner` |

- [ ] **Step 2: 前端按 `canConfigure` / `isOwner` 藏入口**
- [ ] **Step 3: 提交（仅当使用者要求）**

---

### Task 9: 手工测试用例

**Files:**
- Create: `docs/testcases/2026-09-06-app-permission-test-cases.md`
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`（补：只有使用权的人不能进【表单设计】；待办抽屉不走应用接口——承接流程专项第 7 条未测完的部分）
- Modify: `docs/testcases/README.md`

专项按界面写，至少：

1. 【人事】所有者 A 打开应用后台【配置权限】，第一行是自己且标【所有者】、不能移除。添加启用中的 B。B 首页出现【人事】，能进【表单设计】和【字典管理】，不能【移交所有者】、不能删应用。
2. 【使用范围】加部门【研发部】（写明不含下级）。研发部启用账号 H 首页能看到【人事】，能【添加数据】，看不到【应用后台】。H 调出研发部后刷新，首页没有【人事】，网址进应用提示应用不存在。
3. 没部门的人靠角色或点名加入；停用部门的范围行仍在，文案「已停用，当前不生效」，该部门的人进不去。
4. 从名单移除 B：确认框提到同时可能失去使用权。范围盖不住时 B 被送回首页。
5. A 把所有者交给 C：名单里没有 A 也没有 C；范围出现「人员 = A」；A 被送到首页，再进【人事】只能当普通人。A 若再被交出去（先让 C 把 A 加回名单并交回 A，再交给 D），A 仍只是普通人。
6. 停用 A 后：B 仍能配、能填，不能移交。系统管理员在管理后台 → 人员 → A → 看到【人事】【移交】。只有 `admin.access` 的人看不到移交。交完后系统管理员仍打不开【人事】（除非交给自己）。
7. 无使用权的审批人 F：首页【我的待办】能打开请假抽屉，字典是中文，选记录能列出已通过；直接调 `/apps/:id/dictionaries` 当作应用不存在。F 不能进【数据管理】翻别人的单。
8. 失权发起人：范围去掉后，首页【我发起的】仍能【保存草稿】【再次提交】【撤回】【重试】，不能删草稿，已通过只读。

联合：流程表【请假单】发布后，范围内的人提交，配置者能【转为流程表单】（【加班单】），只有使用权的人菜单里没有这一项。

README：目录插入本专项；执行顺序接在流程表单专项之后；「不要测」写按表收权、删人、配置者删应用。

- [ ] **Step 1: 写专项、改联合、改纲领**
- [ ] **Step 2: 回读中文，确认没有乱码**
- [ ] **Step 3: 提交（仅当使用者要求）**

---

## 覆盖自检

| 规格章节 | 任务 |
|---|---|
| §5 所有者永远一人 | 5、6 |
| §5.1 移交方案 A、跳首页 | 5 |
| §5.2 停用后仅 system_admin 移交 | 6 |
| §6 配置名单只存人、第一行合并所有者 | 3 |
| §6.3 配置者能做 / 不能做 | 3、8 |
| §7 使用范围、始终可用只读、停用行保留 | 4 |
| §7.1 能配置就能使用 | 2 |
| §8 / §8.1 失权发起人（流程已做接口，本计划补用例） | 9 |
| §9 创建人=登录人（流程 Task 4 已做） | 依赖，不重复 |
| §11 两张表、反查索引、删应用级联 | 1、7 |
| §12 判定、字典读写分开、首页列表 | 2、7、8 |
| §13 第 2 期清单 | 全文 |
| §13 第 3 期按表收权 | 不做 |

流程第 1 期（待办抽屉、`formKind`、引擎）不在本计划。
