# 邮箱注册与账号登录

日期：2026-08-19  
范围：在现有用户名密码鉴权上增加邮箱。替代 `2026-08-18-auth-login-register-design.md` 中登录标识、数据模型、注册/登录接口与表单字段。其余（JWT、视觉、路由守卫）仍有效。

本期不做（见 `docs/TODO.md`）：邮箱验证码、找回密码。

## 方案 B

- 注册：邮箱、用户名、密码（前端仍保留确认密码，不入库）
- 登录：一个输入框，填用户名或邮箱，再加密码
- `user.email`、`user.username` 均全局唯一（UNIQUE 索引 + 注册预查 + `ER_DUP_ENTRY`）
- 不发邮件、不验证邮箱占用以外的真实性

## 数据

`user` 增加 `email varchar(255) NOT NULL UNIQUE`。入库前 trim + 小写。

用户名规则不变：trim 后 3–32 位字母数字下划线，UNIQUE。

## 接口

`POST /api/auth/register` 入参 `{ email, username, password }`。  
冲突 `409`：`用户名已存在` 或 `邮箱已存在`。成功 `201`，`data` 为 `{ id, username, email }`。

`POST /api/auth/login` 仍传 `{ username, password }`，其中 `username` 表示账号：含 `@` 则按邮箱查，否则按用户名查。失败仍 `401`，文案 `用户名/邮箱或密码错误`。

`GET /api/auth/profile` 的 `data` 增加 `email`。

## 前端

注册字段顺序：邮箱、用户名、密码、确认密码。  
登录标签改为「用户名 / 邮箱」，校验：用户名规则或邮箱格式，必填。

## 表结构

不同步改表。加列须使用者同意后再执行 ALTER。
