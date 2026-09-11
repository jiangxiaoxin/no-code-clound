-- Flowable 学习示例专用库（与主项目 no_code_cloud 完全隔离）
-- Flowable 会在这个库里建几十张 ACT_* / FLW_* 表，绝不复用主项目的库。
--
-- 执行方式（二选一）：
--   1. 手动执行（在 java/sql/ 目录下）：mysql -uroot -p < 2026-09-09-flowable-demo-create-database.sql
--   2. 不执行也行：示例的 JDBC URL 带了 createDatabaseIfNotExist=true，首次运行会自动建库
--
-- 建表：引擎首次运行会自动建表（databaseSchemaUpdate=true）；
--       也可先手动执行 2026-09-09-flowable-mysql-create-tables.sql（Flowable 官方 DDL 存档）。
CREATE DATABASE IF NOT EXISTS flowable_demo
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
