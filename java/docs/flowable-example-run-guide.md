# Flowable 7.1.0 学习示例运行指南

本指南教你在本机把两个 Flowable 学习示例跑起来：

- `java/flowable-console-demo`：**裸引擎版**。不经过 Spring，用 `StandaloneProcessEngineConfiguration` 直接创建引擎，`main` 方法按三个场景跑完并逐步打印引擎状态。
- `java/flowable-springboot-demo`：**Spring Boot 集成版**。引擎由 starter 自动配置，BPMN 自动部署，通过 REST 接口驱动**完全相同**的采购审批流程。

两个工程共用同一套 BPMN 和同一批委托类、监听器类（字节级相同、同包名），方便对照「手工建引擎」和「Spring 托管」两种接入方式。

三个业务场景（两种运行方式里都会出现）：

1. **小额批准**：3000 元采购，走小额分支，部门主管直接批准。
2. **大额超时升级**：80000 元采购，进入大额审批子流程（合规审查、预算核对、两位经理会签），总监超时不批则升级给总经理特批。
3. **驳回重填**：主管驳回，流程回到发起人重填后再提交，重新走审批。

---

## 1. 准备

### 1.1 软件要求

- **MySQL**：本机可连即可（默认 `localhost:3306`，账号 `root`）。示例使用**独立库 `flowable_demo`**，与主项目 `no_code_cloud` 完全隔离，不会碰其它库。
- **Java 17**：`java -version` 能看到 17 即可。
- **Maven 不用装**：两个工程自带 Maven Wrapper（`mvnw` / `mvnw.cmd`），首次运行会自动下载 Maven。

### 1.2 建库建表：两种方式任选

**方式 A：什么都不做（推荐学习用）**

两个示例的 JDBC URL 都带 `createDatabaseIfNotExist=true`，且都配置了 `databaseSchemaUpdate=true`。首次运行时会自动建出 `flowable_demo` 库和全部引擎表（`ACT_*` / `FLW_*` 等几十张）。表建完没有任何提示，想确认可以在 MySQL 里执行 `SHOW TABLES FROM flowable_demo;`。

**方式 B：先手动执行 `java/sql/` 下的两个脚本（按顺序）**

```bash
cd java/sql
mysql -uroot -p < 2026-09-09-flowable-demo-create-database.sql     # 第 1 步：建库（utf8mb4）
mysql -uroot -p flowable_demo < 2026-09-09-flowable-mysql-create-tables.sql  # 第 2 步：Flowable 7.1.0 官方建表 DDL
```

注意第 2 个脚本必须**在建库之后**执行，且脚本内部 `common` 段在最前（后面 `engine` 段的外键引用它建的表）。这个方式的价值是存档官方 DDL、在全新环境手工部署；Boot 版启动后还会自动补建 CMMN / DMN / 事件注册等其它引擎的表（这些未入档，由引擎自动建）。

---

## 2. 跑控制台版

```bash
cd java/flowable-console-demo
sh mvnw exec:java        # Windows 命令行（cmd / PowerShell）：mvnw.cmd exec:java
```

整个运行约 1 分钟——场景二里程序会**故意等着**定时器触发（见下文）。以下按输出出现的五个段落讲解，引号里都是真实运行日志。

### 2.1 引擎启动（自动建库建表）

```text
【引擎】Flowable 启动完成：default
```

这一行出现，说明 `StandaloneProcessEngineConfiguration.buildProcessEngine()` 已经成功：引擎连上 MySQL、按需建表、初始化完成。首库建表是引擎静默完成的，日志里没有逐表输出。

**对应特性**：引擎的创建与数据库初始化（`ProcessEngines` / `RepositoryService` 等服务都从这个引擎对象上取）。

### 2.2 BPMN 部署

```text
【引擎】BPMN 部署完成，当前最新版本流程定义：
   largeAmountApproval v6（大额审批子流程）
   purchaseApproval v6（采购申请审批）
```

启动时把 `src/main/resources/processes/` 下的两个 BPMN 部署进引擎。**每次运行都会新增一条部署记录，版本号 +1**（这里显示 v6 是因为之前跑过 5 次），这是正常行为，不影响演示。

**对应特性**：`repositoryService`（部署与流程定义查询）。

### 2.3 场景一：小额采购（3000 元）——主管直接批准

```text
================================================== 场景一：小额采购（3000 元）——主管直接批准
【监听】流程启动：definition=purchaseApproval:6:12505，instance=12506，businessKey=CG-20260909-0001
【发起】instance=12506，businessKey=CG-20260909-0001
【监听】任务分配：「部门主管审批」 → 王主管
【监听】任务创建：部门主管审批（id=12528）
【办理】发起人完成「提交采购申请」
-- 当前待办（应只有部门主管审批）（1 条）
   任务 id=12528，name=部门主管审批，assignee=王主管，instance=12506
【监听】任务完成：「部门主管审批」，approved=true
【监听】网关流转：经过连线「通过」
【委托】发送通知：to=张三，模板=采购审批结果通知，内容=您的采购申请已通过
【监听】流程结束：instance=12506
```

看点：

- `【监听】任务分配/任务创建/任务完成`：任务监听器（assignment / create / complete 三个事件）在真实打印；
- `【监听】网关流转：经过连线「通过」`：排他网关按 `${amount < 10000}` 走了「小额」，按 `${approved == true}` 走了「通过」（网关连线上的 take 监听器打印）；
- `【委托】发送通知`：服务任务调用 JavaDelegate。

场景一末尾是**三级历史查询**（全部来自历史表，不是运行时表）：

```text
-- 流程变量（最终快照，来自历史表，6 个）
   amount = 3000
   approved = true
   initiator = 张三
   ...
-- 历史·流程实例：已结束，开始=Thu Sep 10 11:13:41 CST 2026，结束=...，耗时 345 ms
-- 历史·活动轨迹（按时间升序）
   [startEvent] 开始（耗时 14 ms）
   [userTask] 提交采购申请（耗时 105 ms）
   [exclusiveGateway] 金额分支（耗时 34 ms）
   [sequenceFlow] 小额（耗时 0 ms）
   [userTask] 部门主管审批（耗时 82 ms）
   ...
-- 历史·任务清单
   提交采购申请，办理人=张三（已办）
   部门主管审批，办理人=王主管（已办）
```

三级 = 流程实例级（含 businessKey `CG-20260909-0001`）→ 活动轨迹级 → 任务清单级。

**对应特性**：`runtimeService`（启动实例、businessKey）、`taskService`（查待办、办理）、执行/任务监听器、`historyService`（三级历史查询）。

### 2.4 场景二：大额采购（80000 元）——会签通过，总监超时升级总经理特批

```text
================================================== 场景二：大额采购（80000 元）——会签通过，总监超时升级总经理特批
【监听】流程启动：definition=purchaseApproval:6:12505，instance=12537，businessKey=CG-20260909-0002
【监听】网关流转：经过连线「大额」
【委托】预算核对完成：预算充足（金额 80000 元，走常规预算科目）
【子流程】子流程实例 id=12560（独立于主流程 12537）
-- 子流程·合规审查（候选组任务，需先认领）（1 条）
   任务 id=12579，name=合规审查，assignee=null，instance=12560
【办理】合规员小周认领并完成合规审查
-- 会签任务（按 managerList=[钱经理, 孙经理] 各生成一份）（2 条）
   任务 id=12601，name=经理投票，assignee=钱经理，instance=12560
   任务 id=12606，name=经理投票，assignee=孙经理，instance=12560
【监听】会签投票：钱经理 同意
【监听】会签投票：孙经理 同意
【监听】任务分配：「总监审批」 → 李总监
【重试】办理撞上乐观锁冲突（事务已回滚，无副作用），第 1 次重试…
【等待】故意不批总监任务，等定时边界事件触发（作业执行器默认约 10 秒捡起一次，稍等）…
【监听】任务分配：「总经理特批」 → 赵总经理
```

看点：

- `【监听】网关流转：经过连线「大额」`：80000 元不满足 `${amount < 10000}`，排他网关走了「大额」连线；
- `【委托】预算核对完成`：子流程里的并行网关把**合规审查**和**预算核对**（服务任务，JavaDelegate）两路同时展开；
- `【子流程】子流程实例 id=12560（独立于主流程 12537）`：调用活动（Call Activity）启动了独立的子流程实例，变量经 `flowable:in` 传入、`flowable:out` 传回；
- `assignee=null` 的合规审查：**候选组任务**（`candidateGroups=compliance`），要先 `claim` 认领成自己的再办理；
- 会签：多实例任务按集合变量 `managerList` 每人生成一份，完成条件是 `${nrOfCompletedInstances == nrOfInstances}`（全票才过）；每次投票由任务监听器收进 `voteResults`；
- `【重试】办理撞上乐观锁冲突…`：异步执行器和主线程同时操作引擎数据时可能撞乐观锁，示例已内置重试，**出现这行属正常**；
- `【等待】…约 10 秒捡起一次`：总监任务挂了 `PT3S` 的定时边界事件（超时时长来自流程变量 `timeoutDuration`）。定时器到点后不是立刻执行，要等**异步执行器**（默认约 10 秒一轮）捡起作业，所以升级任务可能晚约 10 秒才出现；
- `【监听】任务分配：「总经理特批」 → 赵总经理`：边界事件触发，总监审批任务被取消（`cancelActivity=true`），流程改走升级分支。

场景二末尾的变量快照有 7 个，注意 `timeoutDuration = PT3S` 和 `voteResults = [钱经理：同意, 孙经理：同意]`。

**对应特性**：调用活动 + 变量映射、并行网关、多实例会签 + 完成条件 + 集合变量、定时边界事件 + 异步执行器（作业执行器）、乐观锁与重试。

### 2.5 场景三：小额采购（2000 元）——主管驳回，发起人重填后再批准

```text
================================================== 场景三：小额采购（2000 元）——主管驳回，发起人重填后再批准
【监听】任务完成：「部门主管审批」，approved=false
【办理】王主管驳回（approved=false）
-- 驳回后回到发起人（重置审批结果服务任务已把 approved 置回 true）（1 条）
   任务 id=12678，name=提交采购申请，assignee=李四，instance=12647
【办理】李四重新提交
【监听】任务分配：「部门主管审批」 → 王主管
【监听】任务完成：「部门主管审批」，approved=true
【监听】网关流转：经过连线「通过」
```

看点：

- 驳回后任务回到了发起人李四名下（`assignee=李四`），流程图允许回环到发起节点；
- 注意**日志里没有**「网关流转：经过连线『驳回』」——「驳回」连线上没挂 take 监听器，日志不打网关流转；想确认驳回走向，看场景末尾的历史活动轨迹里 `sequenceFlow「驳回」→ 重置审批结果` 即可；
- `重置审批结果` 是一个**表达式服务任务**：`flowable:expression="${execution.setVariable('approved', true)}"`，不写 Java 类直接用 UEL 把 `approved` 置回 true，保证重新提交后能重新走完整审批链。

**对应特性**：排他网关回流（BPMN 回环）、表达式服务任务、变量重置。

### 2.6 输出段落 ↔ Flowable 服务速查

| 输出段落 | 主要服务 |
|---|---|
| 引擎启动 / BPMN 部署 | 引擎创建、`repositoryService` |
| 发起流程、businessKey | `runtimeService` |
| 待办查询、认领、办理 | `taskService` |
| 超时升级（场景二） | 异步执行器 + 定时边界事件 |
| 三级历史打印 | `historyService` |

---

### 2.7 请假单示例：并行会签 + 驳回重填（leaveRequest）

采购示例之外还有一个更小的独立示例：一张请假单，a、b 两人并行会签（**全部同意才通过，任一人不同意立即短路**，没办完的待办直接删除），会签结束后按结果发「邮件」通知员工（日志模拟，带每位审批人的意见明细），驳回时员工修改重填再提交，通过后流程结束谁也不能再改。

运行（注意要显式指定入口类，默认入口是采购示例）：

```bash
cd java/flowable-console-demo
sh mvnw exec:java -Dexec.mainClass=com.example.flowable.demo.LeaveApplication
# Windows 命令行（cmd / PowerShell）：mvnw.cmd exec:java -Dexec.mainClass=com.example.flowable.demo.LeaveApplication
```

两个场景一次跑完，预期输出（本机实测摘录）：

**场景一（小李，3 天年假）**：a、b 各拿到一份「会签审批」待办，都批准后看到通过邮件——

```text
-- 当前待办（a、b 两份会签任务）（2 条）
   任务 id=17534，name=会签审批，assignee=a，instance=17504
   任务 id=17539，name=会签审批，assignee=b，instance=17504
【监听】会签审批：a 同意，意见已记录
【监听】会签审批：b 同意，意见已记录

【邮件·模拟】收件人：小李
【邮件·模拟】正文：你提交的请假申请（3 天，事由：年假）已审批通过。
【邮件·模拟】审批意见明细：
【邮件·模拟】  - a：同意（情况属实，批准）
【邮件·模拟】  - b：同意（情况属实，批准）
【邮件·模拟】流程已结束，申请单不可再修改。
【核对】流程结束后的待办数量：0（应为 0，谁也不能再改）
```

**场景二（小王，2 天事假）**：a 填了不同意意见并办结——完成条件 `approvalRejected==true` 命中，**b 的待办没等到办理就被短路删除**，驳回邮件只带 a 一条意见，然后小王的重填待办出现；补全事由重新提交后，新一轮 a、b 都批准，通过邮件里只有这一轮的意见（上一轮意见已随重提清空）——

```text
【监听】会签审批：a 不同意，标记 approvalRejected=true（其余待办将被短路删除）
【邮件·模拟】正文：你提交的请假申请（2 天，事由：事假）被驳回。
【邮件·模拟】  - a：不同意（事由不明，请补充具体原因）
-- a 办结后的待办（b 的会签任务已被短路删除，只剩小王的重填待办）（1 条）
   任务 id=17598，name=提交请假单，assignee=小王，instance=17552
【办理】小王补全事由重新提交（同一组键重新赋值，新一轮从干净状态开始）
-- 新一轮会签待办（opinions 已清空）（2 条）
【邮件·模拟】正文：你提交的请假申请（2 天，事由：事假（补充：家人就医需陪同））已审批通过。
```

末尾三级历史里，场景二能看到两条「提交请假单」记录（原提交 + 驳回重填）。

与采购示例的对照：请假流程没有定时器，所以引擎**不**开异步执行器（`LeaveApplication` 里刻意不调 `setAsyncExecutorActivate(true)`）；也没有独立的「重置审批结果」服务任务——驳回重提时由提交待办把 `approved / approvalRejected / opinions / approverList` 一组变量重新赋值，就完成重置。设计细节见 `docs/2026-09-10-leave-request-example-design.md`。

Boot 版同样内置了这份请假流程（同一份 BPMN 与监听/委托类），用 REST 驱动的跑法见 §3.6。

---

## 3. 跑 Spring Boot 版

```bash
cd java/flowable-springboot-demo
sh mvnw spring-boot:run   # Windows 命令行（cmd / PowerShell）：mvnw.cmd spring-boot:run
```

启动成功标志（本机实测）：

```text
Tomcat started on port 8080 (http) with context path '/'
Started BootApplication in 4.205 seconds (process running for 4.471)
```

引擎由 `flowable-spring-boot-starter` 自动配置：连库建表、部署 `src/main/resources/processes/` 下的 BPMN、打开异步执行器（定时边界事件才会触发）。控制台会看到与控制台版相同的 `【监听】【委托】` 输出（引擎内部日志已调成 `warn`，聚焦自己代码的打印）。

### 3.1 接口一览

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/api/processes` | 发起采购流程 |
| POST | `/api/processes/leaves` | 发起请假流程 |
| GET | `/api/processes/tasks?assignee=王主管` 或 `?group=compliance` | 查待办（按办理人 / 按候选组） |
| POST | `/api/processes/tasks/{taskId}/complete` | 办理任务（候选组任务会先认领） |
| GET | `/api/processes/{instanceId}` | 查历史（状态 + 活动轨迹 + 当前活跃任务） |

### 3.2 中文 JSON 编码提醒（Windows 下必读）

Windows Git Bash 里直接 `curl -d '{"initiator":"张三"}'` 内联中文，中文可能被转成 GBK，Tomcat 解析失败返回 400（日志出现 `JSON parse error: Invalid UTF-8 middle byte`）。**先把 JSON 写进 UTF-8 文件，再用 `--data-binary @文件` 发送**；或者改用 PowerShell 的 `Invoke-RestMethod`。URL 查询参数里的中文同理（`assignee=王主管` 会报 `Invalid character found in the request target`），建议用 `curl -G --data-urlencode 'assignee=王主管' …`，或改查 ASCII 参数（如 `group=compliance`）。

下面所有请求都按「写文件 + `--data-binary`」的方式给。

### 3.3 路径一：大额直接通过（80000 元）

```bash
# 1) 发起（timeoutDuration 不传就是默认 PT24H，本路径用不到超时）
cat > start-large.json <<'EOF'
{"initiator":"张三","amount":80000,"reason":"采购 8 台服务器","timeoutDuration":"PT24H"}
EOF
curl -s -X POST http://localhost:8080/api/processes \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @start-large.json
```

预期返回（形如）：

```json
{"processInstanceId":"be4961f8-acc9-11f1-af9d-00ff14bb403c","businessKey":"CG-1789011790602"}
```

记下 `processInstanceId`，后面用 `$ID` 指代它。

```bash
# 2) 查合规组的候选任务
curl -s "http://localhost:8080/api/processes/tasks?group=compliance"
```

```json
[{"id":"…","name":"合规审查","assignee":"null","processInstanceId":"…"}]
```

`assignee` 是字符串 `"null"` 表示还没认领。 complete 接口传 `assignee` 会自动先认领再办理：

```bash
# 3) 合规员认领并办理
cat > complete-compliance.json <<'EOF'
{"assignee":"合规员小周","approved":true}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<合规审查任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @complete-compliance.json
# 预期：{"ok":true}
```

```bash
# 4) 两位经理各投一票（经理投票任务传 approved，服务端会映射成会签变量 voteApproved）
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=钱经理"
cat > vote-qian.json <<'EOF'
{"assignee":"钱经理","approved":true}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<钱经理的经理投票任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @vote-qian.json
# 孙经理同样：查 assignee=孙经理 → complete {"assignee":"孙经理","approved":true}

# 5) 李总监直接批准
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=李总监"
cat > approve-director.json <<'EOF'
{"approved":true}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<总监审批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @approve-director.json

# 6) 查历史：应已结束
curl -s http://localhost:8080/api/processes/$ID
```

历史返回（形如）：

```json
{
  "processInstanceId":"be4961f8-…",
  "businessKey":"CG-1789011790602",
  "state":"COMPLETED",
  "startTime":"…","endTime":"…",
  "activities":[
    {"type":"startEvent","name":"开始","finished":true},
    {"type":"callActivity","name":"大额审批","finished":true},
    {"type":"serviceTask","name":"发送通知","finished":true},
    {"type":"endEvent","name":"结束（通过）","finished":true}
  ],
  "activeTasks":[]
}
```

每一步办理时，应用控制台会同步打出对应的 `【监听】【委托】` 日志（与控制台版一致）。

### 3.4 路径二：大额超时升级（60000 元，PT5S）

```bash
# 1) 发起，超时时长给 PT5S
cat > start-timeout.json <<'EOF'
{"initiator":"张三","amount":60000,"reason":"采购投影仪","timeoutDuration":"PT5S"}
EOF
curl -s -X POST http://localhost:8080/api/processes \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @start-timeout.json
```

然后**重复路径一的第 2–4 步**（合规审查 + 两位经理投票）。

```bash
# 2) 关键差异：不办李总监的「总监审批」，等 10~20 秒
#    （PT5S 定时器到点后要等异步执行器捡起，默认约 10 秒一轮，升级任务可能晚约 10 秒出现）
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=赵总经理"
# 预期：出现「总经理特批」任务
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=李总监"
# 预期：空数组——总监审批已被定时边界事件取消（cancelActivity=true）

# 3) 总经理特批通过
cat > approve-ceo.json <<'EOF'
{"approved":true}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<总经理特批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @approve-ceo.json
# 预期：{"ok":true}；历史接口 state=COMPLETED
```

### 3.5 路径三：驳回重填（2000 元）

```bash
# 1) 发起人李四提交
cat > start-reject.json <<'EOF'
{"initiator":"李四","amount":2000,"reason":"采购墨盒"}
EOF
curl -s -X POST http://localhost:8080/api/processes \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @start-reject.json

# 2) 发起人先办理「提交采购申请」（不带 approved）
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=李四"
curl -s -X POST http://localhost:8080/api/processes/tasks/<提交采购申请任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" -d '{}'
# 预期：{"ok":true}

# 3) 王主管驳回
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=王主管"
cat > reject.json <<'EOF'
{"approved":false}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<部门主管审批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @reject.json

# 4) 查李四待办：又出现「提交采购申请」（驳回回流；控制台能看到重置审批结果把 approved 置回 true）
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=李四"

# 5) 李四重新提交，王主管再批准 → 结束
curl -s -X POST http://localhost:8080/api/processes/tasks/<新的提交采购申请任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" -d '{}'
cat > approve-supervisor.json <<'EOF'
{"approved":true}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<新的部门主管审批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @approve-supervisor.json
# 历史接口 state=COMPLETED；应用控制台有【委托】发送通知：to=李四
```

**注意**：GET `/api/processes/{id}` 的 `activeTasks` 在子流程（调用活动）进行中会是**空数组**——子流程的合规审查、会签、投票任务都挂在子流程实例上，不在主实例名下。这期间用 `tasks?assignee=` / `tasks?group=` 查待办即可。

### 3.6 请假流程路径（leaveRequest）

请假流程复用同一组待办 / 历史接口，只多一个发起入口。审批人固定叫 `a` 和 `b`（ASCII 名字，URL 参数不用编码）；「会签审批」办理时 `comment`（审批意见）**必填**，漏传服务端返回 HTTP 500（教学示例没配全局异常处理器，以 500 白页兜底）。每一步办理时应用控制台同步打 `【监听】` 日志，走到「发送邮件通知」会打 `【邮件·模拟】` 正文（含审批意见明细）。

```bash
# 路径一：两人全同意 → 通过

# 1) 发起请假
cat > leave-start.json <<'EOF'
{"initiator":"小李"}
EOF
curl -s -X POST http://localhost:8080/api/processes/leaves \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @leave-start.json
```

```json
{"processInstanceId":"ba0cb446-acec-11f1-82bd-00ff14bb403c","businessKey":"QJ-1759…"}
```

```bash
# 2) 小李办「提交请假单」（days / reason 必填，服务端会初始化 approved / opinions / approverList）
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=小李"
cat > leave-submit.json <<'EOF'
{"days":3,"reason":"年假"}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<提交请假单任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @leave-submit.json
# 预期：{"ok":true}；随后 a、b 各出现一个「会签审批」待办

# 3) a、b 先后同意（comment 必填；漏传 {"approved":true} 会拿到 HTTP 500）
cat > leave-approve.json <<'EOF'
{"approved":true,"comment":"情况属实，批准"}
EOF
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=a"
curl -s -X POST http://localhost:8080/api/processes/tasks/<a的会签审批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @leave-approve.json
# a 同意后 b 的任务还在（并行会签要两票都到），同样办掉 b：
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=b"
curl -s -X POST http://localhost:8080/api/processes/tasks/<b的会签审批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @leave-approve.json

# 4) 查历史：state=COMPLETED、activeTasks=[]，轨迹里会签审批出现两次
curl -s http://localhost:8080/api/processes/$ID
```

应用控制台此时有：

```text
【邮件·模拟】正文：你提交的请假申请（3 天，事由：年假）已审批通过。
【邮件·模拟】  - a：同意（情况属实，批准）
【邮件·模拟】  - b：同意（情况属实，批准）
【邮件·模拟】流程已结束，申请单不可再修改。
```

```bash
# 路径二：任一人不同意 → 短路 → 重填再走一轮（再发起一次，initiator 换小王，提交 {"days":2,"reason":"事假"}）

# 1) a 驳回
cat > leave-reject.json <<'EOF'
{"approved":false,"comment":"事由不明，请补充具体原因"}
EOF
curl -s -X POST http://localhost:8080/api/processes/tasks/<a的会签审批任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @leave-reject.json
# 预期：{"ok":true}；应用控制台打出驳回邮件

# 2) 查 b 待办：空数组——a 的否决把 approvalRejected 置 true，
#    会签完成条件立即满足，b 的任务已被引擎短路删除
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=b"
# 预期：[]

# 3) 小王的重填待办：重新提交时把 days / reason 一组变量重新赋值，新一轮会签从干净状态开始
cat > leave-resubmit.json <<'EOF'
{"days":2,"reason":"事假（补充：家人就医需陪同）"}
EOF
curl -s -G "http://localhost:8080/api/processes/tasks" --data-urlencode "assignee=小王"
curl -s -X POST http://localhost:8080/api/processes/tasks/<新的提交请假单任务id>/complete \
  -H "Content-Type: application/json;charset=UTF-8" --data-binary @leave-resubmit.json

# 4) a、b 再同意 → 结束；历史 activities 里「提交请假单」出现两次（原提交 + 重填）
curl -s http://localhost:8080/api/processes/$ID
```

两条路径都验证过（本机实测，返回值与上面一致）。注意实例 id 是 UUID 形如 `e357e6cd-aced-…`，与控制台版的纯数字 id 不同。

---

## 4. 环境变量

四个数据库相关环境变量都可以覆盖，两个示例通用；不设就用默认值（与主项目 `server/.env` 一致）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | 账号 |
| `DB_PASSWORD` | `helloca` | 密码 |

例如连本机 3307 端口：

```bash
DB_PORT=3307 sh mvnw exec:java          # Git Bash
# PowerShell：$env:DB_PORT="3307"; mvnw.cmd exec:java
```

Boot 版改 HTTP 端口不是这几个变量，见第 7 节「端口 8080 被占」。

---

## 5. 技术点对照表

每个 Flowable 技术点在两种运行方式下分别去哪看：

| 技术点 | 控制台版看哪 | Boot 版看哪 |
|---|---|---|
| 用户任务 / 候选组 | 场景一、二输出与 claim | `tasks?group=compliance` 接口 |
| 排他网关 + UEL 条件 | 金额分支 / 审批结果连线日志 | 同左（监听日志） |
| 并行网关 | 场景二合规 ∥ 预算 | 同左 |
| 调用活动 + 变量映射 | 场景二子流程启动 / 传回 | 同左 |
| 多实例会签 + 完成条件 + 集合变量 | 两条投票监听日志、变量快照 `voteResults` | complete 接口 `voteApproved` |
| 定时边界事件 + 作业执行器 | 场景二 3 秒升级 | PT5S 升级路径 |
| JavaDelegate class + 字段注入 | 【委托】预算核对 / 发送通知 | 服务日志同左 |
| 执行监听器 start / end / take | 【监听】流程启动 / 结束 / 网关流转 | 同左 |
| 任务监听器 create / assignment / complete | 【监听】任务创建 / 分配 / 完成 | 同左 |
| 变量传递 / 局部变量 | 变量快照打印 | history 接口 |
| 驳回回流（含表达式服务任务） | 场景三 | 驳回重填路径 |
| businessKey / 三级历史 | 场景一 history 打印 | history 接口 |

BPMN 里每个技术点的写法都有中文注释，见 `java/flowable-console-demo/src/main/resources/processes/purchase-approval.bpmn20.xml`、`large-amount-approval.bpmn20.xml` 和 `leave-request.bpmn20.xml`（Boot 版 `java/flowable-springboot-demo/src/main/resources/processes/` 下是同一套文件的副本，启动时自动部署）。

---

## 6. Spring 写法对照（delegateExpression）

两个示例的 BPMN 用的是 `flowable:class`（按类名反射实例化），所以同一份 BPMN 在有没有 Spring 的环境里都能跑。Spring 项目里更地道的写法是**把委托注册成 Bean，用 `delegateExpression` 引用**：

```java
@Component("notifyDelegate")
public class NotifyDelegateBean implements JavaDelegate {
    @Override
    public void execute(DelegateExecution execution) {
        // 从 execution 读变量、写结果……
    }
}
```

BPMN 里把服务任务改成：

```xml
<serviceTask id="notifyResult" name="发送通知"
             flowable:delegateExpression="${notifyDelegate}"/>
```

引擎解析 `${notifyDelegate}` 时会从 Spring 容器里取这个 Bean，Bean 里就可以正常 `@Autowired` 其它服务（如邮件、持久层）。

**为什么共享 BPMN 不用它**：控制台版没有 Spring 容器，解析不了 `${notifyDelegate}`（会直接抛异常找不到 Bean），所以示例 BPMN 保留 `flowable:class`，让两版字节级相同；Boot 版的类在同包名下也在 classpath 上，`flowable:class` 一样可用。想体验 Spring 风格，就在 Boot 版里按上面的方式改。

同理，监听器也可以注册成 Spring Bean 后用 `flowable:delegateExpression` 引用；Boot 版里 `RuntimeService` / `TaskService` / `HistoryService` 都是可直接注入的 Spring Bean（见 `ProcessService` 的构造器注入），不需要像控制台版那样手工 `buildProcessEngine()`。

---

## 7. 常见问题

**表已存在 / 想彻底重来**

启动报表已存在或数据混乱时，直接重来最干净：

```sql
DROP DATABASE flowable_demo;
```

然后重跑示例（自动重建库表），或手动执行 `java/sql/` 的两个脚本。

**时区**

JDBC URL 已带 `serverTimezone=Asia/Shanghai`（见 `application.yml` / 控制台版建连代码）。自建连接串时漏掉它，历史时间会出现几小时偏移。注意它与 MySQL 服务器自身时区是两回事。

**重复运行累积部署记录**

每次运行都会往 `ACT_RE_DEPLOYMENT` 新增一条部署记录、流程定义版本号 +1（输出里 `purchaseApproval v6` 就是跑了 6 次的结果）。**无害**，不影响演示；强迫症可以用上面的 `DROP DATABASE` 彻底重来。

**端口 8080 被占**

Boot 版改 `src/main/resources/application.yml` 里的 `server.port`，或启动时带参数：

```bash
sh mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=8081
```

**乐观锁【重试】**

开着异步执行器时办理任务可能撞 `FlowableOptimisticLockingException`（事务已回滚、无副作用），两版服务都内置了重试，日志出现 `【重试】…第 1 次重试…` **属正常**。

**activeTasks 在子流程期间为空**

Boot 版 GET `/api/processes/{id}` 的 `activeTasks` 在调用活动的子流程进行中为空——子流程任务挂在子实例上。这期间用 `tasks?assignee=` / `tasks?group=` 查待办即可，不是 bug。

**控制台版场景二卡住约 10 秒**

不是卡死：程序在等 `PT3S` 定时边界事件被异步执行器（默认约 10 秒一轮）捡起，升级任务出现后自动继续。
