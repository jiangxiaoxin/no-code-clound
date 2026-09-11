# 请假单示例设计（flowable-console-demo）

日期：2026-09-10。状态：已按用户确认的设计实现。

## 1. 这是什么

在采购审批示例之外，新增一个**更简单**的独立示例：一张请假单从提交、两人会签、邮件通知到通过或驳回重填的完整生命周期。目的是用一个尽量小的流程看清三件事：

1. **并行会签怎么写、怎么短路**——a、b 同时收到审批待办，全部同意才通过，任一人不同意立即结束会签（没办完的待办直接被删除）。
2. **审批结果怎么通知发起人**——会签结束后必经一个「发送邮件通知」服务任务，日志模拟发邮件，内容带结论和每位审批人的意见明细。
3. **驳回重填怎么回环**——驳回分支直接回到「提交请假单」待办，员工改完重新提交，开启一轮全新审批；通过后流程结束，谁也不能再改。

范围限定：无定时器、无子流程。首期只进控制台版 `flowable-console-demo`；后来（同日）已同步到 Spring Boot 版 `flowable-springboot-demo`——BPMN、监听器、委托类字节级相同，服务端新增 `POST /api/processes/leaves` 发起入口，办理接口按任务名分发（提交请假单带 days/reason，会签审批带 approved/comment），REST 跑法见运行指南 §3.6。

## 2. 流程怎么走

```text
开始 → 提交请假单（发起人待办，兼做驳回后的修改重填入口）
     → 会签审批（a、b 并行多实例）
     → 发送邮件通知（服务任务，JavaDelegate，日志模拟）
     → 审批结果（排他网关）
     ├─ approved == true  → 结束（通过）
     └─ approved == false → 回到「提交请假单」
```

文件：`src/main/resources/processes/leave-request.bpmn20.xml`，process id=`leaveRequest`。

- 「员工提交请假单后开启流程实例」在引擎语义上是：**发起即建实例**，实例停在「提交请假单」待办上，完成这个待办 = 提交表单。这样驳回回环有现成的落点，与采购示例的写法一致。
- 「通过后谁也不可以再修改」不需要任何代码：流程结束就是终态，引擎里没有任何待办，运行时数据清档，历史记录只读。

## 3. 会签与短路（核心教学点）

会签审批是一个**并行多实例**用户任务：

- `flowable:collection="approverList"` 遍历流程变量 `approverList`（默认 `["a","b"]`），`elementVariable="approver"` + `assignee=${approver}` 让 a、b 各拿到一份待办。
- 完成条件 `${nrOfCompletedInstances == nrOfInstances || approvalRejected == true}`：每办完一份任务判断一次。前半句是「人人都办完」；后半句实现**短路**——任何人不同意时监听器把 `approvalRejected` 置为 true，没办完的待办立刻被删除，流程直接往下走。
- 审批人完成任务时提交 `approved`（同意/不同意）和 `comment`（审批意见）。示例代码里意见总是有值；真实系统的必填校验属于表单层，引擎示例不重复做。
- `ApprovalOpinionTaskListener`（taskListener，complete 事件）把「姓名：同意/不同意（意见）」追加进 `opinions` 列表；不同意时同时置 `approvalRejected=true`、`approved=false`。

## 4. 变量初始化与「重置」（拍板记录）

**不设**独立的「重置审批结果」服务任务（采购示例有，这里刻意不要）：发起人完成「提交请假单」时一次性带全整轮审批的根作用域变量——业务数据 `days`、`reason`，加审批状态初始化 `approved=true`、`approvalRejected=false`、`opinions=[]`、`approverList=["a","b"]`。驳回重填再提交时，**同一组键重新赋值就是重置**，新一轮从干净状态开始，顺带支持每轮换审批人。

配套机理：监听器里 `delegateTask.setVariable(...)` 能更新到流程根作用域，靠的是这些变量在提交时已存在（`setVariable` 会沿作用域向上找到已有变量原地更新）；这也是采购示例 `VoteCollectTaskListener` 的同一原理。流程开始时只传 `initiator`（`assignee=${initiator}` 要用），其余变量全部在提交待办完成时进入流程。

## 5. 邮件通知（日志模拟）

`LeaveNotifyDelegate`（class 方式 JavaDelegate）：会签结束后通过、驳回**都**经过它，按当前流程变量拼邮件——结论行看 `approved`，明细逐条打印 `opinions`，落款提示「流程已结束，申请单不可再修改」或「请在『提交请假单』待办中修改后重新提交」。真实系统里把打印换成 SMTP/消息队列调用即可。对照：`NotifyDelegate` 用字段注入固定模板，这里直接读运行时变量，内容随结果变化。

## 6. 文件清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/main/resources/processes/leave-request.bpmn20.xml` | 新增 | 全中文注释的流程定义 |
| `src/main/java/.../listener/ApprovalOpinionTaskListener.java` | 新增 | 收集审批意见、标记驳回 |
| `src/main/java/.../delegate/LeaveNotifyDelegate.java` | 新增 | 邮件通知（日志模拟） |
| `src/main/java/.../LeaveApplication.java` | 新增 | 独立 main 入口 + 两个演示场景 |
| `pom.xml` | 修改 | `exec` 插件 `mainClass` 参数化为 `${exec.mainClass}`（属性默认 ConsoleApplication），使 `-Dexec.mainClass` 可以切换入口；现有 `sh mvnw exec:java` 行为不变 |
| `java/docs/flowable-example-run-guide.md` | 修改 | 新增 §2.7「跑请假单示例」 |
| `java/flowable-console-demo/README.md` | 修改 | 补请假示例运行说明 |

引擎构建与 `ConsoleApplication` 的差异：请假流程**没有定时器**，不调用 `setAsyncExecutorActivate(true)`——少一个后台线程，进程退出更干净（注释里说明与采购示例的对照原因）。

## 7. 演示场景与预期

- **场景一（QJ-20260910-0001，小李，3 天年假）**：提交 → a、b 各一份待办 → 都批准（意见：情况属实，批准）→ 通过邮件（两条意见明细）→ 流程结束，待办数量为 0。
- **场景二（QJ-20260910-0002，小王，2 天事假）**：提交 → a 不同意（意见：事由不明）→ 短路，打印待办列表证明 b 的会签任务已被删除、只剩小王的重填待办 → 驳回邮件 → 小王补全事由重新提交（审批状态重新初始化）→ 这轮 a、b 都批准 → 通过邮件 → 结束。历史轨迹里能看到两条「提交请假单」记录。

运行：

```bash
sh mvnw exec:java -Dexec.mainClass=com.example.flowable.demo.LeaveApplication
# Windows 命令行：mvnw.cmd exec:java -Dexec.mainClass=com.example.flowable.demo.LeaveApplication
```

验证方式：编译零告警、两个场景跑通、输出与运行指南 §2.7 的预期一致（短路删除、两轮意见、两封邮件、结束待办为 0）。

## 8. 不做什么

- 不做定时器、子流程、候选组等采购示例已覆盖的能力。
- 不做审批意见为空的校验（示例代码总是传值，生产由表单层负责）。

同步 Boot 版时新增的一条边界：`POST /api/processes/tasks/{id}/complete` 对「会签审批」校验 `approved` 与 `comment` 必填，缺了抛 `IllegalArgumentException` 返回 HTTP 500（与采购示例一致，不配全局异常处理器）。
