# Flowable 学习示例实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `java/` 目录下建一套可运行的 Flowable 学习示例：控制台裸引擎版 + Spring Boot 集成版，共享同一份带中文注释的 BPMN（采购申请审批主流程 + 大额审批子流程），数据库用本机 MySQL 独立库 `flowable_demo`。

**Architecture:** 两个互不依赖的 Maven 工程。控制台版用 `StandaloneProcessEngineConfiguration` 直接建引擎，按教学场景一步步跑；Boot 版用 `flowable-spring-boot-starter` 自动部署 `processes/` 下的 BPMN 并以 REST 驱动。委托类/监听器类两处同包路径重复（`com.example.flowable.demo.*`），保证 BPMN 字节级一致。

**Tech Stack:** Java 17（Temurin 17.0.18）、Flowable 7.1.0、Spring Boot 3.3.4（Flowable 7.1.0 官方对齐版本）、mysql-connector-j 8.4.0、slf4j-simple 2.0.16、Maven Wrapper 3.3.4 + Maven 3.9.9、MySQL `flowable_demo` 库。

**设计文档:** `java/docs/2026-09-09-flowable-example-design.md`

**执行注意事项（按项目规则 AGENTS.md）:**

- **不自动执行 SQL**：`java/sql/` 下的脚本只生成、不执行。示例运行依赖的建库建表由 JDBC URL 的 `createDatabaseIfNotExist=true` 与引擎的 `databaseSchemaUpdate=true` 自动完成（学习者也可手动执行脚本，两不耽误）。
- **不自动提交 git**：所有任务不包含 commit 步骤。全部完成并经使用者验收后，若使用者要求提交，建议用一条中文提交：`java: 新增 Flowable 学习示例（控制台版、Spring Boot 版、SQL 存档与运行指南）`。
- **不使用浏览器工具**：Boot 版验证用 curl，不用浏览器。
- 所有 Java/XML/YML/SQL/MD 文件一律 UTF-8 无 BOM；写完后抽查中文注释是否为正常汉字。

---

## 文件结构总览

```
java/
├── docs/
│   ├── 2026-09-09-flowable-example-design.md        # 已存在
│   ├── 2026-09-09-flowable-example-plan.md          # 本计划
│   └── flowable-example-run-guide.md                # Task 10 产出
├── sql/
│   ├── README.md                                    # Task 1
│   ├── 2026-09-09-flowable-demo-create-database.sql # Task 1
│   └── 2026-09-09-flowable-mysql-create-tables.sql  # Task 2（从官方 jar 提取）
├── .gitignore                                       # Task 1
├── flowable-console-demo/
│   ├── pom.xml                                      # Task 3
│   ├── mvnw / mvnw.cmd / .mvn/wrapper/maven-wrapper.properties  # Task 3
│   ├── README.md                                    # Task 10
│   └── src/main/
│       ├── java/com/example/flowable/demo/
│       │   ├── ConsoleApplication.java              # Task 6
│       │   ├── PrintUtil.java                       # Task 6
│       │   ├── delegate/BudgetCheckDelegate.java    # Task 4
│       │   ├── delegate/NotifyDelegate.java         # Task 4
│       │   ├── listener/ProcessStartEndExecutionListener.java  # Task 4
│       │   ├── listener/GatewayTakeExecutionListener.java      # Task 4
│       │   ├── listener/ApprovalTaskListener.java              # Task 4
│       │   └── listener/VoteCollectTaskListener.java           # Task 4
│       └── resources/processes/
│           ├── purchase-approval.bpmn20.xml         # Task 5
│           └── large-amount-approval.bpmn20.xml     # Task 5
└── flowable-springboot-demo/
    ├── pom.xml                                      # Task 7
    ├── mvnw / mvnw.cmd / .mvn/wrapper/maven-wrapper.properties  # Task 7
    ├── README.md                                    # Task 10
    └── src/main/
        ├── java/com/example/flowable/demo/
        │   ├── BootApplication.java                 # Task 8
        │   ├── ProcessService.java                  # Task 8
        │   ├── ProcessController.java               # Task 8
        │   ├── delegate/（同控制台版，Task 7 复制）    │
        │   └── listener/（同控制台版，Task 7 复制）
        └── resources/
            ├── application.yml                      # Task 7
            └── processes/（同控制台版，Task 7 复制）
```

---

## Task 1: java/ 骨架、建库脚本与 SQL 目录说明

**Files:**
- Create: `java/.gitignore`
- Create: `java/sql/2026-09-09-flowable-demo-create-database.sql`
- Create: `java/sql/README.md`

- [ ] **Step 1.1: 写 `java/.gitignore`**

```gitignore
target/
.idea/
*.iml
.vscode/
logs/
*.log
**/.mvn/wrapper/maven-wrapper.jar
```

（`maven-wrapper.jar` 由 mvnw 首次运行时按 `wrapperUrl` 自动下载，不入库。）

- [ ] **Step 1.2: 写建库脚本 `java/sql/2026-09-09-flowable-demo-create-database.sql`**

```sql
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
```

- [ ] **Step 1.3: 写 `java/sql/README.md`**

```markdown
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
```

- [ ] **Step 1.4: 验证**

Run: `ls java/sql/` 
Expected: 列出 `README.md` 和 `2026-09-09-flowable-demo-create-database.sql`。

---

## Task 2: 提取 Flowable 官方 MySQL 建表脚本存档

**Files:**
- Create: `java/sql/2026-09-09-flowable-mysql-create-tables.sql`

- [ ] **Step 2.1: 下载三个官方 jar 并解出四段 DDL**

（执行中发现：Flowable 7.1.0 的 engine/history/identity 三段只含 21 张表，ACT_GE_BYTEARRAY、ACT_RU_TASK、ACT_RU_VARIABLE、各类 ACT_RU_JOB、ACT_HI_TASKINST 等约 20 张基础表在 flowable-engine-common 的 common.sql 里，engine 段的外键/索引引用它们——缺了它存档脚本在空库上跑不通，故补入并置于最前。）

```bash
mkdir -p /tmp/flowable-ddl && cd /tmp/flowable-ddl
curl -sO https://repo1.maven.org/maven2/org/flowable/flowable-engine-common/7.1.0/flowable-engine-common-7.1.0.jar
curl -sO https://repo1.maven.org/maven2/org/flowable/flowable-engine/7.1.0/flowable-engine-7.1.0.jar
curl -sO https://repo1.maven.org/maven2/org/flowable/flowable-idm-engine/7.1.0/flowable-idm-engine-7.1.0.jar
unzip -o -j flowable-engine-common-7.1.0.jar "org/flowable/common/db/create/flowable.mysql.create.common.sql" -d .
unzip -o -j flowable-engine-7.1.0.jar "org/flowable/db/create/flowable.mysql.create.engine.sql" -d .
unzip -o -j flowable-engine-7.1.0.jar "org/flowable/db/create/flowable.mysql.create.history.sql" -d .
unzip -o -j flowable-idm-engine-7.1.0.jar "org/flowable/idm/db/create/flowable.mysql.create.identity.sql" -d .
ls
```

Expected: 列出 `flowable.mysql.create.common.sql`、`flowable.mysql.create.engine.sql`、`flowable.mysql.create.history.sql`、`flowable.mysql.create.identity.sql` 四个文件。（路径均已验证存在于对应 jar。）

- [ ] **Step 2.2: 拼接成带说明头的存档脚本**

```bash
OUT="C:/D/projects/no-code-cloud/java/sql/2026-09-09-flowable-mysql-create-tables.sql"
{
  echo "-- Flowable 7.1.0 官方 MySQL 建表脚本存档（流程引擎所需四段）"
  echo "-- 来源："
  echo "--   common   ← flowable-engine-common-7.1.0.jar!/org/flowable/common/db/create/flowable.mysql.create.common.sql"
  echo "--   engine   ← flowable-engine-7.1.0.jar!/org/flowable/db/create/flowable.mysql.create.engine.sql"
  echo "--   history  ← flowable-engine-7.1.0.jar!/org/flowable/db/create/flowable.mysql.create.history.sql"
  echo "--   identity ← flowable-idm-engine-7.1.0.jar!/org/flowable/idm/db/create/flowable.mysql.create.identity.sql"
  echo "-- 用法：先建库（2026-09-09-flowable-demo-create-database.sql），再执行本文件（common 段必须在最前，"
  echo "--       engine 段的外键/索引引用它建的表）；或不执行本文件，由示例首次运行自动建表（databaseSchemaUpdate=true）。"
  echo "-- 覆盖范围：流程引擎（process）运行所需的全部表。Spring Boot 版还会用到 CMMN / DMN / 事件注册等"
  echo "--          其它引擎的表，这些未入档，由引擎按 databaseSchemaUpdate=true 自动补建。"
  echo "USE flowable_demo;"
  echo ""
  echo "-- ============ 1/4 公共表（ACT_GE_* / ACT_RU_ 任务·变量·作业·批次等；官方 common 段还含 ACT_HI_ENTITYLINK 等几张公共历史表） ============"
  cat flowable.mysql.create.common.sql
  echo ""
  echo "-- ============ 2/4 流程定义与执行（ACT_RE_* / ACT_RU_EXECUTION / ACT_EVT_LOG 等） ============"
  cat flowable.mysql.create.engine.sql
  echo ""
  echo "-- ============ 3/4 历史表（ACT_HI_*；其余几张公共历史表在 1/4 公共段） ============"
  cat flowable.mysql.create.history.sql
  echo ""
  echo "-- ============ 4/4 身份表（ACT_ID_*） ============"
  cat flowable.mysql.create.identity.sql
} > "$OUT"
```

- [ ] **Step 2.3: 验证存档脚本内容完整**

Run: `grep -ci "CREATE TABLE" "C:/D/projects/no-code-cloud/java/sql/2026-09-09-flowable-mysql-create-tables.sql"`
Expected: 约 40 张（common ≈ 20 + engine 7 + history 5 + identity 9；以实际 grep 计数为准，四段分节标题齐全、与四个源文件逐字一致）。

---

## Task 3: flowable-console-demo 工程骨架（pom + Maven Wrapper）

**Files:**
- Create: `java/flowable-console-demo/pom.xml`
- Create: `java/flowable-console-demo/mvnw`、`mvnw.cmd`、`.mvn/wrapper/maven-wrapper.properties`

- [ ] **Step 3.1: 写 `pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.example</groupId>
  <artifactId>flowable-console-demo</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>

  <properties>
    <maven.compiler.release>17</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <flowable.version>7.1.0</flowable.version>
    <mysql.version>8.4.0</mysql.version>
  </properties>

  <dependencies>
    <!-- Flowable 流程引擎本体（裸引擎用法，不经过 Spring） -->
    <dependency>
      <groupId>org.flowable</groupId>
      <artifactId>flowable-engine</artifactId>
      <version>${flowable.version}</version>
    </dependency>
    <!-- MySQL 驱动（示例库 flowable_demo） -->
    <dependency>
      <groupId>com.mysql</groupId>
      <artifactId>mysql-connector-j</artifactId>
      <version>${mysql.version}</version>
    </dependency>
    <!-- 日志绑定：Flowable 用 SLF4J 打内部日志，给个 simple 绑定输出到控制台（与 Flowable 7.1.0 的 slf4j 2.0.16 对齐） -->
    <dependency>
      <groupId>org.slf4j</groupId>
      <artifactId>slf4j-simple</artifactId>
      <version>2.0.16</version>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <!-- 支持 mvnw exec:java 直接跑主类 -->
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.5.0</version>
        <configuration>
          <mainClass>com.example.flowable.demo.ConsoleApplication</mainClass>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 3.2: 放入 Maven Wrapper**

```bash
cd "C:/D/projects/no-code-cloud/java/flowable-console-demo"
mkdir -p .mvn/wrapper
curl -s -o mvnw https://raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.4/maven-wrapper-distribution/src/resources/mvnw
curl -s -o mvnw.cmd https://raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.4/maven-wrapper-distribution/src/resources/mvnw.cmd
chmod +x mvnw
```

再手写 `.mvn/wrapper/maven-wrapper.properties`（内容如下，两处 URL 已验证可下载）：

```
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip
wrapperUrl=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar
```

- [ ] **Step 3.3: 验证 wrapper 可用**

Run: `cd java/flowable-console-demo && sh mvnw --version`
Expected: 输出 `Apache Maven 3.9.9 ...`（首次运行会先下载 maven-wrapper.jar 和 Maven 发行版，需要等一会；本机已装 Java 17，无需 JAVA_HOME 配置提示）。

- [ ] **Step 3.4: 验证空工程可编译**

Run: `sh mvnw -q compile`
Expected: 无输出、退出码 0（BUILD SUCCESS，此时还没有 Java 源码）。

---

## Task 4: 控制台版委托类与监听器类（6 个）

**Files:**
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/delegate/BudgetCheckDelegate.java`
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/delegate/NotifyDelegate.java`
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/listener/ProcessStartEndExecutionListener.java`
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/listener/GatewayTakeExecutionListener.java`
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/listener/ApprovalTaskListener.java`
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/listener/VoteCollectTaskListener.java`

包名说明：两个 demo 都用 `com.example.flowable.demo` 作为基础包，委托/监听器类在两边字节级相同，这样 BPMN 里写死的 class 全限定名在两个工程里都能解析。

（实现修正记录，已对照 Flowable 7.1.0 实测：① 字段注入接口在 7.1.0 是 `org.flowable.common.engine.api.delegate.Expression`，不是旧文档里的 `org.flowable.engine.delegate.Expression`；② 7.1.0 的 `DelegateTask` 没有 `getExecution()`，`voteResults`/`approved` 直接用 `delegateTask.getVariable/setVariable` 操作——VariableScope 沿父作用域链取值/原地更新，教学语义不变。Task 7 复制共享文件时以工程里的现文件为准。）

（实现修正记录·BPMN：taskListener 改为**一个事件一个 `<flowable:taskListener>` 元素**（create / assignment / complete 各写一条），不把多个事件挤在一个 `event` 属性里——逗号串不能保证按事件注册，逐元素写法在所有 Flowable 版本都可靠，也是官方文档写法。Task 6 运行输出会实际验证三类回调日志。）

（实现修正记录·控制台入口，已对照 7.1.0 运行实测：③ `HistoricProcessInstance` 没有 `getState()`，历史实例状态用 `getEndTime()` 推导；`HistoricTaskInstanceQuery` 没有 `orderByHistoricTaskInstanceCreateTime()`，用 `orderByHistoricTaskInstanceStartTime()`；④ callActivity 的子流程是独立流程实例，子流程任务挂在子实例 id 上，要用 `superProcessInstanceId` 先查到子实例再查任务，按主实例 pid 查会拿到 null（NPE）；⑤ 开异步执行器时，会签任务完成瞬间可能抛 `FlowableOptimisticLockingException`（执行器线程并发推进同一执行），抛异常的命令整体回滚、无副作用，`completeWithRetry` 重试即可；⑥ main 用 try/finally 保证 `engine.close()`，否则 exec:java 会因非守护的执行器线程一直挂着不退出。）

（实现修正记录·Boot 版：ProcessService 沿用上面 ③⑤ 的结论——历史 state 由 `getEndTime()` 推导（7.1.0 无 `getState()`）；待办查询不按 `processDefinitionKey` 过滤，否则主流程 key 查不到属于子流程定义的合规审查/经理投票任务；complete 内置乐观锁重试。）

- [ ] **Step 4.1: 写 `BudgetCheckDelegate.java`（服务任务委托，class 方式，演示读变量/写变量）**

```java
package com.example.flowable.demo.delegate;

import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;

/**
 * 【教学点】class 方式的 JavaDelegate：流程走到「预算核对」服务任务时自动执行。
 * 演示：从流程变量读入参（amount），处理完写一个新变量（budgetNote）。
 */
public class BudgetCheckDelegate implements JavaDelegate {

    @Override
    public void execute(DelegateExecution execution) {
        Object amountObj = execution.getVariable("amount");
        long amount = amountObj instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(amountObj));
        String note = "预算充足（金额 " + amount + " 元，走常规预算科目）";
        execution.setVariable("budgetNote", note);
        System.out.println("【委托】预算核对完成：" + note);
    }
}
```

- [ ] **Step 4.2: 写 `NotifyDelegate.java`（服务任务委托，演示字段注入 Expression）**

```java
package com.example.flowable.demo.delegate;

import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;

/**
 * 【教学点】JavaDelegate 的字段注入：BPMN 里用 <flowable:field> 给 to / template 赋值，
 * to 是表达式（取变量 initiator），template 是常量字符串。
 * 生产上真正发通知；这里只打印，方便观察执行时机。
 */
public class NotifyDelegate implements JavaDelegate {

    private Expression to;
    private Expression template;

    @Override
    public void execute(DelegateExecution execution) {
        String receiver = String.valueOf(to.getValue(execution));
        String tpl = String.valueOf(template.getValue(execution));
        boolean approved = Boolean.TRUE.equals(execution.getVariable("approved"));
        String content = approved ? "您的采购申请已通过" : "您的采购申请被驳回";
        System.out.println("【委托】发送通知：to=" + receiver + "，模板=" + tpl + "，内容=" + content);
    }
}
```

- [ ] **Step 4.3: 写 `ProcessStartEndExecutionListener.java`（流程级执行监听器）**

```java
package com.example.flowable.demo.listener;

import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.ExecutionListener;

/**
 * 【教学点】执行监听器（ExecutionListener），挂在 <process> 上监听 start / end：
 * 流程实例启动、结束时各回调一次。
 */
public class ProcessStartEndExecutionListener implements ExecutionListener {

    @Override
    public void notify(DelegateExecution execution) {
        if (EVENTNAME_START.equals(execution.getEventName())) {
            System.out.println("【监听】流程启动：definition=" + execution.getProcessDefinitionId()
                + "，instance=" + execution.getProcessInstanceId()
                + "，businessKey=" + execution.getProcessInstanceBusinessKey());
        } else if (EVENTNAME_END.equals(execution.getEventName())) {
            System.out.println("【监听】流程结束：instance=" + execution.getProcessInstanceId());
        }
    }
}
```

- [ ] **Step 4.4: 写 `GatewayTakeExecutionListener.java`（连线 take 监听器）**

```java
package com.example.flowable.demo.listener;

import org.flowable.bpmn.model.SequenceFlow;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.ExecutionListener;

/**
 * 【教学点】event="take" 的执行监听器：流程经过某条连线时回调。
 * take 事件里 getCurrentFlowElement() 正是这条 SequenceFlow，能拿到连线名称。
 */
public class GatewayTakeExecutionListener implements ExecutionListener {

    @Override
    public void notify(DelegateExecution execution) {
        if (execution.getCurrentFlowElement() instanceof SequenceFlow flow) {
            System.out.println("【监听】网关流转：经过连线「" + flow.getName() + "」");
        }
    }
}
```

- [ ] **Step 4.5: 写 `ApprovalTaskListener.java`（任务监听器，create/assignment/complete 三事件）**

```java
package com.example.flowable.demo.listener;

import org.flowable.engine.delegate.TaskListener;
import org.flowable.task.service.delegate.DelegateTask;

/**
 * 【教学点】任务监听器（TaskListener）：任务创建、分配、完成三个时机各回调一次。
 * 注意导入的是 engine 的 TaskListener + task-service 的 DelegateTask（Flowable 7 的标准组合）。
 */
public class ApprovalTaskListener implements TaskListener {

    @Override
    public void notify(DelegateTask delegateTask) {
        switch (delegateTask.getEventName()) {
            case EVENTNAME_CREATE ->
                System.out.println("【监听】任务创建：" + delegateTask.getName() + "（id=" + delegateTask.getId() + "）");
            case EVENTNAME_ASSIGNMENT ->
                System.out.println("【监听】任务分配：「" + delegateTask.getName() + "」 → " + delegateTask.getAssignee());
            case EVENTNAME_COMPLETE ->
                System.out.println("【监听】任务完成：「" + delegateTask.getName() + "」，approved=" + delegateTask.getVariable("approved"));
            default ->
                System.out.println("【监听】任务事件：" + delegateTask.getEventName());
        }
    }
}
```

- [ ] **Step 4.6: 写 `VoteCollectTaskListener.java`（会签投票收集，任务监听器）**

```java
package com.example.flowable.demo.listener;

import java.util.List;

import org.flowable.engine.delegate.TaskListener;
import org.flowable.task.service.delegate.DelegateTask;

/**
 * 【教学点】多实例（会签）任务的投票收集：
 * 每份投票任务完成时带变量 voteApproved（true 同意 / false 否决），
 * 本监听器把每一票记进流程变量 voteResults（List<String>）；
 * 任何人否决就把传入的 approved 改成 false（approved 经调用活动 flowable:in 传入子流程，
 * 在父作用域已存在，这里 setVariable 会原地更新到子流程根作用域；
 * 子流程结束后经 flowable:out 把 approved、voteResults 传回主流程）。
 */
public class VoteCollectTaskListener implements TaskListener {

    @Override
    @SuppressWarnings("unchecked")
    public void notify(DelegateTask delegateTask) {
        boolean approved = Boolean.TRUE.equals(delegateTask.getVariable("voteApproved"));
        String voter = String.valueOf(delegateTask.getVariable("voter"));
        List<String> results = (List<String>) delegateTask.getVariable("voteResults");
        results.add(voter + (approved ? "：同意" : "：否决"));
        delegateTask.setVariable("voteResults", results);
        if (approved) {
            System.out.println("【监听】会签投票：" + voter + " 同意");
        } else {
            delegateTask.setVariable("approved", false);
            System.out.println("【监听】会签投票：" + voter + " 否决，标记 approved=false");
        }
    }
}
```

- [ ] **Step 4.7: 验证编译**

Run: `cd java/flowable-console-demo && sh mvnw -q compile`
Expected: 退出码 0（BUILD SUCCESS）。若报 `TaskListener` 的 EVENTNAME_* 常量找不到，说明导入了错误包——必须用 `org.flowable.engine.delegate.TaskListener`。

---

## Task 5: 两份 BPMN（完整中文注释）

**Files:**
- Create: `java/flowable-console-demo/src/main/resources/processes/purchase-approval.bpmn20.xml`
- Create: `java/flowable-console-demo/src/main/resources/processes/large-amount-approval.bpmn20.xml`

- [ ] **Step 5.1: 写主流程 `purchase-approval.bpmn20.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!--
  采购申请审批主流程（processKey = purchaseApproval）
  与 large-amount-approval.bpmn20.xml 配合使用：
    - 金额 <  10000：部门主管审批后直接出结果
    - 金额 >= 10000：先调「大额审批子流程」（合规 ∥ 预算 + 经理会签），回来后总监审批（带超时升级）
  每个元素上方的中文注释说明三件事：业务含义 / 关键属性含义 / 与 Java 代码怎么接。
-->
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="http://example.flowable.demo/purchase">

  <!-- process：流程定义根节点，id 即部署后的 processKey（startProcessInstanceByKey 用它启动）。
       executionListener(start/end)：流程实例启动、结束时回调 Java 类 → listener/ProcessStartEndExecutionListener -->
  <process id="purchaseApproval" name="采购申请审批" isExecutable="true">
    <extensionElements>
      <flowable:executionListener event="start" class="com.example.flowable.demo.listener.ProcessStartEndExecutionListener"/>
      <flowable:executionListener event="end" class="com.example.flowable.demo.listener.ProcessStartEndExecutionListener"/>
    </extensionElements>

    <!-- 开始节点：流程从这里进入第一个任务 -->
    <startEvent id="start" name="开始"/>

    <!-- 提交采购申请：发起人填写。
         assignee=${initiator}：办理人取流程变量 initiator（启动时传入发起人姓名）。
         本任务完成时提交变量：amount（金额）、reason（事由）；
         驳回重填回到这里时，前置的「重置审批结果」服务任务已把 approved 重置为 true -->
    <userTask id="submitApplication" name="提交采购申请" flowable:assignee="${initiator}"/>

    <sequenceFlow id="flow1" sourceRef="start" targetRef="submitApplication"/>

    <!-- 排他网关「金额分支」：按条件只走一条 outgoing 连线。
         两条连线都带 conditionExpression（UEL 表达式），且必须覆盖所有取值，否则报 no outgoing sequence flow -->
    <exclusiveGateway id="amountGateway" name="金额分支"/>

    <sequenceFlow id="flow2" sourceRef="submitApplication" targetRef="amountGateway"/>

    <!-- 小额分支：amount < 10000。注意 XML 里 < 必须写成 &lt; -->
    <sequenceFlow id="flowSmall" name="小额" sourceRef="amountGateway" targetRef="supervisorApproval">
      <conditionExpression xsi:type="tFormalExpression">${amount &lt; 10000}</conditionExpression>
    </sequenceFlow>

    <!-- 大额分支：amount >= 10000。
         executionListener(event=take)：流程经过这条连线时回调 → listener/GatewayTakeExecutionListener -->
    <sequenceFlow id="flowBig" name="大额" sourceRef="amountGateway" targetRef="callLargeAmount">
      <extensionElements>
        <flowable:executionListener event="take" class="com.example.flowable.demo.listener.GatewayTakeExecutionListener"/>
      </extensionElements>
      <conditionExpression xsi:type="tFormalExpression">${amount &gt;= 10000}</conditionExpression>
    </sequenceFlow>

    <!-- 部门主管审批：固定办理人（演示写死；生产应改成变量或候选组）。
         taskListener：任务创建（create）、分配（assignment）、完成（complete）三时机回调 → listener/ApprovalTaskListener。
         一个事件写一个 <flowable:taskListener> 元素（官方文档和建模器都是这种写法，兼容所有版本）；
         不要把多个事件挤在一个 event 属性里。
         完成时提交变量：approved（true 通过 / false 驳回） -->
    <userTask id="supervisorApproval" name="部门主管审批" flowable:assignee="王主管">
      <extensionElements>
        <flowable:taskListener event="create" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
        <flowable:taskListener event="assignment" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
        <flowable:taskListener event="complete" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
      </extensionElements>
    </userTask>

    <sequenceFlow id="flow3" sourceRef="supervisorApproval" targetRef="resultGateway"/>

    <!-- 调用活动：启动另一个流程定义（calledElement = 子流程的 process id）。
         关键教学点：子流程变量作用域不跨调用活动边界——子流程里查不到主流程变量，
         所以子流程需要用到的变量必须逐个 flowable:in 传进去。
         这里传 6 个：amount/reason/initiator 是业务数据；
         managerList 是子流程会签的候选人集合（flowable:collection 要用）；
         voteResults 是会签投票结果列表（会签任务监听器里 append，必须先传入存在）；
         approved 主流程启动时已是 true，传入后子流程里才可能被否决改写。
         flowable:out：子流程结束后把子流程变量复制回主流程。
         会签若有人否决会把子流程里的 approved 改成 false，经 out 传回主流程；
         voteResults 同样传回，场景末尾的变量快照里能看到投票结果（每票明细由监听器实时打印）。
         注意：驳回回环只重置 approved，不重置 voteResults——否决后重填再走大额时，旧投票记录会留在列表里 -->
    <callActivity id="callLargeAmount" name="大额审批子流程" calledElement="largeAmountApproval">
      <extensionElements>
        <flowable:in source="amount" target="amount"/>
        <flowable:in source="reason" target="reason"/>
        <flowable:in source="initiator" target="initiator"/>
        <flowable:in source="managerList" target="managerList"/>
        <flowable:in source="voteResults" target="voteResults"/>
        <flowable:in source="approved" target="approved"/>
        <flowable:out source="approved" target="approved"/>
        <flowable:out source="voteResults" target="voteResults"/>
      </extensionElements>
    </callActivity>

    <!-- 总监审批：只在大额路径经过。完成时提交变量 approved -->
    <userTask id="directorApproval" name="总监审批" flowable:assignee="李总监">
      <extensionElements>
        <flowable:taskListener event="create" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
        <flowable:taskListener event="assignment" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
        <flowable:taskListener event="complete" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
      </extensionElements>
    </userTask>

    <sequenceFlow id="flow4" sourceRef="callLargeAmount" targetRef="directorApproval"/>

    <!-- 定时边界事件：挂在「总监审批」任务上。
         timeDuration=${timeoutDuration}：超时时长取流程变量（ISO-8601 时长，如 PT24H、PT3S）；
         cancelActivity=true：超时触发时中断总监审批任务（任务被删除），流程改走边界事件的 outgoing 连线。
         定时器依赖异步执行器：控制台版 setAsyncExecutorActivate(true)，Boot 版 flowable.async-executor-activate: true -->
    <boundaryEvent id="directorTimeout" name="审批超时" attachedToRef="directorApproval" cancelActivity="true">
      <timerEventDefinition>
        <timeDuration>${timeoutDuration}</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>

    <sequenceFlow id="flow5" sourceRef="directorTimeout" targetRef="ceoApproval"/>

    <!-- 总经理特批：超时升级后的兜底审批。完成时提交变量 approved -->
    <userTask id="ceoApproval" name="总经理特批" flowable:assignee="赵总经理">
      <extensionElements>
        <flowable:taskListener event="create" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
        <flowable:taskListener event="assignment" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
        <flowable:taskListener event="complete" class="com.example.flowable.demo.listener.ApprovalTaskListener"/>
      </extensionElements>
    </userTask>

    <sequenceFlow id="flow6" sourceRef="directorApproval" targetRef="resultGateway"/>
    <sequenceFlow id="flow7" sourceRef="ceoApproval" targetRef="resultGateway"/>

    <!-- 排他网关「审批结果」：approved=true 走「通过」，否则走「驳回」。
         approved 在流程启动时默认 true，任一环节否决会被改成 false -->
    <exclusiveGateway id="resultGateway" name="审批结果"/>

    <!-- 通过分支：take 监听器演示网关流转日志 -->
    <sequenceFlow id="flow8" name="通过" sourceRef="resultGateway" targetRef="notifyResult">
      <extensionElements>
        <flowable:executionListener event="take" class="com.example.flowable.demo.listener.GatewayTakeExecutionListener"/>
      </extensionElements>
      <conditionExpression xsi:type="tFormalExpression">${approved == true}</conditionExpression>
    </sequenceFlow>

    <!-- 驳回分支：先经过「重置审批结果」把 approved 置回 true，再回到发起人重填（BPMN 允许回环） -->
    <sequenceFlow id="flow9" name="驳回" sourceRef="resultGateway" targetRef="resetApproved">
      <conditionExpression xsi:type="tFormalExpression">${approved == false}</conditionExpression>
    </sequenceFlow>

    <!-- 表达式服务任务：不写 Java 类，直接用 UEL 调 execution.setVariable('approved', true)，
         保证发起人重新提交后能重新走完整审批链 -->
    <serviceTask id="resetApproved" name="重置审批结果" flowable:expression="${execution.setVariable('approved', true)}"/>

    <sequenceFlow id="flow10" sourceRef="resetApproved" targetRef="submitApplication"/>

    <!-- 服务任务「发送通知」：class 方式 JavaDelegate → delegate/NotifyDelegate。
         flowable:field 字段注入：to 是表达式（${initiator}），template 是常量字符串。
         与 Spring 版 delegateExpression（注入 Spring Bean）写法的对照见运行指南 -->
    <serviceTask id="notifyResult" name="发送通知" flowable:class="com.example.flowable.demo.delegate.NotifyDelegate">
      <extensionElements>
        <flowable:field name="to">
          <flowable:expression>${initiator}</flowable:expression>
        </flowable:field>
        <flowable:field name="template">
          <flowable:string>采购审批结果通知</flowable:string>
        </flowable:field>
      </extensionElements>
    </serviceTask>

    <sequenceFlow id="flow11" sourceRef="notifyResult" targetRef="endApproved"/>

    <!-- 结束（通过）：流程实例到此结束 -->
    <endEvent id="endApproved" name="结束（通过）"/>
  </process>
</definitions>
```

- [ ] **Step 5.2: 写子流程 `large-amount-approval.bpmn20.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!--
  大额审批子流程（processKey = largeAmountApproval）
  由主流程的「调用活动」启动：amount / reason / initiator / managerList / voteResults / approved
  通过 flowable:in 传入（子流程查不到主流程变量；少传的变量取到 null，到用到它的地方才会报错），
  结束后 approved、voteResults 通过 flowable:out 传回主流程。
-->
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="http://example.flowable.demo/purchase">

  <process id="largeAmountApproval" name="大额审批子流程" isExecutable="true">

    <!-- 子流程开始：变量已由调用活动传入 -->
    <startEvent id="subStart" name="开始"/>

    <sequenceFlow id="subFlow1" sourceRef="subStart" targetRef="parallelSplit"/>

    <!-- 并行网关（分支）：两条 outgoing 连线同时走。
         与排他网关的区别：并行网关不看条件、不写 conditionExpression，两路都走 -->
    <parallelGateway id="parallelSplit" name="并行分支"/>

    <sequenceFlow id="subFlow2" sourceRef="parallelSplit" targetRef="complianceReview"/>
    <sequenceFlow id="subFlow3" sourceRef="parallelSplit" targetRef="budgetCheck"/>

    <!-- 合规审查：候选组任务。
         candidateGroups=compliance：不指定具体人，组内任何人都可先认领（claim）再办理；
         查询用 taskService.createTaskQuery().taskCandidateGroup("compliance")。
         与 assignee 的区别：assignee 是指定到人，candidateGroups 是放到组里等人认领 -->
    <userTask id="complianceReview" name="合规审查" flowable:candidateGroups="compliance"/>

    <!-- 预算核对：服务任务，class 方式 JavaDelegate → delegate/BudgetCheckDelegate。
         到达该节点自动执行（不需要人办理），执行时把 budgetNote 写回流程变量 -->
    <serviceTask id="budgetCheck" name="预算核对" flowable:class="com.example.flowable.demo.delegate.BudgetCheckDelegate"/>

    <sequenceFlow id="subFlow4" sourceRef="complianceReview" targetRef="parallelJoin"/>
    <sequenceFlow id="subFlow5" sourceRef="budgetCheck" targetRef="parallelJoin"/>

    <!-- 并行网关（汇聚）：两条 incoming 连线都到达后才放行（等待，不产生任务） -->
    <parallelGateway id="parallelJoin" name="并行汇聚"/>

    <sequenceFlow id="subFlow6" sourceRef="parallelJoin" targetRef="managerVote"/>

    <!-- 经理会签：多实例任务（multiInstanceLoopCharacteristics）。
         isSequential=false：并行，按名单同时生成多份任务；
         flowable:collection=managerList：名单来自流程变量 managerList（List<String>，经调用活动 flowable:in 传入）；
         flowable:elementVariable=voter：每份任务把当前名单元素存为局部变量 voter，assignee=${voter} 逐份分配；
         completionCondition：所有实例都办完才整体完成（nrOfInstances / nrOfCompletedInstances 是引擎内置计数变量）。
         每份任务完成时提交变量 voteApproved（true 同意 / false 否决），
         完成时机回调 → listener/VoteCollectTaskListener：否决会把 approved 改成 false -->
    <userTask id="managerVote" name="经理投票" flowable:assignee="${voter}">
      <extensionElements>
        <flowable:taskListener event="complete" class="com.example.flowable.demo.listener.VoteCollectTaskListener"/>
      </extensionElements>
      <multiInstanceLoopCharacteristics isSequential="false"
          flowable:collection="managerList" flowable:elementVariable="voter">
        <completionCondition>${nrOfCompletedInstances == nrOfInstances}</completionCondition>
      </multiInstanceLoopCharacteristics>
    </userTask>

    <sequenceFlow id="subFlow7" sourceRef="managerVote" targetRef="subEnd"/>

    <!-- 子流程结束：回到主流程调用活动，approved 由 flowable:out 传回 -->
    <endEvent id="subEnd" name="结束"/>
  </process>
</definitions>
```

- [ ] **Step 5.3: 验证资源参与构建**

Run: `cd java/flowable-console-demo && sh mvnw -q compile && ls target/classes/processes/`
Expected: 列出两份 `.bpmn20.xml`（真正的 XML 校验发生在 Task 6 部署时，引擎解析失败会直接报错）。

---

## Task 6: 控制台版教学入口（ConsoleApplication + PrintUtil）并运行验证

**Files:**
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/PrintUtil.java`
- Create: `java/flowable-console-demo/src/main/java/com/example/flowable/demo/ConsoleApplication.java`

- [ ] **Step 6.1: 写 `PrintUtil.java`**

```java
package com.example.flowable.demo;

import java.util.List;

import org.flowable.engine.HistoryService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;

/** 演示辅助：把引擎查询结果打印成人能直接读的几行。 */
public final class PrintUtil {

    private PrintUtil() {
    }

    public static void banner(String title) {
        System.out.println();
        System.out.println("================================================== " + title);
    }

    public static void tasks(String label, List<Task> tasks) {
        System.out.println("-- " + label + "（" + tasks.size() + " 条）");
        for (Task t : tasks) {
            System.out.println("   任务 id=" + t.getId() + "，name=" + t.getName()
                + "，assignee=" + t.getAssignee()
                + "，instance=" + t.getProcessInstanceId());
        }
    }

    /** 教学点：实例一结束，ACT_RU_* 运行时数据（含变量）就被清掉了，
     *  所以最终变量快照要从历史表 ACT_HI_VARINST 读，而不是 runtimeService。 */
    public static void variables(HistoryService historyService, String processInstanceId) {
        List<HistoricVariableInstance> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .orderByVariableName().asc()
            .list();
        System.out.println("-- 流程变量（最终快照，来自历史表，" + vars.size() + " 个）");
        for (HistoricVariableInstance v : vars) {
            System.out.println("   " + v.getVariableName() + " = " + describe(v.getValue()));
        }
    }

    private static String describe(Object v) {
        if (v instanceof List<?> list) {
            return list.toString();
        }
        return String.valueOf(v);
    }

    /** 三级历史查询教学点：流程实例 → 活动轨迹 → 任务清单。 */
    public static void history(HistoryService historyService, String processInstanceId) {
        HistoricProcessInstance pi = historyService.createHistoricProcessInstanceQuery()
            .processInstanceId(processInstanceId).singleResult();
        System.out.println("-- 历史·流程实例：" + (pi.getEndTime() == null ? "未结束" : "已结束")
            + "，开始=" + pi.getStartTime()
            + (pi.getEndTime() == null ? "" : "，结束=" + pi.getEndTime() + "，耗时 " + pi.getDurationInMillis() + " ms"));

        System.out.println("-- 历史·活动轨迹（按时间升序）");
        for (HistoricActivityInstance a : historyService.createHistoricActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .orderByHistoricActivityInstanceStartTime().asc().list()) {
            System.out.println("   [" + a.getActivityType() + "] " + a.getActivityName()
                + (a.getEndTime() == null ? "（进行中）" : "（耗时 " + a.getDurationInMillis() + " ms）"));
        }

        System.out.println("-- 历史·任务清单");
        for (HistoricTaskInstance t : historyService.createHistoricTaskInstanceQuery()
                .processInstanceId(processInstanceId)
                .orderByHistoricTaskInstanceStartTime().asc().list()) {
            System.out.println("   " + t.getName() + "，办理人=" + t.getAssignee()
                + (t.getEndTime() == null ? "（未办理）" : "（已办）"));
        }
    }
}
```

- [ ] **Step 6.2: 写 `ConsoleApplication.java`**

```java
package com.example.flowable.demo;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.flowable.common.engine.api.FlowableOptimisticLockingException;
import org.flowable.engine.ProcessEngine;
import org.flowable.engine.ProcessEngineConfiguration;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.impl.cfg.StandaloneProcessEngineConfiguration;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.task.api.Task;

/**
 * 控制台版教学入口：依次跑 3 个场景，每一步都打印引擎里的真实状态。
 * 场景一：小额采购，主管直接批准（顺带演示三级历史查询）
 * 场景二：大额采购，会签全通过，总监 3 秒不批触发定时边界事件升级总经理特批
 * 场景三：小额采购，主管驳回 → 回到发起人重填 → 再次提交后批准
 */
public class ConsoleApplication {

    public static void main(String[] args) {
        String host = env("DB_HOST", "localhost");
        String port = env("DB_PORT", "3306");
        String user = env("DB_USER", "root");
        String password = env("DB_PASSWORD", "helloca");

        ProcessEngineConfiguration cfg = new StandaloneProcessEngineConfiguration()
            .setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/flowable_demo"
                + "?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai"
                + "&useSSL=false&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true")
            .setJdbcUsername(user)
            .setJdbcPassword(password)
            .setJdbcDriver("com.mysql.cj.jdbc.Driver")
            // 库表缺失时自动创建（学习示例方便；生产应关闭，用 java/sql/ 脚本建表）
            .setDatabaseSchemaUpdate(ProcessEngineConfiguration.DB_SCHEMA_UPDATE_TRUE)
            // 打开异步执行器，定时边界事件（超时升级）才会真正触发
            .setAsyncExecutorActivate(true);

        ProcessEngine engine = cfg.buildProcessEngine();
        System.out.println("【引擎】Flowable 启动完成：" + engine.getName());

        RepositoryService repositoryService = engine.getRepositoryService();
        RuntimeService runtimeService = engine.getRuntimeService();
        TaskService taskService = engine.getTaskService();

        // 每次运行都会新增一条部署记录；想彻底重来：DROP DATABASE flowable_demo 后重跑
        repositoryService.createDeployment()
            .name("采购申请审批演示")
            .addClasspathResource("processes/purchase-approval.bpmn20.xml")
            .addClasspathResource("processes/large-amount-approval.bpmn20.xml")
            .deploy();
        System.out.println("【引擎】BPMN 部署完成，当前最新版本流程定义：");
        for (ProcessDefinition pd : repositoryService.createProcessDefinitionQuery().latestVersion().list()) {
            System.out.println("   " + pd.getKey() + " v" + pd.getVersion() + "（" + pd.getName() + "）");
        }

        try {
            scenario1DirectApproval(engine);
            scenario2LargeAmountTimeoutEscalation(engine);
            scenario3RejectAndResubmit(engine);
        } catch (Throwable t) {
            // 演示入口不静默吞错：把异常原样打出来，便于对照引擎状态排查
            System.out.println("【异常】场景执行失败：" + t);
            t.printStackTrace();
            throw t;
        } finally {
            // 关引擎会停掉非守护的异步执行器线程，进程才能正常退出
            engine.close();
        }

        System.out.println();
        System.out.println("【引擎】三个场景演示完毕。");
    }

    /** 场景一：amount=3000 → 小额分支 → 主管批 → 发送通知 → 结束；末尾演示三级历史查询。 */
    private static void scenario1DirectApproval(ProcessEngine engine) {
        RuntimeService runtimeService = engine.getRuntimeService();
        TaskService taskService = engine.getTaskService();

        PrintUtil.banner("场景一：小额采购（3000 元）——主管直接批准");

        var instance = runtimeService.startProcessInstanceByKey(
            "purchaseApproval", "CG-20260909-0001", baseVars("张三", 3000, "采购打印机一台"));
        String pid = instance.getId();
        System.out.println("【发起】instance=" + pid + "，businessKey=CG-20260909-0001");

        completeSubmit(taskService, pid);

        Task supervisor = taskService.createTaskQuery().processInstanceId(pid).singleResult();
        PrintUtil.tasks("当前待办（应只有部门主管审批）", List.of(supervisor));
        taskService.complete(supervisor.getId(), Map.of("approved", true));
        System.out.println("【办理】王主管批准");

        assertEnded(engine, pid);
        PrintUtil.variables(engine.getHistoryService(), pid);
        PrintUtil.history(engine.getHistoryService(), pid);
    }

    /** 场景二：amount=80000 → 大额分支 → 子流程（合规 ∥ 预算 → 会签全同意）→ 总监 3 秒不批 → 总经理特批。 */
    private static void scenario2LargeAmountTimeoutEscalation(ProcessEngine engine) {
        RuntimeService runtimeService = engine.getRuntimeService();
        TaskService taskService = engine.getTaskService();

        PrintUtil.banner("场景二：大额采购（80000 元）——会签通过，总监超时升级总经理特批");

        Map<String, Object> vars = baseVars("张三", 80000, "采购 8 台服务器");
        vars.put("timeoutDuration", "PT3S"); // 演示用 3 秒超时；生产上通常是 PT24H
        var instance = runtimeService.startProcessInstanceByKey("purchaseApproval", "CG-20260909-0002", vars);
        String pid = instance.getId();
        System.out.println("【发起】instance=" + pid + "，businessKey=CG-20260909-0002");

        completeSubmit(taskService, pid);

        // 大额路径 → 调用活动启动子流程 → 并行两路。
        // 教学点：callActivity 的子流程是独立流程实例，任务挂在子实例 id 上，
        // 用主实例 pid 查不到子流程任务，要先用 superProcessInstanceId 找到子实例
        var subInstance = runtimeService.createProcessInstanceQuery()
            .superProcessInstanceId(pid).singleResult();
        String subPid = subInstance.getId();
        System.out.println("【子流程】子流程实例 id=" + subPid + "（独立于主流程 " + pid + "）");
        Task compliance = taskService.createTaskQuery()
            .processInstanceId(subPid).taskCandidateGroup("compliance").singleResult();
        PrintUtil.tasks("子流程·合规审查（候选组任务，需先认领）", List.of(compliance));
        taskService.claim(compliance.getId(), "合规员小周");
        System.out.println("【办理】合规员小周认领并完成合规审查");
        taskService.complete(compliance.getId());

        // 预算核对是服务任务，BudgetCheckDelegate 已自动执行；并行汇聚后会签任务应成对出现
        List<Task> votes = waitTasks(taskService, subPid, "经理投票", 2);
        PrintUtil.tasks("会签任务（按 managerList=[钱经理, 孙经理] 各生成一份）", votes);
        for (Task vote : votes) {
            // 开异步执行器时，会签完成瞬间可能撞上执行器线程并发推进同一执行，
            // 乐观锁冲突的命令会整体回滚，重放是安全的（见 completeWithRetry）
            completeWithRetry(taskService, vote.getId(), Map.of("voteApproved", true));
        }
        System.out.println("【办理】两位经理都投了同意票（观察上方监听器打印的 voteResults）");

        // 会签通过 → 回到主流程 → 总监审批；故意不批，等定时边界事件触发升级。
        // 注意：3 秒的定时任务要等作业执行器的捡起线程处理（默认约 10 秒一轮），升级任务可能延迟到 10 秒左右才出现
        System.out.println("【等待】故意不批总监任务，等定时边界事件触发（作业执行器默认约 10 秒捡起一次，稍等）…");
        Task ceo = waitTask(taskService, pid, "总经理特批", 120);
        PrintUtil.tasks("超时升级后出现总经理特批", List.of(ceo));
        taskService.complete(ceo.getId(), Map.of("approved", true));
        System.out.println("【办理】赵总经理特批通过");

        assertEnded(engine, pid);
        PrintUtil.variables(engine.getHistoryService(), pid);
    }

    /** 场景三：amount=2000 → 主管驳回 → 重置 approved → 回到发起人重填 → 再提交 → 主管批准。 */
    private static void scenario3RejectAndResubmit(ProcessEngine engine) {
        RuntimeService runtimeService = engine.getRuntimeService();
        TaskService taskService = engine.getTaskService();

        PrintUtil.banner("场景三：小额采购（2000 元）——主管驳回，发起人重填后再批准");

        var instance = runtimeService.startProcessInstanceByKey(
            "purchaseApproval", "CG-20260909-0003", baseVars("李四", 2000, "采购墨盒"));
        String pid = instance.getId();
        System.out.println("【发起】instance=" + pid + "，businessKey=CG-20260909-0003");

        completeSubmit(taskService, pid);

        Task supervisor = taskService.createTaskQuery().processInstanceId(pid).singleResult();
        taskService.complete(supervisor.getId(), Map.of("approved", false));
        System.out.println("【办理】王主管驳回（approved=false）");

        Task resubmit = waitTask(taskService, pid, "提交采购申请", 10);
        PrintUtil.tasks("驳回后回到发起人（重置审批结果服务任务已把 approved 置回 true）", List.of(resubmit));
        taskService.complete(resubmit.getId(), Map.of("amount", 2000, "reason", "采购墨盒（重新提交）"));
        System.out.println("【办理】李四重新提交");

        Task supervisor2 = waitTask(taskService, pid, "部门主管审批", 10);
        taskService.complete(supervisor2.getId(), Map.of("approved", true));
        System.out.println("【办理】王主管第二次批准");

        assertEnded(engine, pid);
        PrintUtil.variables(engine.getHistoryService(), pid);
    }

    /** 启动流程用的公共变量：approved 默认 true（任一环节否决会被监听器/办理改成 false）。 */
    private static Map<String, Object> baseVars(String initiator, long amount, String reason) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", initiator);
        vars.put("amount", amount);
        vars.put("reason", reason);
        vars.put("approved", true);
        vars.put("managerList", Arrays.asList("钱经理", "孙经理")); // 会签名单
        vars.put("voteResults", new ArrayList<String>());           // 会签结果收集
        return vars;
    }

    private static void completeSubmit(TaskService taskService, String pid) {
        Task submit = taskService.createTaskQuery()
            .processInstanceId(pid).taskName("提交采购申请").singleResult();
        taskService.complete(submit.getId(), Map.of());
        System.out.println("【办理】发起人完成「提交采购申请」");
    }

    /** 办理任务，撞上乐观锁冲突就重试：抛异常的命令会整体回滚，重放是安全的。 */
    private static void completeWithRetry(TaskService taskService, String taskId, Map<String, Object> vars) {
        for (int attempt = 1; ; attempt++) {
            try {
                taskService.complete(taskId, vars);
                return;
            } catch (FlowableOptimisticLockingException e) {
                if (attempt >= 3) {
                    throw e;
                }
                System.out.println("【重试】办理撞上乐观锁冲突（事务已回滚，无副作用），第 " + attempt + " 次重试…");
                sleep(250);
            }
        }
    }

    private static void assertEnded(ProcessEngine engine, String pid) {
        var pi = engine.getRuntimeService().createProcessInstanceQuery()
            .processInstanceId(pid).singleResult();
        System.out.println(pi == null ? "【流程】已结束" : "【流程】仍在进行（异常，需排查）");
    }

    /** 轮询等待出现指定数量的同名任务（并行/多实例节点可能需要一小会）。 */
    private static List<Task> waitTasks(TaskService taskService, String pid, String taskName, int expected) {
        List<Task> tasks = List.of();
        for (int i = 0; i < 40; i++) {
            tasks = taskService.createTaskQuery().processInstanceId(pid).taskName(taskName).list();
            if (tasks.size() >= expected) {
                return tasks;
            }
            sleep(250);
        }
        throw new IllegalStateException("等待任务超时：" + taskName + "，期望 " + expected + " 份，实际 " + tasks.size());
    }

    /** 轮询等待出现 1 个同名任务（如定时边界事件触发后的升级任务）。 */
    private static Task waitTask(TaskService taskService, String pid, String taskName, int maxTries) {
        for (int i = 0; i < maxTries; i++) {
            Task task = taskService.createTaskQuery().processInstanceId(pid).taskName(taskName).singleResult();
            if (task != null) {
                return task;
            }
            sleep(250);
        }
        throw new IllegalStateException("等待任务超时：" + taskName);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private static String env(String key, String defaultValue) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
```

- [ ] **Step 6.3: 编译**

Run: `cd java/flowable-console-demo && sh mvnw -q compile`
Expected: 退出码 0（BUILD SUCCESS）。

- [ ] **Step 6.4: 运行并核对输出**

Run: `sh mvnw -q exec:java`
Expected（关键行，按出现顺序）：
1. `【引擎】Flowable 启动完成`（首次运行会自动建库建表，之前有一段 MySQL 建表日志）；
2. `【引擎】BPMN 部署完成`，列出 `purchaseApproval` 与 `largeAmountApproval` 两个定义；
3. 场景一：`流程启动` 监听 → `任务创建：部门主管审批`（含 assignment）→ `网关流转：经过连线「通过」` → `发送通知：to=张三` → `流程结束`，末尾 `历史·流程实例` 显示 `已结束…耗时 …ms`，`历史·活动轨迹` 能看到从开始到结束的完整轨迹；
4. 场景二：打印 `【子流程】子流程实例 id=…（独立于主流程 …）` → `网关流转：经过连线「大额」` → `【委托】预算核对完成：预算充足…` → 两条 `会签投票：钱经理 同意`/`孙经理 同意`（期间可能打印一条 `【重试】办理撞上乐观锁冲突…`，属正常，重试成功即可）→ 等待后出现 `总经理特批`（总监任务被定时事件中断）→ 特批通过后结束；
5. 场景三：主管驳回 → `提交采购申请` 任务重新出现 → 重填后 → 主管再批 → 结束；
6. 全程无 `IllegalStateException`，进程正常退出。

若部署报 `XML validation` 或解析错误：优先检查 BPMN 里 `<` 是否写成 `&lt;`、class 全限定名与 Task 4 的包名是否一致。

---

## Task 7: flowable-springboot-demo 工程骨架（pom + wrapper + 复制共享文件 + application.yml）

**Files:**
- Create: `java/flowable-springboot-demo/pom.xml`
- Create: `java/flowable-springboot-demo/mvnw`、`mvnw.cmd`、`.mvn/wrapper/maven-wrapper.properties`
- Create: `java/flowable-springboot-demo/src/main/resources/application.yml`
- Copy（字节级相同，8 个文件，源=控制台版）: 
  - `src/main/resources/processes/purchase-approval.bpmn20.xml`
  - `src/main/resources/processes/large-amount-approval.bpmn20.xml`
  - `src/main/java/com/example/flowable/demo/delegate/BudgetCheckDelegate.java`
  - `src/main/java/com/example/flowable/demo/delegate/NotifyDelegate.java`
  - `src/main/java/com/example/flowable/demo/listener/ProcessStartEndExecutionListener.java`
  - `src/main/java/com/example/flowable/demo/listener/GatewayTakeExecutionListener.java`
  - `src/main/java/com/example/flowable/demo/listener/ApprovalTaskListener.java`
  - `src/main/java/com/example/flowable/demo/listener/VoteCollectTaskListener.java`

- [ ] **Step 7.1: 写 `pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <!-- Spring Boot 3.3.4 是 Flowable 7.1.0 官方构建所用的版本（flowable-root POM 的 spring.boot.version） -->
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
    <relativePath/>
  </parent>

  <groupId>com.example</groupId>
  <artifactId>flowable-springboot-demo</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>

  <properties>
    <java.version>17</java.version>
    <flowable.version>7.1.0</flowable.version>
    <mysql.version>8.4.0</mysql.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <!-- Flowable 全家桶 starter：自动配置流程引擎、自动部署 classpath:/processes/ 下的 BPMN -->
    <dependency>
      <groupId>org.flowable</groupId>
      <artifactId>flowable-spring-boot-starter</artifactId>
      <version>${flowable.version}</version>
    </dependency>
    <dependency>
      <groupId>com.mysql</groupId>
      <artifactId>mysql-connector-j</artifactId>
      <version>${mysql.version}</version>
      <scope>runtime</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 7.2: 放入 Maven Wrapper（与 Task 3.2 完全相同的命令，目标目录换成 boot 工程）**

```bash
cd "C:/D/projects/no-code-cloud/java/flowable-springboot-demo"
mkdir -p .mvn/wrapper
curl -s -o mvnw https://raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.4/maven-wrapper-distribution/src/resources/mvnw
curl -s -o mvnw.cmd https://raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.4/maven-wrapper-distribution/src/resources/mvnw.cmd
chmod +x mvnw
```

`.mvn/wrapper/maven-wrapper.properties` 内容与 Task 3.2 逐字相同：

```
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip
wrapperUrl=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar
```

- [ ] **Step 7.3: 复制 8 个共享文件并逐一校验字节级相同**

```bash
SRC="C:/D/projects/no-code-cloud/java/flowable-console-demo/src/main"
DST="C:/D/projects/no-code-cloud/java/flowable-springboot-demo/src/main"
mkdir -p "$DST/resources/processes" \
         "$DST/java/com/example/flowable/demo/delegate" \
         "$DST/java/com/example/flowable/demo/listener"
cp "$SRC/resources/processes/purchase-approval.bpmn20.xml"          "$DST/resources/processes/"
cp "$SRC/resources/processes/large-amount-approval.bpmn20.xml"      "$DST/resources/processes/"
cp "$SRC/java/com/example/flowable/demo/delegate/BudgetCheckDelegate.java" "$DST/java/com/example/flowable/demo/delegate/"
cp "$SRC/java/com/example/flowable/demo/delegate/NotifyDelegate.java"      "$DST/java/com/example/flowable/demo/delegate/"
cp "$SRC/java/com/example/flowable/demo/listener/ProcessStartEndExecutionListener.java" "$DST/java/com/example/flowable/demo/listener/"
cp "$SRC/java/com/example/flowable/demo/listener/GatewayTakeExecutionListener.java"     "$DST/java/com/example/flowable/demo/listener/"
cp "$SRC/java/com/example/flowable/demo/listener/ApprovalTaskListener.java"             "$DST/java/com/example/flowable/demo/listener/"
cp "$SRC/java/com/example/flowable/demo/listener/VoteCollectTaskListener.java"          "$DST/java/com/example/flowable/demo/listener/"
diff -r "$SRC/resources/processes" "$DST/resources/processes"
diff -r "$SRC/java/com/example/flowable/demo/delegate" "$DST/java/com/example/flowable/demo/delegate"
diff -r "$SRC/java/com/example/flowable/demo/listener" "$DST/java/com/example/flowable/demo/listener"
```

Expected: 三条 `diff -r` 均无输出（完全一致）。

- [ ] **Step 7.4: 写 `application.yml`**

```yaml
server:
  port: 8080

spring:
  datasource:
    # createDatabaseIfNotExist=true：首次运行自动建 flowable_demo 库（与手动执行 java/sql/ 建库脚本等效）
    url: jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/flowable_demo?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true
    username: ${DB_USER:root}
    password: ${DB_PASSWORD:helloca}
    driver-class-name: com.mysql.cj.jdbc.Driver

flowable:
  # 库表缺失时自动创建（学习示例方便；生产应关闭，用 java/sql/ 的官方 DDL 建表）
  database-schema-update: true
  # 打开异步执行器，定时边界事件（超时升级）才会真正触发
  async-executor-activate: true
  # BPMN 自动部署目录（默认值就是它，写出来便于理解）
  process-definition-location-prefix: classpath*:/processes/

logging:
  level:
    # 引擎内部日志太吵，学习时聚焦自己代码里 System.out 的【监听】【委托】输出
    org.flowable: warn
```

- [ ] **Step 7.5: 验证编译**

Run: `cd java/flowable-springboot-demo && sh mvnw -q compile`
Expected: 退出码 0（此时还没有 Boot 应用类，只编译共享的 6 个 Java 类）。

---

## Task 8: Boot 版应用代码（BootApplication + ProcessService + ProcessController）

**Files:**
- Create: `java/flowable-springboot-demo/src/main/java/com/example/flowable/demo/BootApplication.java`
- Create: `java/flowable-springboot-demo/src/main/java/com/example/flowable/demo/ProcessService.java`
- Create: `java/flowable-springboot-demo/src/main/java/com/example/flowable/demo/ProcessController.java`

- [ ] **Step 8.1: 写 `BootApplication.java`**

```java
package com.example.flowable.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot 集成版入口：flowable-spring-boot-starter 自动创建引擎、自动部署 processes/ 下的 BPMN。
 * 委托/监听器类与控制台版字节级相同（同包名），BPMN 里写死的 class 两边都能解析。
 */
@SpringBootApplication
public class BootApplication {

    public static void main(String[] args) {
        SpringApplication.run(BootApplication.class, args);
    }
}
```

- [ ] **Step 8.2: 写 `ProcessService.java`**

```java
package com.example.flowable.demo;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.stereotype.Service;

/**
 * 【教学点】Spring 集成后引擎服务（RuntimeService/TaskService/HistoryService…）
 * 是直接可以注入的 Spring Bean，不需要像控制台版那样手工 buildProcessEngine。
 */
@Service
public class ProcessService {

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final HistoryService historyService;

    public ProcessService(RuntimeService runtimeService, TaskService taskService, HistoryService historyService) {
        this.runtimeService = runtimeService;
        this.taskService = taskService;
        this.historyService = historyService;
    }

    /** 发起采购申请：变量与控制台版 baseVars 一致；timeoutDuration 默认 PT24H（演示超时可传 PT5S）。 */
    public Map<String, Object> start(String initiator, long amount, String reason, String timeoutDuration) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", initiator);
        vars.put("amount", amount);
        vars.put("reason", reason);
        vars.put("approved", true);
        vars.put("managerList", Arrays.asList("钱经理", "孙经理"));
        vars.put("voteResults", new ArrayList<String>());
        vars.put("timeoutDuration", timeoutDuration == null || timeoutDuration.isBlank() ? "PT24H" : timeoutDuration);
        String businessKey = "CG-" + System.currentTimeMillis();
        var instance = runtimeService.startProcessInstanceByKey("purchaseApproval", businessKey, vars);
        return Map.of("processInstanceId", instance.getId(), "businessKey", businessKey);
    }

    /** 查待办：assignee（按办理人）与 group（按候选组）二选一或都传。
     *  注意不按 processDefinitionKey 过滤：会签/合规任务属于子流程定义 largeAmountApproval，
     *  只查主流程 key 会把它们漏掉。 */
    public List<Map<String, Object>> tasks(String assignee, String group) {
        var query = taskService.createTaskQuery();
        if (assignee != null && !assignee.isBlank()) {
            query.taskAssignee(assignee);
        }
        if (group != null && !group.isBlank()) {
            query.taskCandidateGroup(group);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Task t : query.orderByTaskCreateTime().asc().list()) {
            result.add(Map.of(
                "id", t.getId(),
                "name", t.getName(),
                "assignee", String.valueOf(t.getAssignee()),
                "processInstanceId", t.getProcessInstanceId()));
        }
        return result;
    }

    /** 办理任务：候选组任务先认领再办理；经理投票用 voteApproved 表达这一票，其余审批用 approved。 */
    public void complete(String taskId, String assignee, Boolean approved) {
        Task task = taskService.createTaskQuery().taskId(taskId).singleResult();
        if (task == null) {
            throw new IllegalArgumentException("任务不存在：" + taskId);
        }
        if (task.getAssignee() == null && assignee != null && !assignee.isBlank()) {
            taskService.claim(taskId, assignee);
        }
        Map<String, Object> vars = new HashMap<>();
        if (approved != null && "经理投票".equals(task.getName())) {
            vars.put("voteApproved", approved);
        } else if (approved != null) {
            vars.put("approved", approved);
        }
        // 与控制台版同理：开异步执行器时办理可能撞乐观锁冲突，命令回滚无副作用，重试即可
        for (int attempt = 1; ; attempt++) {
            try {
                taskService.complete(taskId, vars);
                return;
            } catch (org.flowable.common.engine.api.FlowableOptimisticLockingException e) {
                if (attempt >= 3) {
                    throw e;
                }
                System.out.println("【重试】办理撞上乐观锁冲突（事务已回滚，无副作用），第 " + attempt + " 次重试…");
            }
        }
    }

    /** 查历史：流程实例状态 + 活动轨迹 + 当前活跃任务。 */
    public Map<String, Object> history(String processInstanceId) {
        HistoricProcessInstance pi = historyService.createHistoricProcessInstanceQuery()
            .processInstanceId(processInstanceId).singleResult();
        if (pi == null) {
            throw new IllegalArgumentException("流程实例不存在：" + processInstanceId);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("processInstanceId", pi.getId());
        result.put("businessKey", pi.getBusinessKey());
        // HistoricProcessInstance 在 7.1.0 没有 getState()，状态用结束时间推导
        result.put("state", pi.getEndTime() == null ? "RUNNING" : "COMPLETED");
        result.put("startTime", String.valueOf(pi.getStartTime()));
        result.put("endTime", pi.getEndTime() == null ? null : String.valueOf(pi.getEndTime()));

        List<Map<String, Object>> activities = new ArrayList<>();
        for (HistoricActivityInstance a : historyService.createHistoricActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .orderByHistoricActivityInstanceStartTime().asc().list()) {
            activities.add(Map.of(
                "type", String.valueOf(a.getActivityType()),
                "name", String.valueOf(a.getActivityName()),
                "finished", a.getEndTime() != null));
        }
        result.put("activities", activities);

        List<Map<String, Object>> activeTasks = new ArrayList<>();
        for (Task t : taskService.createTaskQuery().processInstanceId(processInstanceId).list()) {
            activeTasks.add(Map.of(
                "id", t.getId(),
                "name", t.getName(),
                "assignee", String.valueOf(t.getAssignee())));
        }
        result.put("activeTasks", activeTasks);
        return result;
    }
}
```

- [ ] **Step 8.3: 写 `ProcessController.java`**

```java
package com.example.flowable.demo;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 用 REST 驱动和控制台版完全相同的流程，便于对照两种接入方式。 */
@RestController
@RequestMapping("/api/processes")
public class ProcessController {

    private final ProcessService processService;

    public ProcessController(ProcessService processService) {
        this.processService = processService;
    }

    /** 发起：POST /api/processes，body 例 {"initiator":"张三","amount":80000,"reason":"采购服务器","timeoutDuration":"PT24H"} */
    @PostMapping
    public Map<String, Object> start(@RequestBody StartRequest req) {
        return processService.start(req.initiator(), req.amount(), req.reason(), req.timeoutDuration());
    }

    /** 待办：GET /api/processes/tasks?assignee=王主管 或 GET /api/processes/tasks?group=compliance */
    @GetMapping("/tasks")
    public List<Map<String, Object>> tasks(@RequestParam(required = false) String assignee,
                                           @RequestParam(required = false) String group) {
        return processService.tasks(assignee, group);
    }

    /** 办理：POST /api/processes/tasks/{taskId}/complete，body 例 {"approved":true,"assignee":"合规员小周"} */
    @PostMapping("/tasks/{taskId}/complete")
    public ResponseEntity<Map<String, Object>> complete(@PathVariable String taskId,
                                                        @RequestBody(required = false) CompleteRequest req) {
        processService.complete(taskId,
            req == null ? null : req.assignee(),
            req == null ? null : req.approved());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** 历史：GET /api/processes/{instanceId} */
    @GetMapping("/{instanceId}")
    public Map<String, Object> history(@PathVariable String instanceId) {
        return processService.history(instanceId);
    }

    public record StartRequest(String initiator, long amount, String reason, String timeoutDuration) {
    }

    public record CompleteRequest(String assignee, Boolean approved) {
    }
}
```

- [ ] **Step 8.4: 验证编译**

Run: `cd java/flowable-springboot-demo && sh mvnw -q compile`
Expected: 退出码 0（BUILD SUCCESS）。

---

## Task 9: 启动 Boot 版并用 curl 走完三种路径验证

**Files:** 无新文件（本任务纯运行验证）。

- [ ] **Step 9.1: 启动应用**

Run: `cd java/flowable-springboot-demo && sh mvnw spring-boot:run`（后台运行）
Expected: 日志出现 `Started BootApplication`；首次运行自动建库建表并部署两份 BPMN。启动失败时先看：MySQL 是否可连、8080 是否被占用、BPMN 解析错误（同 Task 6 的排查提示）。

（Windows Git Bash 注意：命令行内联的中文 JSON 可能被转成 GBK 导致 Tomcat 400，把 body 写进 UTF-8 文件用 `curl --data-binary @文件名` 传，或用 PowerShell 的 `Invoke-RestMethod`。）

- [ ] **Step 9.2: 大额正常通过路径**

```bash
# 1) 发起（大额 80000，默认 24 小时超时不会触发）
curl -s -X POST http://localhost:8080/api/processes \
  -H "Content-Type: application/json" \
  -d '{"initiator":"张三","amount":80000,"reason":"采购服务器"}'
# Expected: {"processInstanceId":"...","businessKey":"CG-..."}

# 1b) 发起后第一个待办是发起人自己的「提交采购申请」，先办理（body 传 {} 即可）
curl -s "http://localhost:8080/api/processes/tasks?assignee=张三"
curl -s -X POST http://localhost:8080/api/processes/tasks/<提交taskId>/complete \
  -H "Content-Type: application/json" -d '{}'

# 2) 查合规审查候选组任务
curl -s "http://localhost:8080/api/processes/tasks?group=compliance"
# Expected: 1 条 name=合规审查 的任务（assignee 为 "null"）

# 3) 认领并办理（approved 不传=无审批含义的办理）
curl -s -X POST http://localhost:8080/api/processes/tasks/<合规审查taskId>/complete \
  -H "Content-Type: application/json" \
  -d '{"assignee":"合规员小周"}'
# Expected: {"ok":true}；服务日志出现【委托】预算核对完成…

# 4) 查会签任务并逐票办理
curl -s "http://localhost:8080/api/processes/tasks?assignee=钱经理"
curl -s "http://localhost:8080/api/processes/tasks?assignee=孙经理"
curl -s -X POST http://localhost:8080/api/processes/tasks/<钱经理taskId>/complete -H "Content-Type: application/json" -d '{"approved":true}'
curl -s -X POST http://localhost:8080/api/processes/tasks/<孙经理taskId>/complete -H "Content-Type: application/json" -d '{"approved":true}'
# Expected: 各 {"ok":true}；服务日志出现两条【监听】会签投票…

# 5) 总监审批
curl -s "http://localhost:8080/api/processes/tasks?assignee=李总监"
curl -s -X POST http://localhost:8080/api/processes/tasks/<总监taskId>/complete -H "Content-Type: application/json" -d '{"approved":true}'

# 6) 查历史
curl -s http://localhost:8080/api/processes/<instanceId>
# Expected: state=COMPLETED（由结束时间推导），activities 含 startEvent→…→endEvent 完整轨迹，activeTasks 为空
```

- [ ] **Step 9.3: 超时升级路径（定时边界事件）**

```bash
# 发起时把超时改成 5 秒
curl -s -X POST http://localhost:8080/api/processes \
  -H "Content-Type: application/json" \
  -d '{"initiator":"张三","amount":60000,"reason":"采购网络设备","timeoutDuration":"PT5S"}'
# 发起后先办理发起人的「提交采购申请」（同 9.2 的 1b）；合规审查 + 两票通过后，不批总监任务，
# 等约 15 秒（5 秒的定时任务要等作业执行器捡起，默认约 10 秒一轮）：
curl -s "http://localhost:8080/api/processes/tasks?assignee=李总监"   # 应为空（总监任务已被超时事件中断）
curl -s "http://localhost:8080/api/processes/tasks?assignee=赵总经理" # 应有 1 条 name=总经理特批
# 总经理批准后查历史，流程结束
```

- [ ] **Step 9.4: 驳回重填路径**

```bash
curl -s -X POST http://localhost:8080/api/processes -H "Content-Type: application/json" \
  -d '{"initiator":"李四","amount":3000,"reason":"采购键盘"}'
# 先办理发起人李四的「提交采购申请」（同 9.2 的 1b）
curl -s "http://localhost:8080/api/processes/tasks?assignee=王主管"
curl -s -X POST http://localhost:8080/api/processes/tasks/<主管taskId>/complete -H "Content-Type: application/json" -d '{"approved":false}'
# Expected: {"ok":true}。「驳回」连线没挂 take 监听器，日志不会打印网关流转；
# 驳回走向从历史接口的 activities 里看：sequenceFlow「驳回」→ 重置审批结果
curl -s "http://localhost:8080/api/processes/tasks?assignee=李四"     # 出现 提交采购申请（重填）
curl -s -X POST http://localhost:8080/api/processes/tasks/<重填taskId>/complete -H "Content-Type: application/json" -d '{"reason":"采购键盘（重新提交）"}'
curl -s "http://localhost:8080/api/processes/tasks?assignee=王主管"   # 再次出现 部门主管审批
curl -s -X POST http://localhost:8080/api/processes/tasks/<主管taskId>/complete -H "Content-Type: application/json" -d '{"approved":true}'
curl -s http://localhost:8080/api/processes/<instanceId>              # 流程结束，活动轨迹里能看到两条「提交采购申请」记录
```

- [ ] **Step 9.5: 停掉后台服务，记录验证结论**

Ctrl+C / 结束后台进程；把三条路径的实际返回摘录进 Task 10 的运行指南「预期输出」小节。

---

## Task 10: 运行指南、两个 README 与收尾核对

**Files:**
- Create: `java/docs/flowable-example-run-guide.md`
- Create: `java/flowable-console-demo/README.md`
- Create: `java/flowable-springboot-demo/README.md`

- [ ] **Step 10.1: 写 `java/docs/flowable-example-run-guide.md`**

内容大纲（写成完整 Markdown，按 AGENTS.md「面向人的文档」要求，命令、预期输出、点击路径都要具体）：

1. **准备**：本机 MySQL 可连（root，默认 3306）；两种建库建表方式（手动执行 `java/sql/` 两个脚本，或什么都不做、首次运行自动建）；Java 17 说明（无需预装 Maven，wrapper 会自动下载）。
2. **跑控制台版**：`cd java/flowable-console-demo && sh mvnw exec:java`（Windows 命令行用 `mvnw.cmd exec:java`）；预期输出按 Task 6.4 的五段讲解，每段对应哪个 Flowable 特性（部署→repositoryService，启动→runtimeService，待办→taskService，超时→异步执行器+定时边界事件，历史→historyService）。
3. **跑 Spring Boot 版**：`cd java/flowable-springboot-demo && sh mvnw spring-boot:run`；按 Task 9 的 curl 序列给出完整命令与预期 JSON（把 Step 9.5 摘录的实际返回贴进来）。
4. **环境变量**：`DB_HOST/DB_PORT/DB_USER/DB_PASSWORD` 四个都可覆盖，默认值与本机 `server/.env` 一致。
5. **技术点对照表**：设计文档第 4 节的 11 个技术点 × 「在哪个输出/哪段代码能看到」。
6. **Spring 写法对照（delegateExpression）**：给一小段示例——Boot 版若想用 Spring Bean 当委托：
   ```java
   @Component("notifyDelegate")
   public class NotifyDelegateBean implements JavaDelegate { ... }
   ```
   BPMN 里改成 `flowable:delegateExpression="${notifyDelegate}"`；说明为什么**没有**进共享 BPMN（控制台版没有 Spring 容器，解析不了 `${notifyDelegate}`）。
7. **常见问题**：表已存在（先 `DROP DATABASE flowable_demo`）；时区（URL 里 `serverTimezone=Asia/Shanghai`）；重复运行累积部署记录（无害，可重建库）；端口 8080 被占（`server.port`）。

- [ ] **Step 10.2: 写两个 README（简短指针）**

`java/flowable-console-demo/README.md`：

```markdown
# flowable-console-demo（裸引擎版）

不经过 Spring，用 `StandaloneProcessEngineConfiguration` 直接创建 Flowable 引擎，
`main` 方法按三个场景（小额批准 / 大额超时升级 / 驳回重填）一步步跑，每步打印引擎状态。

## 运行

```bash
sh mvnw exec:java        # Windows 命令行：mvnw.cmd exec:java
```

首次运行会自动建 `flowable_demo` 库和引擎表（也可先手动执行 `../sql/` 下的脚本）。
详细说明、预期输出讲解、技术点对照：见 `../docs/flowable-example-run-guide.md`。
```

`java/flowable-springboot-demo/README.md`：

```markdown
# flowable-springboot-demo（Spring Boot 集成版）

用 `flowable-spring-boot-starter` 自动配置引擎并部署 `src/main/resources/processes/` 下的 BPMN，
通过 REST 接口驱动与控制台版完全相同的采购审批流程。

## 运行

```bash
sh mvnw spring-boot:run  # Windows 命令行：mvnw.cmd spring-boot:run
```

然后按 `../docs/flowable-example-run-guide.md` 第 3 节的 curl 序列走完三种路径。
BPMN、委托类、监听器类与 `flowable-console-demo` 字节级相同（同包名），便于对照两种接入方式。
```

- [ ] **Step 10.3: 收尾核对（对照设计文档逐项）**

Run: 肉眼 + `grep` 核对下表，每项在两个 demo 里都能指认：

| 设计文档技术点 | 控制台版看哪 | Boot 版看哪 |
|---|---|---|
| 用户任务/候选组 | 场景一、二输出与 claim | tasks?group=compliance 接口 |
| 排他网关+UEL | 金额分支/审批结果连线日志 | 同左（监听日志） |
| 并行网关 | 场景二合规∥预算 | 同左 |
| 调用活动+变量映射 | 场景二子流程启动/传回 | 同左 |
| 多实例会签+完成条件+集合变量 | 两条投票监听日志、voteResults | complete 接口 voteApproved |
| 定时边界事件+作业执行器 | 场景二 3 秒升级 | PT5S 升级路径 |
| JavaDelegate class+字段注入 | 【委托】预算核对/发送通知 | 服务日志同左 |
| 执行监听器 start/end/take | 【监听】流程启动/结束/网关流转 | 同左 |
| 任务监听器 create/assignment/complete | 【监听】任务创建/分配/完成 | 同左 |
| 变量传递/局部变量 | variables 打印 | history 接口 |
| 驳回回流（含表达式服务任务） | 场景三 | 驳回重填路径 |
| businessKey/三级历史 | 场景一 history 打印 | history 接口 |

同时核对：`java/sql/` 两个脚本存在且未被执行（`mysql` 里无 `flowable_demo` 库也属正常，说明没人代跑）；`git status` 里新增文件齐全；抽查每个新文件中文注释为正常汉字（无 `鏍囩` 类乱码）。

- [ ] **Step 10.4: 提交（仅当使用者要求时执行）**

```bash
git add java/
git commit -m "java: 新增 Flowable 学习示例（控制台版、Spring Boot 版、SQL 存档与运行指南）"
```

---

## 自查记录（计划完成时已核）

1. **Spec 覆盖**：设计文档 §2 结构（Task 3/7）、§3 数据库与 SQL（Task 1/2 + JDBC 参数）、§4 流程与技术点 11 项（Task 4/5/6/8/9，含设计时补充确认的「重置审批结果」表达式服务任务，解决驳回后 approved 残留 false 的漏洞）、§5 XML 注释（Task 5 每元素三件事）、§6 两个 demo 分工（Task 6/8/9）、§7 运行指南（Task 10.1，含 delegateExpression 对照）、§8 不做的事（未越界）。文档位置全部在 `java/docs/`（用户要求，替代默认的根 docs）。
2. **占位符扫描**：无 TBD/TODO；所有代码步骤给出完整代码；所有运行步骤给出命令与预期输出；唯一的外部素材（官方 DDL）有明确提取命令，不靠临场发挥。
3. **类型/命名一致性**：委托与监听器类名、包名 `com.example.flowable.demo.*` 在 Task 4/5/7/8 与 BPMN class 引用一致；流程变量 `initiator/amount/reason/approved/managerList/voteResults/voteApproved/timeoutDuration/budgetNote` 在 Task 5/6/8/9 一致；流程 key `purchaseApproval`/`largeAmountApproval`、任务名「提交采购申请/部门主管审批/合规审查/经理投票/总监审批/总经理特批」在 BPMN、控制台断言、REST 查询参数中一致。
