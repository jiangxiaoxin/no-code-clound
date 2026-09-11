# 数据库脚本（MySQL）

本目录存放 **MySQL** 建表与迁移脚本。表单填报数据在 **MongoDB**（按表单动态建 collection），不在此目录。

后端 `TypeOrmModule` 已设 `synchronize: false`，部署前须手动执行脚本或确认库结构已与实体一致。

## 环境变量

见 `server/.env.example`：

| 变量 | 说明 |
|------|------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL |
| `MONGO_URI` / `MONGO_DB_NAME` | MongoDB（空库即可，首次保存表单记录时自动建 collection） |

## 新环境（空库）正式部署

在目标库执行（顺序固定）：

1. `2026-09-09-schema-bootstrap.sql` — 全量建表（20 张表，与当前实体对齐）
2. `2026-09-09-seed-rbac.sql` — 内置「系统管理员」角色与权限

然后：

1. 配置 `server/.env` 并启动后端
2. 调用注册接口创建首个账号（建议用户名 `admin`）
3. 若注册时用户名为 `admin`：编辑 `2026-09-09-seed-rbac.sql` 底部注释中的 `user_role` 插入并再执行一次；或在已有系统管理员的前提下于【管理后台 → 角色】赋权

**不要**在新库上再跑下方增量脚本，否则会重复建表或改列失败。

## 已有库升级（从早期版本迁移）

按文件名日期 **从小到大** 执行尚未跑过的脚本。典型顺序：

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | `2026-08-22-admin-organization-rbac.sql` | 用户扩展字段、部门/角色/RBAC；要求库中已有 `user` 表及 `admin` 账号 |
| 2 | `2026-08-22-dictionary.sql` | 应用字典 |
| 3 | `2026-08-24-app-form-fields.sql` | `app_form.fields` |
| 4 | `2026-08-26-app-form-config.sql` | 表单扩展配置表 |
| 5 | `2026-08-28-user-single-department.sql` | 人员仅属一个部门 |
| 6 | `2026-08-31-form-serial-seq.sql` | 流水号序列表 |
| 7 | `2026-09-06-app-permission.sql` | 应用配置者 / 使用范围 |
| 8 | `2026-09-06-workflow-form.sql` | 流程表单与实例、待办 |
| 9 | `2026-09-07-dept-leader.sql` | 部门负责人 |
| 10 | `2026-09-07-workflow-retry-patch.sql` | 流程重试补写字段 |
| 11 | `2026-09-07-workflow-version.sql` | 流程版本表；迁移旧 `draftGraph`/`publishedGraph` 并删列 |
| 12 | `2026-09-11-workflow-process-timeout.sql` | 流程实例 `dueAt`（整单超时截止时间） |

增量脚本里带 `START TRANSACTION` 的，失败会整体回滚；执行前请备份。

## 表清单（bootstrap 后）

`user`、`revoked_token`、`department`、`role`、`user_department`、`user_role`、`role_permission`、`application`、`app_group`、`app_form`、`app_form_config`、`form_serial_seq`、`dictionary`、`dictionary_item`、`app_configurator`、`app_access_scope`、`workflow_definition`、`workflow_version`、`workflow_instance`、`workflow_task`

## 手工测试

测流程、权限、部门负责人、流水号前，若库不是用 bootstrap 建的，请对照 `docs/testcases/README.md`「开始前」与各专项预备说明，确认对应增量脚本已执行。

## 约定

- 新迁移：`YYYY-MM-DD-简短说明.sql`，追加新文件，勿改已上线脚本（除非明确重建库）
- 默认只生成脚本，不代执行；执行前须使用者点名路径并确认目标库
