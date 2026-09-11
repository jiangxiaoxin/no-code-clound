# Flowable 学习示例 SQL（MySQL）

本目录是 `java/flowable-console-demo` 和 `java/flowable-springboot-demo` 两个示例的数据库脚本，
使用**独立库 `flowable_demo`**，与主项目 `no_code_cloud` 无关。

## 脚本

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | `2026-09-09-flowable-demo-create-database.sql` | 建库（utf8mb4） |
| 2 | `2026-09-09-flowable-mysql-create-tables.sql` | Flowable 7.1.0 官方 MySQL 建表 DDL 存档（common + engine + history + identity 四段，从官方 jar 提取；覆盖流程引擎全部表，Boot 版 CMMN/DMN/事件注册表由引擎自动补建） |

## 一定要手动执行吗？

不强制：

- 两个示例的 JDBC URL 都带 `createDatabaseIfNotExist=true`，首次运行自动建库；
- 两个示例都配置了 `databaseSchemaUpdate=true`，首次运行自动补建缺表；
- 本目录脚本的价值是**存档与全新环境手工部署**（生产环境引擎的 schema 管理建议关闭自动更新，用脚本建表）。

## 重建库（想彻底重来时）

```sql
DROP DATABASE IF EXISTS flowable_demo;
```

然后重新执行建库脚本（或直接重跑示例自动重建）。重复运行示例会累积部署记录（ACT_RE_DEPLOYMENT），不影响演示。

## 约定

- 与主项目一致：`YYYY-MM-DD-简短说明.sql`、UTF-8 无 BOM；
- 按项目规则**默认只生成、不执行**：AI 不代跑这些脚本，除非使用者点名路径并确认目标库。
