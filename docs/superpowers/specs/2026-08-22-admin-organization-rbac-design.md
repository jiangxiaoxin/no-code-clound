# 管理后台组织与角色权限设计

日期：2026-08-22  
状态：待使用者审阅  
范围：管理后台入口、人员管理、部门管理、角色管理，以及支撑这些功能的多部门、多角色权限模型。

## 1. 背景与目标

当前系统已经具备账号注册、登录、JWT 鉴权和用户表，但用户只有 `username`、`email`、`password`；现有 `RolesGuard` 仍是实验代码，不会真正拒绝请求，也没有注册到 `AuthModule.providers`，其测试接口没有叠加 `JwtAuthGuard`；前端「管理后台」菜单也没有跳转行为。

本设计要完成：

1. 一个用户可以属于多个部门。
2. 一个用户可以拥有多个角色，最终权限取所有启用角色权限的并集。
3. 管理后台包含人员管理、部门管理、角色管理。
4. 前端根据当前用户权限控制菜单和路由；后端对每个管理接口做最终鉴权。
5. 部门和角色的调整立即生效，不依赖重新登录。
6. 现有账号数据可平滑升级，并为现有 `admin` 账号建立首个系统管理员身份。

## 2. 本期边界

### 本期实现

- 多级部门树。
- 用户与部门多对多关联。
- 用户与角色多对多关联。
- 固定权限代码清单，角色可勾选权限。
- 人员创建、编辑、启停、重置密码、分配部门和角色。
- 部门新增、编辑、启停、删除。
- 角色新增、编辑、启停、删除、配置权限。
- 管理后台菜单、路由和三个管理页面。
- 登录态恢复时加载最新人员状态、角色和权限。

### 本期不实现

- 租户、公司或组织空间隔离。
- 部门负责人、岗位、汇报关系、兼任比例、主部门。
- 按部门限定数据可见范围。
- 应用级角色和应用级权限。
- 审批流、操作审计日志、批量导入导出。
- 用户自行注册后等待审批。
- 自定义权限代码；权限代码由系统固定提供。

## 3. 核心决策

### 3.1 用户可以属于多个部门

用户与部门通过 `user_department` 关联。关联只表达成员归属，不设置主部门，也不从部门继承角色。这样能支持一人在多个项目组或职能部门任职，同时避免部门变动隐式改变权限。

### 3.2 用户可以拥有多个角色

用户与角色通过 `user_role` 关联。用户有效权限为：

```text
所有已启用角色的权限集合并集
```

角色停用后，其权限立即不再授予；关联关系保留，重新启用角色后恢复。

### 3.3 部门不直接授予权限

部门只回答“人属于哪里”，角色只回答“人能做什么”。两者通过人员产生关联，但互不依赖：

```text
Department N ← user_department → N User N ← user_role → N Role
Role 1 ← role_permission → N PermissionCode
```

### 3.4 权限采用固定代码，不建立权限主表

权限清单由后端常量定义，前端通过接口读取并按模块分组展示。角色权限存入 `role_permission`。这样避免现在就引入权限树管理，同时保留未来扩展能力。

### 3.5 JWT 不保存最终权限

JWT 继续只保存用户标识和基础账号信息。每次通过 JWT 后，后端根据 `userId` 查询当前用户状态、启用角色和权限，构造请求用户对象。这样用户停用、角色停用、权限修改都能在下一次请求立即生效，不需要强制重新登录。

### 3.6 不改动现有用户注释和日志

现有 `RolesGuard`、认证控制器、异常过滤器、响应拦截器中的使用者注释和日志保持原样。管理后台新增独立的 `PermissionsGuard` 和权限装饰器，不依赖实验中的 `RolesGuard`。

## 4. 模块职责

### 4.1 人员管理

页面能力：

- 按用户名、姓名、邮箱模糊搜索。
- 按部门、角色、状态筛选。
- 分页查看人员。
- 新建人员：用户名、姓名、邮箱、初始密码、多个部门、多个角色。
- 编辑人员基础信息、部门和角色。
- 启用或停用人员。
- 管理员为人员设置新密码。
- 查看创建时间和更新时间。

规则：

- 用户名和邮箱全局唯一。
- 停用用户不能登录；已有 token 在下一次请求时返回 `401`。
- 当前登录管理员不能停用自己。
- 当前登录管理员不能移除自己的 `system_admin` 角色。
- 系统至少保留一个启用且拥有 `system_admin` 角色的用户。
- 部门和角色只能分配存在且启用的记录。
- 人员删除本期不做，使用停用避免历史数据失去引用。

### 4.2 部门管理

页面能力：

- 以树形结构展示多级部门。
- 新建根部门或子部门。
- 修改名称、上级部门、排序和状态。
- 查看直接成员数量、子部门数量。
- 停用或启用部门。
- 删除空部门。

规则：

- 部门名称 trim 后 1–64 字。
- 同一上级下部门名称唯一；不同上级可以同名。
- 上级不能是自身或自身后代，避免循环。
- 停用部门不能再分配给人员，也不能在其下新建子部门。
- 停用不自动移除现有人员关系。
- 有子部门或有关联人员时不能删除。

### 4.3 角色管理

页面能力：

- 查看角色名称、代码、说明、状态、人员数量。
- 新建自定义角色。
- 修改名称、说明、状态和权限。
- 删除未分配人员的自定义角色。
- 查看系统提供的权限清单并按模块勾选。

规则：

- 角色名称 trim 后 1–32 字且全局唯一。
- 角色代码使用小写字母、数字和下划线，2–64 字且全局唯一。
- 内置 `system_admin` 角色不可改代码、停用或删除。
- 自定义角色停用后不再授予权限，也不能新分配给人员。
- 已分配人员的角色不能删除。
- 角色只能保存系统权限清单中存在的权限代码。

## 5. 权限清单

第一期固定权限：

```text
admin.access

users.read
users.create
users.update
users.change_status
users.reset_password
users.assign_departments
users.assign_roles

departments.read
departments.create
departments.update
departments.delete

roles.read
roles.create
roles.update
roles.delete
roles.assign_permissions
```

权限分组仅用于前端展示，不影响鉴权。`system_admin` 角色拥有全部权限。管理后台路由要求 `admin.access`，具体按钮和接口再要求对应细分权限。

## 6. 数据模型

TypeORM 继续保持 `synchronize: false`。实现时新增 SQL 脚本，但未获得使用者明确许可前不得执行。

### 6.1 修改 `user`

新增字段：

- `displayName varchar(64) not null`：人员姓名；迁移时先用 `username` 回填。
- `status varchar(16) not null default 'active'`：仅允许 `active`、`disabled`。

保留现有字段和唯一约束：`id`、`username`、`email`、`password`、`createdAt`、`updatedAt`。

### 6.2 `department`

- `id int`：自增主键。
- `name varchar(64)`：非空。
- `parentId int null`：空表示根部门。
- `status varchar(16)`：`active` 或 `disabled`。
- `sortOrder int`：默认 0，数字越小越靠前。
- `createdAt datetime`、`updatedAt datetime`。
- 唯一约束：`(parentId, name)`。
- 索引：`parentId`、`status`。

根部门在 MySQL 中 `parentId = null` 时复合唯一索引不能阻止重复名称，因此服务层仍必须检查同级重名。

### 6.3 `role`

- `id int`：自增主键。
- `name varchar(32)`：非空、全局唯一。
- `code varchar(64)`：非空、全局唯一。
- `description varchar(255)`：默认空字符串。
- `status varchar(16)`：`active` 或 `disabled`。
- `builtIn boolean`：系统内置角色为 true。
- `createdAt datetime`、`updatedAt datetime`。

### 6.4 `user_department`

- `id int`：自增主键。
- `userId int`、`departmentId int`：非空。
- `createdAt datetime`。
- 唯一约束：`(userId, departmentId)`。
- 索引：`userId`、`departmentId`。

### 6.5 `user_role`

- `id int`：自增主键。
- `userId int`、`roleId int`：非空。
- `createdAt datetime`。
- 唯一约束：`(userId, roleId)`。
- 索引：`userId`、`roleId`。

### 6.6 `role_permission`

- `id int`：自增主键。
- `roleId int`：非空。
- `permission varchar(64)`：固定权限代码。
- 唯一约束：`(roleId, permission)`。
- 索引：`roleId`、`permission`。

### 6.7 关联完整性

项目现有业务表没有数据库外键，本期保持一致，不新增外键。服务层使用事务维护关联：

- 更新人员部门时，先校验全部部门，再整体替换 `user_department`。
- 更新人员角色时，先校验全部角色，再整体替换 `user_role`。
- 更新角色权限时，先校验全部权限代码，再整体替换 `role_permission`。
- 删除部门或角色前检查引用数量。

## 7. 后端架构

新增 `admin` 模块，避免把组织管理塞进现有 `auth` 模块：

```text
server/src/admin/
  admin.module.ts
  permissions.ts
  permissions.decorator.ts
  permissions.guard.ts
  department/
  role/
  user/
```

实体放在各自领域目录，关联实体跟随被管理领域。模块对外只暴露管理 API 和构造当前用户权限所需的查询服务。

### 请求用户对象

JWT 验证成功后的 `req.user`：

```ts
{
  id: number
  username: string
  email: string
  displayName: string
  status: 'active'
  roleCodes: string[]
  permissions: string[]
}
```

### 守卫顺序

管理控制器统一使用：

```text
JwtAuthGuard → PermissionsGuard
```

`PermissionsGuard` 读取 `@Permissions(...)`，要求当前用户拥有全部声明权限。未登录或用户已停用返回 `401`；已登录但权限不足返回 `403`。

## 8. HTTP 接口

统一响应保持 `{ code, message, data }`。所有 `/api/admin/**` 接口要求 JWT 和对应权限。

### 8.1 当前用户

`GET /api/auth/profile`

返回：

```json
{
  "id": 1,
  "username": "admin",
  "displayName": "管理员",
  "email": "admin@example.com",
  "departmentIds": [1, 3],
  "roleCodes": ["system_admin"],
  "permissions": ["admin.access", "users.read"]
}
```

`permissions` 实际返回完整集合，示例省略其余项。

### 8.2 权限清单

`GET /api/admin/permissions`

返回按模块分组的固定权限清单，供角色页面渲染。

### 8.3 部门接口

- `GET /api/admin/departments`：返回完整部门树，每项含直接成员数和子部门数。
- `POST /api/admin/departments`：入参 `{ name, parentId?, sortOrder? }`。
- `PATCH /api/admin/departments/:id`：入参可含 `{ name, parentId, sortOrder, status }`。
- `DELETE /api/admin/departments/:id`：仅允许删除无子部门且无人员的部门。

部门节点返回：

```json
{
  "id": 2,
  "name": "平台研发",
  "parentId": 1,
  "status": "active",
  "sortOrder": 0,
  "memberCount": 8,
  "childCount": 0,
  "children": []
}
```

### 8.4 角色接口

- `GET /api/admin/roles?keyword=&status=`：返回角色列表。
- `POST /api/admin/roles`：入参 `{ name, code, description, permissionCodes }`。
- `PATCH /api/admin/roles/:id`：入参可含 `{ name, description, status, permissionCodes }`；内置角色限制在服务层校验。
- `DELETE /api/admin/roles/:id`：仅允许删除未分配人员的非内置角色。

角色返回：

```json
{
  "id": 3,
  "name": "人员管理员",
  "code": "user_admin",
  "description": "维护人员和部门",
  "status": "active",
  "builtIn": false,
  "permissionCodes": ["admin.access", "users.read", "users.update"],
  "memberCount": 2
}
```

### 8.5 人员接口

- `GET /api/admin/users?page=1&pageSize=20&keyword=&departmentId=&roleId=&status=`。
- `POST /api/admin/users`：创建账号并一次性分配多个部门和角色。
- `PATCH /api/admin/users/:id`：修改姓名、用户名、邮箱、部门和角色。
- `PATCH /api/admin/users/:id/status`：入参 `{ status }`。
- `POST /api/admin/users/:id/reset-password`：入参 `{ newPassword }`。

列表返回：

```json
{
  "items": [
    {
      "id": 1,
      "username": "alice",
      "displayName": "张三",
      "email": "alice@example.com",
      "status": "active",
      "departments": [{ "id": 1, "name": "研发部" }],
      "roles": [{ "id": 3, "name": "人员管理员", "code": "user_admin" }],
      "createdAt": "2026-08-22T08:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

## 9. 错误语义

- `400`：参数不合法、部门循环、分配了停用部门或停用角色、权限代码不存在。
- `401`：token 无效、用户不存在或已停用。
- `403`：当前用户缺少接口要求的权限。
- `404`：人员、部门或角色不存在。
- `409`：用户名、邮箱、同级部门名、角色名或角色代码重复；删除仍有关联的部门或角色；操作将导致没有可用系统管理员。

前端继续使用现有 HTTP 拦截器显示后端 `message`。

## 10. 前端信息架构

### 路由

```text
/admin                  → 默认重定向 /admin/users
/admin/users            → 人员管理
/admin/departments      → 部门管理
/admin/roles            → 角色管理
```

`/admin` 路由要求 `admin.access`。没有权限时返回首页并提示无权访问。前端保护只用于体验，不能替代后端权限校验。

### 管理后台布局

- 左侧固定导航：人员管理、部门管理、角色管理。
- 顶部显示「管理后台」、当前用户和返回工作台入口。
- 主区域显示当前子路由。
- 不使用 `el-text`、`el-space`；普通文本使用 HTML 标签和样式。

### 人员管理页面

- 顶部：关键词、部门、角色、状态筛选，以及新增人员按钮。
- 表格：姓名/账号、邮箱、部门、角色、状态、创建时间、操作。
- 新增和编辑使用抽屉或对话框，部门用支持多选的树选择，角色用多选下拉。
- 操作包括编辑、启停、重置密码。
- 按权限隐藏或禁用按钮。

### 部门管理页面

- 左侧或主区域树形表格展示部门层级。
- 支持新增根部门、新增子部门、编辑、启停、删除。
- 编辑表单使用树选择上级部门，并排除自身及后代。

### 角色管理页面

- 表格展示角色、代码、状态、人员数量。
- 新增/编辑角色时按权限模块展示复选框。
- 内置角色显示标识，其受限操作不可点击。

## 11. 登录与注册调整

- 登录返回和 `GET /auth/profile` 都包含最新 `displayName`、`roleCodes`、`permissions`。
- 用户停用后，登录统一返回「账号已停用」；已有 token 下次请求返回 `401`。
- 人员账号由管理员创建后，公开注册不再符合系统模型。
- 本期移除前端 `/register` 入口和路由，并停用公开 `POST /auth/register`；首次管理员通过迁移脚本从现有 `admin` 账号绑定。

如果部署环境没有 `admin` 账号，SQL 脚本必须停止并提示先明确指定首个管理员，不能自动选择任意用户。

## 12. 数据迁移与初始化

迁移脚本只生成，不自动执行。执行顺序：

1. 备份数据库。
2. 给 `user` 增加 `displayName`、`status`，并回填历史用户。
3. 创建部门、角色和三张关联表。
4. 创建内置 `system_admin` 角色。
5. 写入全部固定权限。
6. 把现有用户名为 `admin` 的用户关联到 `system_admin`。
7. 校验至少存在一个启用系统管理员。
8. 启动新版本后检查 `/api/auth/profile`。

迁移失败必须整体回滚；不得开启 TypeORM `synchronize`。

## 13. 测试策略

### 后端单元测试

- 人员多部门、多角色保存和读取。
- 部门同级重名、循环、非空删除、停用后不可分配。
- 角色权限校验、内置角色保护、有关联人员时不可删除。
- 多角色权限合并、停用角色不授予权限。
- 停用用户不能登录且已有 token 失效。
- `PermissionsGuard` 对允许、缺权限、无权限声明三种情况。
- 当前管理员自我保护和最后一个系统管理员保护。
- 事务中任一步失败时不留下部分关联。

### 前端验证

- 有 `admin.access` 时显示管理后台菜单并可进入。
- 无权限时菜单隐藏，直接输入 `/admin` 也会离开管理页。
- 人员可以保存多个部门和多个角色。
- 部门树新增、移动、停用和删除限制符合规则。
- 角色权限勾选、内置角色限制、人员数量显示正确。
- 后端返回 `401`、`403`、`409` 时提示正确。

## 14. 验收标准

1. 一个用户可保存、展示和修改多个部门。
2. 一个用户可保存、展示和修改多个角色。
3. 多角色权限按并集计算，角色或用户停用后下一次请求立即生效。
4. 只有拥有 `admin.access` 的用户能进入管理后台。
5. 三个模块的新增、查询、编辑、启停和受限删除可用。
6. 系统不会因管理操作失去最后一个启用的系统管理员。
7. 数据库变更脚本在使用者明确批准前不执行。
8. 实现过程不删除或修改使用者已有注释和日志输出。

## 15. 待审阅结论

本文已明确采用：

- 用户与部门多对多，不设主部门。
- 用户与角色多对多。
- 部门不授予权限。
- 角色权限使用固定代码清单。
- 后端每次请求读取最新状态和权限。
- 管理员创建账号，关闭公开注册。

使用者确认这些决策后，再进入代码实现。
