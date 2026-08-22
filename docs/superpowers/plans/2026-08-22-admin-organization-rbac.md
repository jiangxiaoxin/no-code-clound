# 管理后台组织与角色权限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立支持用户多部门、多角色的管理后台，提供人员、部门、角色管理，并让权限调整在下一次请求立即生效。

**Architecture:** 后端新增独立 `admin` 模块和权限守卫，使用显式关联表维护用户—部门、用户—角色、角色—权限关系；JWT 只保存身份，每次请求从数据库构造最新 principal。前端新增 `/admin` 嵌套路由和三个管理页面，Pinia 保存 profile 中的权限，前端路由只做体验保护，后端守卫负责最终授权。

**Tech Stack:** Vue 3、Vite、Vue Router、Pinia、Element Plus、Axios、NestJS 11、TypeORM、MySQL、Jest。

## Global Constraints

- 一个用户可以属于多个部门，不设置主部门。
- 一个用户可以拥有多个角色，有效权限为全部启用角色权限的并集。
- 部门不授予角色或权限。
- 权限代码由系统固定提供，不实现权限代码 CRUD。
- TypeORM 保持 `synchronize: false`；SQL 脚本生成后必须停下，获得使用者明确许可才能执行。
- 不新增 npm 依赖。
- 前端不使用 `el-text`、`el-space`。
- 不删除、修改或移动使用者已有注释和日志输出。
- 未经使用者明确要求，不执行 git commit；每个任务只给出建议提交信息。
- 后端按 TDD：先写失败测试，再实现，再跑测试。
- 统一接口响应保持 `{ code, message, data }`。

---

## File Structure

```text
server/
  sql/
    2026-08-22-admin-organization-rbac.sql
  src/
    app.module.ts
    user/
      user.entity.ts
    auth/
      auth.module.ts
      auth.service.ts
      auth.service.spec.ts
      jwt.strategy.ts
      permissions.decorator.ts
      permissions.guard.ts
      permissions.guard.spec.ts
    admin/
      admin.module.ts
      permissions.ts
      department/
        department.entity.ts
        user-department.entity.ts
        department.controller.ts
        department.service.ts
        department.service.spec.ts
        dto/create-department.dto.ts
        dto/update-department.dto.ts
      role/
        role.entity.ts
        user-role.entity.ts
        role-permission.entity.ts
        role.controller.ts
        role.service.ts
        role.service.spec.ts
        dto/create-role.dto.ts
        dto/update-role.dto.ts
        dto/list-role.dto.ts
      user/
        admin-user.controller.ts
        admin-user.service.ts
        admin-user.service.spec.ts
        dto/create-admin-user.dto.ts
        dto/update-admin-user.dto.ts
        dto/list-admin-user.dto.ts
        dto/update-user-status.dto.ts
        dto/reset-user-password.dto.ts

front/src/
  api/
    admin.js
    auth.js
  components/
    AppHeader.vue
    admin/
      AdminUserForm.vue
      DepartmentForm.vue
      RoleForm.vue
  layouts/
    AdminLayout.vue
  router/
    index.js
  stores/
    user.js
  views/admin/
    AdminUsersView.vue
    AdminDepartmentsView.vue
    AdminRolesView.vue
```

职责边界：

- `auth` 负责身份验证、构造当前请求用户和权限守卫。
- `admin/department` 只维护部门树和用户部门关联的合法性。
- `admin/role` 只维护角色、固定权限和用户角色关联的合法性。
- `admin/user` 组合人员基础信息、多个部门和多个角色。
- 前端页面只编排查询、筛选和弹框；表单组件承载可复用编辑逻辑。

---

### Task 1: 数据实体与数据库脚本

**Files:**

- Modify: `server/src/user/user.entity.ts`
- Create: `server/src/admin/department/department.entity.ts`
- Create: `server/src/admin/department/user-department.entity.ts`
- Create: `server/src/admin/role/role.entity.ts`
- Create: `server/src/admin/role/user-role.entity.ts`
- Create: `server/src/admin/role/role-permission.entity.ts`
- Create: `server/sql/2026-08-22-admin-organization-rbac.sql`

**Interfaces:**

- `User.status`: `'active' | 'disabled'`
- `Department.status`: `'active' | 'disabled'`
- `Role.status`: `'active' | 'disabled'`
- 所有关联实体使用独立自增 `id` 和复合唯一索引。

- [ ] **Step 1: 扩展 User 实体**

给 `User` 增加：

```ts
@Column({ type: 'varchar', length: 64 })
displayName: string;

@Column({ type: 'varchar', length: 16, default: 'active' })
status: 'active' | 'disabled';
```

不改动现有字段、注释和日志。

- [ ] **Step 2: 新增五个实体**

实体字段和索引严格按设计文档第 6 节。关联实体不使用 `@ManyToMany` 自动表，避免表名和删除行为不透明；服务层直接使用对应 Repository。

- [ ] **Step 3: 编写可重复审阅的 SQL 脚本**

脚本必须包含：

1. `ALTER TABLE user ADD displayName/status`。
2. `UPDATE user SET displayName = username`。
3. 创建 `department`、`role`、`user_department`、`user_role`、`role_permission`。
4. 插入或更新内置角色：

```text
name = 系统管理员
code = system_admin
status = active
builtIn = true
```

5. 插入第 5 节全部权限。
6. 将 `username = 'admin'` 的启用用户关联到 `system_admin`。
7. 如果 `admin` 不存在，使用 `SIGNAL SQLSTATE '45000'` 中止。

- [ ] **Step 4: 静态验证实体与 SQL 一致**

逐项核对列名、长度、默认值、唯一索引和普通索引。不得启动 `synchronize`，不得执行 SQL。

**Verification:**

```powershell
npm run build --prefix server
```

Expected: TypeScript 编译通过。SQL 文件存在但未执行。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加组织权限实体和可审阅的数据库迁移脚本。
```

---

### Task 2: 固定权限、当前用户 principal 与权限守卫

**Files:**

- Create: `server/src/admin/permissions.ts`
- Create: `server/src/auth/permissions.decorator.ts`
- Create: `server/src/auth/permissions.guard.ts`
- Create: `server/src/auth/permissions.guard.spec.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.spec.ts`
- Modify: `server/src/auth/jwt.strategy.ts`

**Interfaces:**

```ts
export const PERMISSIONS = {
  ADMIN_ACCESS: 'admin.access',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_CHANGE_STATUS: 'users.change_status',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_ASSIGN_DEPARTMENTS: 'users.assign_departments',
  USERS_ASSIGN_ROLES: 'users.assign_roles',
  DEPARTMENTS_READ: 'departments.read',
  DEPARTMENTS_CREATE: 'departments.create',
  DEPARTMENTS_UPDATE: 'departments.update',
  DEPARTMENTS_DELETE: 'departments.delete',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN_PERMISSIONS: 'roles.assign_permissions',
} as const;
```

```ts
export interface AuthPrincipal {
  id: number;
  username: string;
  email: string;
  displayName: string;
  status: 'active';
  departmentIds: number[];
  roleCodes: string[];
  permissions: string[];
}
```

- [ ] **Step 1: 写 PermissionsGuard 失败测试**

覆盖：

- 没有 `@Permissions` 时放行。
- 拥有全部权限时放行。
- 缺少任一权限时抛 `ForbiddenException`。
- 不修改现有 `RolesGuard` 的注释和日志。

- [ ] **Step 2: 跑守卫测试确认失败**

```powershell
npm test --prefix server -- permissions.guard.spec.ts --runInBand
```

Expected: 因装饰器或守卫不存在而失败。

- [ ] **Step 3: 实现固定权限、装饰器和守卫**

装饰器签名：

```ts
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

守卫使用 `Reflector.getAllAndOverride<string[]>`，要求全部权限满足。

- [ ] **Step 4: 写 principal 失败测试**

在 `auth.service.spec.ts` 增加：

- 启用用户返回多个部门 ID、多个启用角色代码和去重后的权限并集。
- 停用角色不贡献权限。
- 停用用户抛 `UnauthorizedException`。
- 用户不存在抛 `UnauthorizedException`。
- 登录停用用户返回「账号已停用」。

- [ ] **Step 5: 实现 `AuthService.getPrincipal(userId)`**

使用 User、UserDepartment、UserRole、Role、RolePermission Repository 分步查询。返回数组前去重并排序，保证测试和响应稳定。

- [ ] **Step 6: 调整 JwtStrategy**

保留现有 token 撤销检查和使用者注释。撤销检查通过后调用：

```ts
return this.authService.getPrincipal(payload.sub);
```

不从 JWT payload 读取角色或权限。

- [ ] **Step 7: 扩展登录和 profile 返回值**

登录成功签发 token 后返回 `getPrincipal(user.id)`；`GET /auth/profile` 继续返回 `req.user`。

**Verification:**

```powershell
npm test --prefix server -- permissions.guard.spec.ts auth.service.spec.ts --runInBand
npm run build --prefix server
```

Expected: 新增测试和原认证测试全部通过。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
让登录态按最新角色计算权限并增加接口权限守卫。
```

---

### Task 3: 部门管理后端

**Files:**

- Create: `server/src/admin/department/dto/create-department.dto.ts`
- Create: `server/src/admin/department/dto/update-department.dto.ts`
- Create: `server/src/admin/department/department.service.spec.ts`
- Create: `server/src/admin/department/department.service.ts`
- Create: `server/src/admin/department/department.controller.ts`

**Interfaces:**

```ts
create(dto: { name: string; parentId?: number | null; sortOrder?: number }): Promise<DepartmentItem>
update(id: number, dto: { name?: string; parentId?: number | null; sortOrder?: number; status?: 'active' | 'disabled' }): Promise<DepartmentItem>
tree(): Promise<DepartmentTreeItem[]>
delete(id: number): Promise<void>
requireAssignable(ids: number[]): Promise<Department[]>
```

- [ ] **Step 1: 写 DepartmentService 失败测试**

覆盖：

- 根部门和子部门按 `sortOrder ASC, createdAt ASC` 构造树。
- 新建和改名 trim。
- 同级重名返回 `ConflictException('同级部门名称已存在')`。
- 父部门不存在或停用返回 `BadRequestException`。
- 不能把父部门设为自身或后代。
- 有子部门时删除失败。
- 有关联人员时删除失败。
- `requireAssignable` 对不存在、停用、重复 ID 的处理。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm test --prefix server -- department.service.spec.ts --runInBand
```

- [ ] **Step 3: 实现 DTO**

使用 `class-validator`：

- `name`: `@IsString()`、`@Length(1, 64)`。
- `parentId`: 可选且允许 `null`，非空时 `@IsInt()`、`@Min(1)`。
- `sortOrder`: 可选整数。
- `status`: 可选 `@IsIn(['active', 'disabled'])`。

- [ ] **Step 4: 实现服务和树构造**

树节点返回 `memberCount`、`childCount`、`children`。循环检查从候选父节点向上遍历，任何重复 ID 都拒绝。

- [ ] **Step 5: 实现控制器和权限**

```text
GET    /admin/departments      departments.read
POST   /admin/departments      departments.create
PATCH  /admin/departments/:id  departments.update
DELETE /admin/departments/:id  departments.delete
```

控制器类统一 `@UseGuards(JwtAuthGuard, PermissionsGuard)`。

**Verification:**

```powershell
npm test --prefix server -- department.service.spec.ts --runInBand
npm run build --prefix server
```

Expected: 部门测试通过，API 编译通过。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加支持多级树和安全删除的部门管理接口。
```

---

### Task 4: 角色与权限管理后端

**Files:**

- Create: `server/src/admin/role/dto/create-role.dto.ts`
- Create: `server/src/admin/role/dto/update-role.dto.ts`
- Create: `server/src/admin/role/dto/list-role.dto.ts`
- Create: `server/src/admin/role/role.service.spec.ts`
- Create: `server/src/admin/role/role.service.ts`
- Create: `server/src/admin/role/role.controller.ts`

**Interfaces:**

```ts
list(query): Promise<RoleItem[]>
create(dto): Promise<RoleItem>
update(id, dto): Promise<RoleItem>
delete(id): Promise<void>
permissionGroups(): PermissionGroup[]
requireAssignable(ids: number[]): Promise<Role[]>
```

- [ ] **Step 1: 写 RoleService 失败测试**

覆盖：

- 角色名称和代码唯一。
- 代码仅允许 `/^[a-z0-9_]{2,64}$/`。
- 权限代码不存在时拒绝。
- 更新权限时使用事务整体替换。
- 内置 `system_admin` 不能改代码、停用或删除。
- 有用户关联的角色不能删除。
- 停用角色不能被 `requireAssignable` 返回。
- 权限清单按人员、部门、角色模块分组。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm test --prefix server -- role.service.spec.ts --runInBand
```

- [ ] **Step 3: 实现 DTO 和服务**

`permissionCodes` 必须是去重后的字符串数组；服务层再与 `PERMISSIONS` 值集合比对。创建和更新角色权限使用 `DataSource.transaction`。

- [ ] **Step 4: 实现控制器和权限**

```text
GET    /admin/permissions  roles.read
GET    /admin/roles        roles.read
POST   /admin/roles        roles.create
PATCH  /admin/roles/:id    roles.update + roles.assign_permissions（仅 permissionCodes 出现时）
DELETE /admin/roles/:id    roles.delete
```

更新接口如果包含 `permissionCodes`，服务层额外校验当前 principal 拥有 `roles.assign_permissions`。

**Verification:**

```powershell
npm test --prefix server -- role.service.spec.ts --runInBand
npm run build --prefix server
```

Expected: 角色测试通过。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加固定权限清单和多角色管理接口。
```

---

### Task 5: 人员管理后端

**Files:**

- Create: `server/src/admin/user/dto/create-admin-user.dto.ts`
- Create: `server/src/admin/user/dto/update-admin-user.dto.ts`
- Create: `server/src/admin/user/dto/list-admin-user.dto.ts`
- Create: `server/src/admin/user/dto/update-user-status.dto.ts`
- Create: `server/src/admin/user/dto/reset-user-password.dto.ts`
- Create: `server/src/admin/user/admin-user.service.spec.ts`
- Create: `server/src/admin/user/admin-user.service.ts`
- Create: `server/src/admin/user/admin-user.controller.ts`

**Interfaces:**

```ts
list(query): Promise<{ items: AdminUserItem[]; total: number; page: number; pageSize: number }>
create(dto): Promise<AdminUserItem>
update(actorId: number, userId: number, dto): Promise<AdminUserItem>
changeStatus(actorId: number, userId: number, status): Promise<void>
resetPassword(userId: number, newPassword: string): Promise<void>
```

- [ ] **Step 1: 写 AdminUserService 失败测试**

覆盖：

- 分页、关键词、部门、角色、状态筛选。
- 创建用户时 bcrypt hash，不返回密码。
- 创建和更新可保存多个部门和多个角色。
- 部门或角色 ID 重复时去重。
- 用户名、邮箱重复返回明确 `409`。
- 不能分配停用部门或停用角色。
- 当前用户不能停用自己。
- 当前用户不能移除自己的 `system_admin`。
- 任何操作不能让启用系统管理员数量降为 0。
- 关联更新中途失败时事务回滚。
- 重置密码要求 6–72 字并重新 hash。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm test --prefix server -- admin-user.service.spec.ts --runInBand
```

- [ ] **Step 3: 实现 DTO**

创建 DTO：

```ts
{
  username: string;      // 3–32，字母数字下划线
  displayName: string;   // 1–64
  email: string;
  password: string;      // 6–72
  departmentIds: number[];
  roleIds: number[];
}
```

更新 DTO 不含密码；状态和密码使用独立接口。

- [ ] **Step 4: 实现人员查询**

列表先分页得到用户 ID，再批量查询部门和角色，避免每行 N+1。返回的部门、角色按名称排序。

- [ ] **Step 5: 实现创建与更新事务**

顺序：

1. 校验基础字段和唯一性。
2. 调用 `DepartmentService.requireAssignable`。
3. 调用 `RoleService.requireAssignable`。
4. 在同一事务保存用户和替换两组关联。
5. 返回不含密码的人员详情。

- [ ] **Step 6: 实现状态与密码接口**

停用用户前执行自我保护和最后系统管理员保护。重置密码不注销其他 token；因为 JWT 每次会查询用户状态，账号停用仍立即生效。

- [ ] **Step 7: 实现控制器和权限**

```text
GET   /admin/users                    users.read
POST  /admin/users                    users.create
PATCH /admin/users/:id                users.update
PATCH /admin/users/:id/status         users.change_status
POST  /admin/users/:id/reset-password users.reset_password
```

修改 DTO 中出现 `departmentIds` 或 `roleIds` 时分别额外要求 `users.assign_departments`、`users.assign_roles`。

**Verification:**

```powershell
npm test --prefix server -- admin-user.service.spec.ts --runInBand
npm run build --prefix server
```

Expected: 人员测试和编译通过。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加支持多部门和多角色分配的人员管理接口。
```

---

### Task 6: AdminModule 注册与认证入口收口

**Files:**

- Create: `server/src/admin/admin.module.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**

- `AdminModule` 注册全部管理实体、控制器和服务。
- `AuthModule` 注册构造 principal 所需的关联实体，并导出 `JwtAuthGuard`、`PermissionsGuard`。

- [ ] **Step 1: 注册 AdminModule**

`AppModule.imports` 增加 `AdminModule`。不得改变数据库 `synchronize: false` 和现有日志配置。

- [ ] **Step 2: 停用公开注册**

移除 `AuthController` 的 `POST /auth/register` 路由和不再需要的 `RegisterDto` 注入路径；保留 `AuthService.register` 还是删除由实现前复核决定。若删除会触碰现有测试，则先将其改为 AdminUserService 创建流程测试，不能留下公开可调用入口。

- [ ] **Step 3: 跑全部后端测试**

```powershell
npm test --prefix server -- --runInBand
npm run build --prefix server
```

Expected: 全部 Jest 测试通过，Nest 编译通过。

- [ ] **Step 4: 停在数据库执行审批点**

向使用者展示 SQL 文件路径和内容摘要，明确询问是否执行。未获得明确批准时不能执行任何 `ALTER TABLE`、`CREATE TABLE`、`INSERT`。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
接入管理后台模块并关闭公开账号注册。
```

---

### Task 7: 前端登录态、菜单与路由权限

**Files:**

- Modify: `front/src/api/auth.js`
- Create: `front/src/api/admin.js`
- Modify: `front/src/stores/user.js`
- Modify: `front/src/components/AppHeader.vue`
- Modify: `front/src/router/index.js`
- Modify: `front/src/views/LoginView.vue`
- Delete: `front/src/views/RegisterView.vue`（仅在实现阶段经使用者确认删除；未确认则保留文件但移除路由引用）

**Interfaces:**

```js
userStore.hasPermission('admin.access') => boolean
```

管理 API 方法按资源命名：

```js
listAdminUsersApi
createAdminUserApi
updateAdminUserApi
updateAdminUserStatusApi
resetAdminUserPasswordApi
listDepartmentsApi
createDepartmentApi
updateDepartmentApi
deleteDepartmentApi
listRolesApi
createRoleApi
updateRoleApi
deleteRoleApi
listPermissionsApi
```

- [ ] **Step 1: 扩展 user store**

新增：

```js
function hasPermission(permission) {
  return Boolean(user.value?.permissions?.includes(permission))
}
```

`restore()` 继续以 `/auth/profile` 为唯一真相。

- [ ] **Step 2: 接上管理后台菜单**

`AppHeader.vue`：

- `管理后台` 仅在 `admin.access` 时显示。
- `onCommand('admin')` 执行 `router.push('/admin/users')`。
- 不修改现有退出注释。
- 将本次碰到的 `el-text` 替换为普通 HTML 标签，遵守现有规则。

- [ ] **Step 3: 配置嵌套路由**

路由 meta：

```js
meta: { permission: 'admin.access' }
```

全局守卫在登录校验后检查 `to.meta.permission`。无权限返回 `/`，并在页面入口统一提示一次「无权访问管理后台」。

- [ ] **Step 4: 收口注册入口**

删除 `/register` 路由和登录页可见注册链接，保留登录页现有“请找管理员分配账号”的业务提示。

**Verification:**

```powershell
npm run build --prefix front
```

Expected: 前端编译通过；有权限时菜单跳转，无权限时菜单不可见。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
接入管理后台路由并按当前权限控制入口。
```

---

### Task 8: 管理后台布局和部门页面

**Files:**

- Create: `front/src/layouts/AdminLayout.vue`
- Create: `front/src/views/admin/AdminDepartmentsView.vue`
- Create: `front/src/components/admin/DepartmentForm.vue`

- [ ] **Step 1: 实现 AdminLayout**

使用 `el-container`、`el-aside`、`el-header`、`el-main`、`el-menu`。导航三项指向人员、部门、角色。普通文本用 `span`、`h1`，不使用 `el-text`、`el-space`。

- [ ] **Step 2: 实现部门树**

加载 `GET /admin/departments`，使用树形表格或 `el-tree` 展示层级、状态、直接成员数和操作。

- [ ] **Step 3: 实现部门表单**

字段：名称、上级部门、排序。编辑时上级选择排除自身和后代。新建子部门默认带入当前部门 ID。

- [ ] **Step 4: 实现状态和删除交互**

停用和删除使用 `ElMessageBox.confirm`。后端 `409` 由现有拦截器显示具体原因；成功后重新加载树。

**Manual verification:**

1. 新建两个根部门。
2. 在其中一个根部门下新建两级子部门。
3. 尝试把父部门移动到后代下，确认失败。
4. 停用部门后，人员表单不能再选择。
5. 有子部门或人员时删除失败。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加管理后台布局和多级部门管理页面。
```

---

### Task 9: 角色管理页面

**Files:**

- Create: `front/src/views/admin/AdminRolesView.vue`
- Create: `front/src/components/admin/RoleForm.vue`

- [ ] **Step 1: 实现角色列表**

展示名称、代码、状态、人员数量、内置标识和操作。支持关键词、状态筛选。

- [ ] **Step 2: 实现角色表单**

加载固定权限分组。字段：名称、代码、说明、权限。创建时代码可编辑；编辑内置角色时代码只读。

- [ ] **Step 3: 实现权限操作控制**

没有 `roles.assign_permissions` 时权限区域只读；没有 create/update/delete 权限时隐藏对应按钮。

- [ ] **Step 4: 实现停用和删除限制提示**

内置角色不显示停用和删除操作；有关联人员时后端返回 `409` 并显示原因。

**Manual verification:**

1. 新建角色并勾选人员读取和部门读取权限。
2. 分配给测试用户后重新请求 profile，权限立即出现。
3. 停用角色后权限立即消失。
4. 内置角色不可停用或删除。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加多角色和固定权限配置页面。
```

---

### Task 10: 人员管理页面

**Files:**

- Create: `front/src/views/admin/AdminUsersView.vue`
- Create: `front/src/components/admin/AdminUserForm.vue`

- [ ] **Step 1: 实现人员查询和筛选**

关键词、部门、角色、状态变化后重置为第一页。表格显示多个部门和角色，使用标签换行，不使用 `el-space`。

- [ ] **Step 2: 实现新建和编辑表单**

部门使用可多选树选择；角色使用 `el-select multiple`。创建显示初始密码，编辑不显示密码。

- [ ] **Step 3: 实现启停**

当前用户行不显示停用操作。其他用户停用前二次确认。

- [ ] **Step 4: 实现重置密码**

独立对话框输入两次新密码，前端校验 6–72 字且两次一致，再请求接口。

- [ ] **Step 5: 按权限控制操作**

创建、编辑、启停、重置密码、分配部门、分配角色分别检查对应权限。没有分配权限时相关控件只读，而不是发送必然被拒绝的请求。

**Manual verification:**

1. 新建用户并同时选择两个部门、两个角色。
2. 列表和再次编辑时都完整回显。
3. 修改部门或角色后 profile 权限立即变化。
4. 停用用户后其已有登录态下一次请求返回 `401`。
5. 当前管理员不能停用自己或移除自己的系统管理员角色。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
增加支持多部门多角色的人员管理页面。
```

---

### Task 11: 数据库执行、联调和回归

**Files:**

- Review: `server/sql/2026-08-22-admin-organization-rbac.sql`
- Verify: all files changed by Tasks 1–10

- [ ] **Step 1: 再次获得数据库执行许可**

只有使用者明确回复同意执行该 SQL 后才能继续。许可必须针对这个脚本，不能从“继续实现”推断。

- [ ] **Step 2: 备份并执行 SQL**

执行前记录当前表结构和 `user` 表行数。执行后校验：

```sql
SELECT id, username, displayName, status FROM user;
SELECT id, name, code, status, builtIn FROM role;
SELECT COUNT(*) FROM role_permission;
SELECT u.username, r.code
FROM user u
JOIN user_role ur ON ur.userId = u.id
JOIN role r ON r.id = ur.roleId
WHERE u.username = 'admin';
```

Expected: `admin` 为启用状态并关联 `system_admin`，权限数量与固定权限清单一致。

- [ ] **Step 3: 运行自动化验证**

```powershell
npm test --prefix server -- --runInBand
npm run build --prefix server
npm run build --prefix front
```

Expected: 全部命令退出码 0。

- [ ] **Step 4: 完整手动验收**

按设计文档第 14 节逐项验收，并额外验证：

- 普通用户看不到管理后台入口。
- 直接调用管理接口得到 `403`。
- 多部门、多角色筛选结果正确。
- 部门和角色停用后不能新分配。
- 最后一个系统管理员保护生效。
- 登录、应用列表、应用工作区和表单设计原功能无回归。

- [ ] **Step 5: 检查工作区**

确认没有误改 `.env`、日志文件、使用者注释和日志输出；确认没有生成 `dist` 或数据库导出文件进入待提交列表。

**Suggested commit message（仅在使用者明确要求提交时）：**

```text
完成管理后台组织权限联调和回归验证。
```

---

## Implementation Order and Review Gates

按以下顺序实施，不并行改共享鉴权文件：

```text
Task 1 数据结构
  → Task 2 principal 与守卫
  → Task 3 部门后端
  → Task 4 角色后端
  → Task 5 人员后端
  → Task 6 模块整合与 SQL 审批
  → Task 7 前端路由权限
  → Task 8 部门页面
  → Task 9 角色页面
  → Task 10 人员页面
  → Task 11 数据库执行与完整验收
```

建议审阅门：

1. Task 1–2 后审阅数据模型和权限计算。
2. Task 3–6 后审阅全部 API，并等待 SQL 执行许可。
3. Task 7–10 后审阅 UI 和交互。
4. Task 11 后决定是否提交和推送。

## Plan Self-Review

- 设计中的多部门、多角色、固定权限、立即生效均有对应任务。
- 数据库脚本生成与执行明确分离。
- 用户停用、自我保护、最后管理员保护有后端测试和前端交互。
- 前端菜单、路由、按钮和后端接口形成四层权限控制。
- 没有依赖 `RolesGuard`，避免改动使用者现有注释和日志。
- 没有引入审计、岗位、主部门、数据范围等本期外功能。
- 实现前仍需使用者审阅设计文档和本计划；本计划本身不授权代码、SQL、commit 或 push。
