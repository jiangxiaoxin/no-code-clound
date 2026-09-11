# flowable-console-demo（裸引擎版）

不经过 Spring，用 `StandaloneProcessEngineConfiguration` 直接创建 Flowable 引擎，
`main` 方法按场景一步步跑，每步打印引擎状态。

- 采购审批示例（默认入口 `ConsoleApplication`）：小额批准 / 大额超时升级 / 驳回重填三个场景。
- 请假单示例（`LeaveApplication`）：a、b 并行会签（全同意才通过，任一人不同意即短路）、
  结果邮件通知（日志模拟）、驳回重填。

## 运行

```bash
sh mvnw exec:java        # Windows 命令行：mvnw.cmd exec:java（跑采购审批示例）
sh mvnw exec:java -Dexec.mainClass=com.example.flowable.demo.LeaveApplication   # 跑请假单示例
```

首次运行会自动建 `flowable_demo` 库和引擎表（也可先手动执行 `../sql/` 下的脚本）。
详细说明、预期输出讲解、技术点对照：见 `../docs/flowable-example-run-guide.md`（采购示例 §2.1–2.6，请假示例 §2.7）。
