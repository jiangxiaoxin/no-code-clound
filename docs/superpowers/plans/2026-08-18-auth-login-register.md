# 登录与注册 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在空仓库创建 `front/` + `server/`，实现用户名密码注册与登录，注册成功后即可登录。

**Architecture:** 后端 NestJS 提供 `/api/auth/register|login|profile`，密码 bcrypt，登录签发 JWT；TypeORM 连接 MySQL 8 且 `synchronize: false`。前端 Vue3 用 Pinia + axios 持有 token，登录/注册页全屏背景 + 右侧毛玻璃表单，路由守卫保护首页。

**Tech Stack:** Vue 3, Vite, Vue Router, Pinia, axios, Element Plus, Less, NestJS, TypeORM, MySQL 8, @nestjs/jwt, bcrypt, class-validator.

## Global Constraints

- 前端目录 `front/`，后端目录 `server/`。
- 前端端口 `5173`，后端端口 `3000`，接口前缀 `/api`，Vite 代理 `/api` → `http://localhost:3000`。
- 登录标识：用户名 + 密码；JWT 放 Pinia 与 `localStorage` 键 `accessToken`；请求头 `Authorization: Bearer <token>`。
- 用户名必须全局唯一：UNIQUE 索引 + 注册前查询 + 捕获 `ER_DUP_ENTRY`；冲突 HTTP 409，message「用户名已存在」。
- 用户名格式：trim 后 3–32 位，仅字母数字下划线；密码至少 6 位。
- 统一响应 `{ code, message, data }`，`code === 0` 成功。
- TypeORM `synchronize: false`；缺表时 AI 必须先询问使用者，不得自行 `CREATE TABLE`。
- `server/.env` 使用占位值；`.gitignore` 忽略 `.env`；提供 `.env.example`。
- 注册成功不自动登录、不返回 token。
- 登录/注册页：全屏高端背景 `front/src/assets/auth-bg.jpg`，表单偏右，深色毛玻璃卡片。
- 未经用户明确要求，不执行 git commit。
- 后端业务逻辑按 TDD：先写失败测试，再写实现。脚手架与配置文件除外。

## File Structure

```text
no-code-cloud/
├── .gitignore
├── docs/superpowers/specs/2026-08-18-auth-login-register-design.md
├── docs/superpowers/plans/2026-08-18-auth-login-register.md
├── server/
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/
│   │   │   ├── interceptors/response.interceptor.ts
│   │   │   └── filters/http-exception.filter.ts
│   │   ├── user/user.entity.ts
│   │   └── auth/
│   │       ├── auth.module.ts
│   │       ├── auth.controller.ts
│   │       ├── auth.service.ts
│   │       ├── auth.service.spec.ts
│   │       ├── dto/register.dto.ts
│   │       ├── dto/login.dto.ts
│   │       ├── jwt-auth.guard.ts
│   │       └── jwt.strategy.ts
│   └── test/auth.e2e-spec.ts
└── front/
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── main.ts
    │   ├── App.vue
    │   ├── assets/auth-bg.jpg
    │   ├── api/http.ts
    │   ├── api/auth.ts
    │   ├── stores/user.ts
    │   ├── router/index.ts
    │   ├── styles/auth.less
    │   └── views/
    │       ├── LoginView.vue
    │       ├── RegisterView.vue
    │       └── HomeView.vue
```

---

### Task 1: 脚手架后端与配置

**Files:**
- Create: `server/`（NestJS CLI 生成）
- Create: `server/.env`、`server/.env.example`
- Create: 根目录 `.gitignore`
- Modify: `server/src/app.module.ts`、`server/src/main.ts`、`server/package.json`

**Interfaces:**
- Consumes: 无
- Produces: 可启动的 Nest 应用（尚无业务接口）；ConfigModule 读取 `PORT`、`DB_*`、`JWT_*`

- [ ] **Step 1: 用 Nest CLI 创建 server 项目**

在仓库根目录执行：

```bash
npx -y @nestjs/cli new server --package-manager npm --skip-git --strict
```

Expected: 生成 `server/`，含 Jest。

- [ ] **Step 2: 安装后端依赖**

```bash
cd server
npm install @nestjs/config @nestjs/typeorm @nestjs/jwt @nestjs/passport typeorm mysql2 bcrypt passport passport-jwt class-validator class-transformer
npm install -D @types/bcrypt @types/passport-jwt
```

- [ ] **Step 3: 写入环境变量占位**

`server/.env` 与 `server/.env.example` 内容相同：

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

根目录 `.gitignore` 至少包含：`node_modules/`、`dist/`、`server/.env`、`front/dist/`、`.DS_Store`。

- [ ] **Step 4: 配置 TypeORM（synchronize: false）与全局前缀**

`app.module.ts` 使用 `ConfigModule.forRoot({ isGlobal: true })` 和 `TypeOrmModule.forRootAsync`，读取 `DB_*`，`synchronize: false`，`autoLoadEntities: true`。

`main.ts`：`app.setGlobalPrefix('api')`；`app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`；`app.enableCors()`；监听 `PORT`。

- [ ] **Step 5: 确认 Nest 能编译**

```bash
cd server
npx nest build
```

Expected: 编译成功。若 MySQL 未配置，先不要 `nest start` 连库；本任务只保证配置写对、能 build。

---

### Task 2: 统一响应与异常

**Files:**
- Create: `server/src/common/interceptors/response.interceptor.ts`
- Create: `server/src/common/filters/http-exception.filter.ts`
- Modify: `server/src/main.ts`

**Interfaces:**
- Consumes: Nest `CallHandler`、`HttpException`
- Produces: 成功 `{ code: 0, message: 'ok', data }`；失败 `{ code: <httpStatus>, message, data: null }`

- [ ] **Step 1: 实现拦截器与过滤器**

```ts
// response.interceptor.ts
map((data) => ({ code: 0, message: 'ok', data: data ?? null }))
```

```ts
// http-exception.filter.ts
const status = exception.getStatus();
const payload = exception.getResponse();
message = typeof payload === 'string' ? payload : payload.message;
// message 若是数组，取第一项或 join
res.status(status).json({ code: status, message, data: null });
```

在 `main.ts` 注册全局拦截器与过滤器。

- [ ] **Step 2: 编译确认**

```bash
cd server
npx nest build
```

Expected: 成功。

---

### Task 3: User 实体与 Auth DTO

**Files:**
- Create: `server/src/user/user.entity.ts`
- Create: `server/src/auth/dto/register.dto.ts`
- Create: `server/src/auth/dto/login.dto.ts`

**Interfaces:**
- Consumes: TypeORM、class-validator
- Produces: `User` entity（表名 `user`）；`RegisterDto` / `LoginDto`

- [ ] **Step 1: 写 User entity**

```ts
@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: 写 DTO**

```ts
export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,32}$/, { message: '用户名须为 3–32 位字母、数字或下划线' })
  username: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
```

`LoginDto` 字段相同（登录时用户名同样 trim + Matches，密码 MinLength 6）。

**不要**执行 `CREATE TABLE`。若后续启动报表不存在，先询问使用者。

---

### Task 4: 注册（含全局唯一）— TDD

**Files:**
- Create: `server/src/auth/auth.service.ts`
- Create: `server/src/auth/auth.service.spec.ts`
- Create: `server/src/auth/auth.module.ts`
- Create: `server/src/auth/auth.controller.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `Repository<User>`、`RegisterDto`
- Produces:
  - `AuthService.register(dto: RegisterDto): Promise<{ id: number; username: string }>`
  - `POST /api/auth/register`

- [ ] **Step 1: 写失败测试（注册成功与用户名冲突）**

`auth.service.spec.ts` 用 mock repository：

```ts
describe('AuthService.register', () => {
  it('hashes password and returns id+username without password', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((x) => x);
    repo.save.mockImplementation(async (u) => ({ id: 1, ...u }));
    const result = await service.register({ username: 'alice', password: 'secret1' });
    expect(result).toEqual({ id: 1, username: 'alice' });
    expect(result).not.toHaveProperty('password');
    expect(repo.save).toHaveBeenCalled();
    const saved = repo.save.mock.calls[0][0];
    expect(saved.password).not.toBe('secret1');
  });

  it('throws 409 when username already exists', async () => {
    repo.findOne.mockResolvedValue({ id: 1, username: 'alice' });
    await expect(
      service.register({ username: 'alice', password: 'secret1' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('throws 409 when unique index is violated', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((x) => x);
    const err = Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
    repo.save.mockRejectedValue(err);
    await expect(
      service.register({ username: 'alice', password: 'secret1' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
```

冲突异常的 `message` 必须是「用户名已存在」。

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd server
npx jest src/auth/auth.service.spec.ts --offline 2>nul || npx jest src/auth/auth.service.spec.ts
```

Expected: FAIL（`AuthService` 不存在或 register 未实现）。

- [ ] **Step 3: 最小实现 register**

```ts
async register(dto: RegisterDto) {
  const exists = await this.userRepo.findOne({ where: { username: dto.username } });
  if (exists) throw new ConflictException('用户名已存在');
  const password = await bcrypt.hash(dto.password, 10);
  try {
    const user = await this.userRepo.save(this.userRepo.create({ username: dto.username, password }));
    return { id: user.id, username: user.username };
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') throw new ConflictException('用户名已存在');
    throw e;
  }
}
```

Controller：`@Post('register') @HttpCode(201)` 调用 service。`AuthModule` 导入 `TypeOrmModule.forFeature([User])` 并导出。`AppModule` 导入 `AuthModule`。

- [ ] **Step 4: 再跑测试，确认通过**

```bash
cd server
npx jest src/auth/auth.service.spec.ts
```

Expected: PASS。

---

### Task 5: 登录签发 JWT — TDD

**Files:**
- Modify: `server/src/auth/auth.service.ts`、`auth.service.spec.ts`、`auth.module.ts`、`auth.controller.ts`

**Interfaces:**
- Consumes: `LoginDto`、`JwtService`
- Produces: `login(dto): Promise<{ accessToken: string; user: { id: number; username: string } }>`；`POST /api/auth/login`

- [ ] **Step 1: 写失败测试**

```ts
it('returns token and user on correct password', async () => { /* mock findOne + bcrypt hash match + jwt.sign */ });
it('throws 401 with 用户名或密码错误 when user missing', async () => { /* findOne null */ });
it('throws 401 with 用户名或密码错误 when password mismatches', async () => { /* bcrypt fail */ });
```

- [ ] **Step 2: 跑测试，确认失败**

Expected: FAIL（`login` 未定义）。

- [ ] **Step 3: 实现 login**

查用户；没有则 `UnauthorizedException('用户名或密码错误')`；`bcrypt.compare` 失败同样该异常；成功则 `jwt.sign({ sub: user.id, username: user.username })`，返回 `{ accessToken, user: { id, username } }`。

`AuthModule` 注册 `JwtModule.registerAsync`，secret / expiresIn 来自 env。

- [ ] **Step 4: 再跑测试，确认通过**

```bash
cd server
npx jest src/auth/auth.service.spec.ts
```

Expected: PASS。

---

### Task 6: profile + JwtAuthGuard — TDD

**Files:**
- Create: `server/src/auth/jwt.strategy.ts`
- Create: `server/src/auth/jwt-auth.guard.ts`
- Modify: `auth.controller.ts`、`auth.service.ts`、`auth.service.spec.ts`、`auth.module.ts`

**Interfaces:**
- Consumes: JWT payload `{ sub, username }`
- Produces: `GET /api/auth/profile`（需 Bearer token），返回 `{ id, username }`

- [ ] **Step 1: 写失败测试 `getProfile`**

用户存在返回 `{ id, username }`；不存在抛 401。

- [ ] **Step 2: 跑测试，确认失败**

- [ ] **Step 3: 实现 JwtStrategy + Guard + `GET profile`**

`JwtStrategy`：从 `Authorization` Bearer 取 token，`validate` 返回 `{ id: payload.sub, username: payload.username }`。Controller 用 `@UseGuards(JwtAuthGuard)`，从 `req.user` 返回。

- [ ] **Step 4: 再跑全部 auth 单测**

```bash
cd server
npx jest src/auth/auth.service.spec.ts
```

Expected: PASS。

---

### Task 7: 脚手架前端

**Files:**
- Create: `front/`（Vite + Vue3）
- Modify: `front/vite.config.ts`、`front/package.json`、`front/src/main.ts`

**Interfaces:**
- Consumes: 无
- Produces: 可 `npm run dev` 的 Vue3 应用；已装 axios、element-plus、less、vue-router、pinia

- [ ] **Step 1: 创建 Vite Vue TS 项目**

```bash
npm create vue@latest front -- --typescript --router --pinia --eslint --bare
```

若交互式，改为：

```bash
npm create vite@latest front -- --template vue
```

然后安装：`vue-router` `pinia` `axios` `element-plus` `less`。

- [ ] **Step 2: 配置**

`vite.config.ts`：`server.proxy['/api'] = { target: 'http://localhost:3000', changeOrigin: true }`；Element Plus 按需或全量引入。`main.ts` 使用 Less、Router、Pinia、ElementPlus。

- [ ] **Step 3: 确认前端能 build**

```bash
cd front
npm run build
```

Expected: 成功。

---

### Task 8: axios、Pinia、路由守卫

**Files:**
- Create: `front/src/api/http.ts`、`front/src/api/auth.ts`、`front/src/stores/user.ts`、`front/src/router/index.ts`

**Interfaces:**
- Consumes: `/api/auth/*`
- Produces:
  - `useUserStore()`: `{ accessToken, user, setSession, logout, restore }`
  - `registerApi` / `loginApi` / `profileApi`
  - 路由：`/login` `/register` `/`

- [ ] **Step 1: http.ts**

`baseURL: '/api'`；请求拦截器附加 Bearer；响应拦截器：若 `response.data.code !== 0` 用 `ElMessage.error`；HTTP 401 时，登录/注册请求只提示，其它请求 `logout` 并 `router.replace('/login')`。成功返回 `response.data.data`。

- [ ] **Step 2: store + API + router**

`localStorage` 键名 `accessToken`。`restore()`：有 token 则调 profile，失败则 logout。

守卫：无 token 访问 `/` → `/login`；有 token 访问 `/login` 或 `/register` → `/`。启动时先 `restore()`。

---

### Task 9: 登录/注册/首页 UI

**Files:**
- Create: `front/src/assets/auth-bg.jpg`（生成高端黄昏云层+玻璃建筑图）
- Create: `front/src/styles/auth.less`
- Create: `front/src/views/LoginView.vue`、`RegisterView.vue`、`HomeView.vue`
- Modify: `front/src/App.vue`

**Interfaces:**
- Consumes: `loginApi` / `registerApi` / `useUserStore`
- Produces: 偏右毛玻璃表单；注册成功跳转登录；登录成功进首页；首页显示用户名与退出

- [ ] **Step 1: 生成背景图并写 auth.less**

全屏 `background-image` + 暗色遮罩；右侧栏垂直居中放置卡片；`backdrop-filter: blur(18px)`；深色半透明背景与细描边。

- [ ] **Step 2: LoginView / RegisterView**

Element Plus `el-form`。登录：username、password。注册：username、password、confirmPassword（自定义 validator 两次一致）。注册成功 `ElMessage.success` 后 `router.push('/login')`。链到对方页面。

- [ ] **Step 3: HomeView**

顶栏欢迎当前 `user.username`，退出按钮调用 `logout()` 并跳转 `/login`。

---

### Task 10: 联调核对清单（手动）

**Files:** 无新文件

- [ ] **Step 1: 若启动报 `user` 表不存在，停止并询问使用者是否创建，不得自行建表**
- [ ] **Step 2: 使用者同意后，用下列 SQL 建表并回报结果**

```sql
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(32) NOT NULL,
  `password` varchar(255) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_user_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 3: 手动验证**

1. 注册新用户成功 → 跳转登录
2. 同一用户名再注册 → 409「用户名已存在」
3. 正确密码登录 → 首页显示用户名
4. 错误密码 →「用户名或密码错误」
5. 刷新首页仍登录
6. 退出后无法进首页
7. 登录/注册页表单偏右，背景图可见
