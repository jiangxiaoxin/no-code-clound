# 登录与注册设计

日期：2026-08-18  
范围：在空仓库中创建前后端分离项目，第一期只做用户名密码的注册与登录。

## 目标

用户完成注册后，可用同一用户名和密码登录。登录后进入首页；未登录不能访问首页。

不在本期范围：邮箱验证、验证码、刷新 token、第三方登录、角色权限、找回密码。

## 目录与技术栈

```text
no-code-cloud/
├── front/     Vue 3 + Vite + Vue Router + Pinia + axios + Element Plus + Less
└── server/    NestJS + TypeORM + MySQL 8 + @nestjs/jwt + bcrypt
```

- 前端开发端口：`5173`
- 后端端口：`3000`
- 接口统一前缀：`/api`
- 前端开发期通过 Vite 代理把 `/api` 转到 `http://localhost:3000`，避免跨域
- 后端仍开启 CORS，便于非代理访问

## 鉴权

- 登录标识：用户名 + 密码
- 用户名必须全局唯一（见「用户名校验」）
- 方案：JWT，前端把 `accessToken` 放在 Pinia 和 `localStorage`
- 请求头：`Authorization: Bearer <token>`
- token 有效期：7 天（`.env` 中可改）
- 密码：bcrypt 哈希存储，任何接口都不回传密码字段

## 数据模型

表名：`user`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | int | 主键，自增 | |
| username | varchar(32) | 非空，UNIQUE 索引 | 登录名，全局唯一 |
| password | varchar(255) | 非空 | bcrypt 哈希 |
| createdAt | datetime | 非空 | TypeORM 自动 |
| updatedAt | datetime | 非空 | TypeORM 自动 |

TypeORM `synchronize` 关闭，避免启动时静默改表。本期不引入正式 migration。建表规则见下方「表结构变更」。

## 用户名校验

- 格式：去掉首尾空格后 3–32 位，仅允许字母、数字、下划线。
- **全局唯一**：同一库的 `user` 表中，任意两行的 `username` 不得重复。
- 保障分层：
  1. 列上建立 `UNIQUE` 索引（数据库最终约束）。
  2. 注册时先按 `username` 查询，已存在则拒绝，不写入。
  3. 并发下若仍撞唯一索引（MySQL `ER_DUP_ENTRY`），同样视为冲突。
- 冲突时 HTTP `409`，`message` 固定为「用户名已存在」。
- 前端不做占用预检，只展示后端返回的该文案。

## HTTP 接口

统一响应：`{ code, message, data }`。`code === 0` 表示成功。

### `POST /api/auth/register`

- 入参：`{ username, password }`
- 校验：用户名 3–32 位（字母数字下划线，trim 后）；密码至少 6 位；用户名全局唯一
- 成功：`201`，`data` 为 `{ id, username }`
- 不自动登录，不返回 token
- 用户名已存在（查询命中或唯一索引冲突）：`409`，`message` 为「用户名已存在」

### `POST /api/auth/login`

- 入参：`{ username, password }`
- 成功：`200`，`data` 为 `{ accessToken, user: { id, username } }`
- 用户不存在或密码错误：`401`，文案统一为「用户名或密码错误」，不区分原因

### `GET /api/auth/profile`

- 需要有效 JWT
- 成功：`200`，`data` 为 `{ id, username }`
- 无 token 或 token 无效：`401`

## 前端页面

| 路由 | 页面 | 访问条件 |
|------|------|----------|
| `/login` | 登录 | 已登录则重定向到 `/` |
| `/register` | 注册 | 已登录则重定向到 `/` |
| `/` | 首页 | 未登录则重定向到 `/login` |

### 登录页与注册页视觉

- 全屏背景图：黄昏高空云层 + 远处玻璃建筑，冷色、低饱和、偏暗
- 实现时生成一张高清图，保存为 `front/src/assets/auth-bg.jpg`（或 `.png`），上覆一层薄暗色遮罩，保证右侧文字和表单对比度
- 表单整体偏右（右半屏垂直居中），左侧留出大面积画面
- 表单容器为半透明深色毛玻璃卡片（backdrop-filter + 细描边）
- 登录、注册共用同一张背景和同一套右栏卡片，只换表单字段

登录表单：用户名、密码、登录按钮；底部链到注册页。  
注册表单：用户名、密码、确认密码、注册按钮；底部链到登录页。注册成功后提示并跳转 `/login`，不自动登录。

### 首页

简单顶栏 + 内容区：欢迎语、当前用户名、退出按钮。退出后清空 token 和用户信息，跳转 `/login`。

## 前端状态与请求流

- Pinia store 保存 `accessToken` 和 `user`
- token 同时写入 `localStorage` 键 `accessToken`
- axios 请求拦截器：存在 token 则附加 `Authorization`
- axios 响应拦截器：
  - HTTP 401 或业务 `code !== 0`：用 Element Plus `ElMessage` 展示 `message`
  - 401：清空登录态并跳转 `/login`（登录接口本身的 401 只提示，不循环跳转）
- 应用启动：若 localStorage 有 token，先请求 `GET /api/auth/profile` 恢复用户；失败则清 token
- 路由守卫按上表执行

主路径：

1. 注册 → 后端写入哈希密码 → 跳登录页
2. 登录 → 拿到 JWT → 写入 Pinia 与 localStorage → 进首页
3. 退出 → 清空状态 → 回登录页

## 后端模块划分

- `AppModule`：加载 Config、TypeORM、Auth
- `AuthModule`：注册、登录、profile、JWT 签发与校验
- `User` entity：对应 `user` 表
- `JwtAuthGuard`：保护需要登录的接口
- 全局校验：`ValidationPipe`（whitelist + transform）
- 全局响应：拦截器包装为 `{ code, message, data }`
- 全局异常：将 HttpException 转为同一响应形状

## 配置

`server/.env` 使用占位值，不提交真实密钥。`.gitignore` 忽略 `.env`，提供 `server/.env.example`。

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=no_code_cloud
JWT_SECRET=replace_me_with_a_long_random_secret
JWT_EXPIRES_IN=7d
```

数据库（schema）不存在时，由使用者自行建库；应用只连接已有库。表是否存在、要不要建，按「表结构变更」执行。

## 表结构变更

- 应用启动时不自动建表、不自动改表。
- 若发现需要的表不存在（例如本期的 `user`），AI 可以创建，但必须先询问使用者并得到明确同意。
- 未经询问不得执行 `CREATE TABLE`、不得打开 TypeORM `synchronize`、不得对已有表做破坏性变更。
- 使用者同意后，用明确的建表 SQL（或一次性脚本）创建该表，并告知执行结果。

## 错误处理

- 前端表单：Element Plus rules（必填、长度、两次密码一致）
- 后端入参：class-validator，失败返回 `400`
- 用户名冲突：`409`，`message` 为「用户名已存在」
- 登录失败 / 无效 token：`401`
- 前端展示后端返回的 `message`，不发明文案覆盖业务错误

## 测试

后端（NestJS testing）：

- 注册成功
- 重复用户名返回 409
- 登录成功并返回 token
- 错误密码返回 401
- 无 token 访问 profile 返回 401
- 有效 token 访问 profile 成功

前端：手动走通 注册 → 登录 → 首页 → 退出。本期不做 E2E。

## 成功标准

1. 用占位 `.env` 填入真实 MySQL 后，后端可启动；`user` 表在使用者同意后由 AI 创建
2. 新用户注册成功后，立即用同一账号登录成功；重复用户名无法注册
3. 登录页、注册页表单偏右，全屏高端背景图可见
4. 刷新首页仍保持登录（token 有效期内）
5. 退出后无法再进入首页
