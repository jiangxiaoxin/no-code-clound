# Flowable 学习示例设计（java/ 目录）

日期：2026-09-09
状态：设计已确认，待实现

## 1. 目标

在 `java/` 目录下做一套 Flowable 学习示例，目的是**学习 Flowable 引擎本身**：把 BPMN XML 和 Java 代码放在一起，跑通一个有一定复杂度的审批流程，覆盖日常开发会用到的核心技术点。

与主项目的关系：no-code-cloud 的流程引擎是自研状态机（NestJS，`server/src/application/workflow`），设计上明确不引入外部 BPM 引擎。本示例是**独立的学习工程**，不改动 `server/`、`front/` 的任何代码，也不复用主项目的数据库。

## 2. 总体结构

```
java/
├── docs/                             # 本示例的全部文档（设计与运行指南都在这里）
│   ├── 2026-09-09-flowable-example-design.md   （本文）
│   └── flowable-example-run-guide.md           （运行指南，实现阶段产出）
├── sql/                              # 示例专用 SQL（独立小库，不进 server/sql/）
│   ├── README.md
│   ├── 2026-09-09-flowable-demo-create-database.sql
│   └── 2026-09-09-flowable-mysql-create-tables.sql
├── flowable-console-demo/            # 裸引擎版：main 方法一步步跑
│   ├── pom.xml
│   ├── mvnw / mvnw.cmd / .mvn/wrapper/
│   └── src/main/...
└── flowable-springboot-demo/         # Spring Boot 集成版：REST 接口驱动
    ├── pom.xml
    ├── mvnw / mvnw.cmd / .mvn/wrapper/
    └── src/main/...
```

要点：

- 两个 demo 是各自独立的 Maven 工程，互不依赖；各带 Maven Wrapper（`mvnw.cmd`，首次运行自动下载 Maven，本机无需预装）。
- 版本：Flowable **7.1.0**（当前最新稳定版，要求 Java 17，本机 Temurin 17.0.18 已满足）；Spring Boot 用 3.3.x 线；MySQL 驱动 `mysql-connector-j`。
- 两边放**内容完全相同**的两份 BPMN 和同名包路径的委托类/监听器类。这是刻意的重复：每个工程单独可读、可跑，方便对照「裸引擎 API」和「Spring Boot 集成」两种用法。
- 每个工程的 `README.md` 只留一段简介 + 指向 `java/docs/flowable-example-run-guide.md`，详细说明集中在 `java/docs/`。

## 3. 数据库与 SQL 脚本

- 示例使用**独立数据库 `flowable_demo`**，不复用主项目的 `no_code_cloud` 库：Flowable 首次运行要创建约 80 张 `ACT_*` 表，混进主库会污染主库的表清单。
- 连接沿用本机 MySQL：`localhost:3306`，账号 `root`（与 `server/.env` 一致）。
  - Spring Boot 版写在 `application.yml`，密码写成 `${DB_PASSWORD:helloca}` 形式（环境变量优先，默认值方便直接跑）。
  - 控制台版在 Java 代码里同样读环境变量、带相同默认值。
- 引擎建表方式：两个 demo 都设 `databaseSchemaUpdate=true`，首次启动自动补建缺表。
- 按项目 SQL 管理习惯（`YYYY-MM-DD-说明.sql`、UTF-8 无 BOM、默认只生成不执行）把脚本存进 `java/sql/`：
  1. `2026-09-09-flowable-demo-create-database.sql` — `CREATE DATABASE flowable_demo`（含字符集说明）
  2. `2026-09-09-flowable-mysql-create-tables.sql` — Flowable 官方 MySQL 建表脚本（engine / history / identity 三部分），从 Flowable 7.1.0 发布包提取留档
- **执行约定**：建库脚本和建表脚本由使用者手动执行（或首次运行时由引擎自动建表）；AI 不代执行，除非使用者点名脚本路径并确认。

## 4. 流程设计：采购申请审批

两份 BPMN：主流程 `purchase-approval.bpmn20.xml` + 子流程 `large-amount-approval.bpmn20.xml`。

```
开始（businessKey = 采购单号）
 → 【用户任务】提交采购申请（发起人填写金额 amount、事由 reason）
 → 排他网关「金额分支」（UEL 条件表达式）
    ├─ amount < 10000 → 【用户任务】部门主管审批 →──────────────┐
    └─ amount ≥ 10000 → 【调用活动】大额审批子流程：               │
         变量入/出映射（amount、reason 传入；voteResult 传出）      │
         子流程内部：                                            │
           并行网关 → 两路并行：                                 │
             ├─【用户任务】合规审查（候选组 compliance）           │
             └─【服务任务】预算核对（JavaDelegate，class 方式）    │
           并行汇聚 → 【多实例会签】经理投票                      │
             （flowable:collection 按候选人集合逐个生成任务；      │
              完成条件：全部办完；投票结果收进集合变量）           │
         → 子流程结束 ──────────────────────────────────────────┤
 →【用户任务】总监审批（仅大额路径经过；上挂定时边界事件）
 │    定时边界事件：timeDuration = ${timeoutDuration}（变量控制）
 │    超时未批 → 中断当前任务 → 升级为【用户任务】总经理特批
 → 排他网关「审批结果」（approved 布尔变量）
    ├─ 通过 →【服务任务】发送通知（JavaDelegate + 字段注入收件人、模板）→ 结束（通过）
    └─ 驳回 →【服务任务】重置审批结果（表达式方式 execution.setVariable，把 approved 置回 true）
             → 顺序流回流到「提交采购申请」（驳回重填，可再次走全流程）
```

覆盖的技术点：

| 技术点 | 体现位置 |
|---|---|
| 用户任务（领取/办理）、候选组 | 主管审批、合规审查（候选组 compliance） |
| 排他网关 + UEL 条件表达式 | 金额分支、审批结果分支 |
| 并行网关（分支/汇聚） | 子流程内合规 ∥ 预算核对 |
| 调用活动 + 变量入/出映射 | 主流程调用大额审批子流程 |
| 多实例任务（会签）+ 完成条件 + 集合变量 | 经理投票 |
| 定时边界事件 + 作业执行器 | 超时升级；时长来自流程变量（控制台版设 `PT3S` 便于演示，Boot 版默认 `PT24H`） |
| 服务任务 JavaDelegate（class 方式 + 字段注入；`delegateExpression` 与 Spring Bean 的对照写法只在运行指南里说明，不进共享 BPMN，保证两个 demo 的 XML 完全一致且都能跑） | 预算核对（class）、发送通知（字段注入收件人、模板） |
| 执行监听器（start/end/take） | 流程开始结束、网关流转打日志 |
| 任务监听器（create/assignment/complete） | 审批任务各阶段打日志 |
| 流程变量与局部变量传递 | 会签投票结果收集、子流程变量映射 |
| 驳回回流（顺序流回退）+ 表达式服务任务 | 审批结果 → 重置审批结果（execution.setVariable）→ 发起人重填 |
| businessKey、历史查询 | 控制台末尾查流程/活动/任务三级历史（HistoricProcessInstance / HistoricActivityInstance / HistoricTaskInstance） |

## 5. BPMN XML 注释规范

两份 `.bpmn20.xml` 每个关键元素上方加中文 XML 注释，每处说清三件事：

1. 这个节点在业务上干什么（用界面语言，如「经理投票，所有人都办完才往下走」）；
2. 关键属性的含义（如 `flowable:collection`、`flowable:elementVariable`、`flowable:completionCondition`、边界事件的 `timeDuration`）；
3. 和 Java 侧怎么接（引用了哪个委托类/监听器类、读写哪个流程变量）。

XML 注释对引擎解析无影响；文件手工维护，不用建模器回存。

## 6. 两个 demo 的分工

- **flowable-console-demo（裸引擎）**：`main` 方法按教学叙事一步步跑——建引擎、部署、启动、逐步办理任务，每步打印当前任务列表、流程变量、定时任务、历史数据，让人看见引擎每一步在做什么。定时升级用 `PT3S` 演示（或用 job API 手动触发），不用真等 24 小时。
- **flowable-springboot-demo（Spring Boot 集成）**：`flowable-spring-boot-starter` 自动配置 + `src/main/resources/processes/` 下 BPMN 自动部署；REST 接口驱动同一流程：发起申请、查待办、办理任务、查历史。体现生产环境的标准接法。

## 7. 运行指南（java/docs/flowable-example-run-guide.md）

实现阶段产出，内容包括：

1. 准备：确认 MySQL 可连 → 执行 `java/sql/` 两个脚本（或说明引擎会自动建表）；
2. 控制台版：`mvnw.cmd compile exec:java`（或打包后 `java -jar`），配预期控制台输出片段讲解；
3. Boot 版：`mvnw.cmd spring-boot:run`，配 curl/浏览器调用示例和预期返回；
4. 常见问题：表已存在、时区、驱动版本。

## 8. 本期不做

- 不做前端页面、不做 Flowable UI（modeler/admin）；
- 不做消息事件、信号事件、事件网关、补偿、异步子流程（可作下一期）；
- 不接主项目 `no_code_cloud` 的库、不改动 `server/`、`front/`；
- 不写 JUnit 测试工程（学习示例以「跑起来看输出」为验收）。
