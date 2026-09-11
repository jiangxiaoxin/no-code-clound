package com.example.flowable.demo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.flowable.engine.ProcessEngine;
import org.flowable.engine.ProcessEngineConfiguration;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.impl.cfg.StandaloneProcessEngineConfiguration;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.task.api.Task;

/**
 * 请假单示例教学入口：并行会签（全部同意才通过，任一人不同意即短路）+ 结果邮件通知 + 驳回重填。
 * 场景一：小李请 3 天年假——a、b 全部同意，通过邮件，流程结束后谁也不能再改
 * 场景二：小王请 2 天事假——a 驳回触发短路（b 的待办被删），驳回邮件，修改重填后再通过
 * 运行：sh mvnw exec:java -Dexec.mainClass=com.example.flowable.demo.LeaveApplication
 *      （Windows 命令行：mvnw.cmd exec:java -Dexec.mainClass=...）
 * 流程定义与注释：resources/processes/leave-request.bpmn20.xml
 * 设计说明：../docs/2026-09-10-leave-request-example-design.md
 */
public class LeaveApplication {

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
            .setDatabaseSchemaUpdate(ProcessEngineConfiguration.DB_SCHEMA_UPDATE_TRUE)
            .setEngineName("我测试用的请假");
        // 对照采购示例（ConsoleApplication）：请假流程没有定时器，不调用 setAsyncExecutorActivate(true)，
        // 不需要异步执行器后台线程，引擎关闭和进程退出都更干净

        ProcessEngine engine = cfg.buildProcessEngine();
        System.out.println("【引擎】Flowable 启动完成：" + engine.getName());

        RepositoryService repositoryService = engine.getRepositoryService();

        long alreadyDeployCount = repositoryService.createProcessDefinitionQuery().processDefinitionKey("leaveRequest").count();

        // 想彻底重来：DROP DATABASE flowable_demo 后重跑
//        现在这么写只是简单学习。跳过重新部署后，那后面xml更新了也不会重新部署，生成新版本了
        if( alreadyDeployCount > 0) {
            System.out.println("【引擎】BPMN 部署记录已存在，跳过部署。");
        } else {
            System.out.println("【引擎】BPMN 部署记录不存在，开始部署。。。。。");
            repositoryService.createDeployment()
                    .name("请假申请审批演示")
                    .addClasspathResource("processes/leave-request.bpmn20.xml")
                    .deploy();
            System.out.println("【引擎】BPMN 部署完成");
        }

        System.out.println("当前最新版本流程定义：");
//        上面的deploy可以部署很多不同的xml
        for (ProcessDefinition pd : repositoryService.createProcessDefinitionQuery().latestVersion().list()) {
            System.out.println("   " + pd.getKey() + " v" + pd.getVersion() + "（" + pd.getName() + "）");
        }

        try {
//            scenario1AllApproved(engine);
            scenario2RejectAndResubmit(engine);
        } catch (Throwable t) {
            // 演示入口不静默吞错：把异常原样打出来，便于对照引擎状态排查
            System.out.println("【异常】场景执行失败：" + t);
            t.printStackTrace();
            throw t;
        } finally {
            // 关引擎停掉内部线程，进程才能正常退出
            engine.close();
        }

        System.out.println("===============================");
        System.out.println("【引擎】请假示例演示完毕。");
        System.out.println("===============================");
    }

    /** 场景一：a、b 全部同意 → 通过邮件（含意见明细）→ 流程结束，待办清空。 */
    private static void scenario1AllApproved(ProcessEngine engine) {
        RuntimeService runtimeService = engine.getRuntimeService();
        TaskService taskService = engine.getTaskService();

        PrintUtil.banner("场景一：小李请 3 天年假——a、b 全部同意");

        // 发起实例时只带 initiator（提交待办的 assignee 要用）；
        // 业务数据与审批状态在完成「提交请假单」时一起提交（见 completeSubmit）
        String businessKey = "QJ-" + System.currentTimeMillis();
        var instance = runtimeService.startProcessInstanceByKey(
            "leaveRequest", businessKey, Map.of("initiator", "小李"));
        String pid = instance.getId(); // 流程实例id
        System.out.println("【发起】instance=" + pid + "，businessKey=" + businessKey);

//        这两个查询出来的list 是一样的，因为userTask 是同一个 。一个根据id 一个根据name
        List<Task> alist = taskService.createTaskQuery().processInstanceId(pid).taskDefinitionKey("submitLeave").list();
        List<Task> blist = taskService.createTaskQuery().processInstanceId(pid).taskName("提交请假单").list();
        System.out.println("00000000000000000000000000000000000000000000000");
        System.out.println("a.length=" + alist.size() + "，b.length=" + blist.size());
//        if(alist.size() == blist.size()) {
//            int length = alist.size();
//            for(int i=0;i<length;i++) {
//                Task atask = alist.get(i);
//                Task btask = blist.get(i);
//                System.out.println("a=" + atask.getId() + "，b=" + btask.getId());
//                System.out.println(atask.equals(btask));
//                System.out.println(atask ==  btask);
//            }
//        }

        System.out.println("00000000000000000000000000000000000000000000000");

        completeSubmit(taskService, pid, 3, "年假");

        List<Task> approvals = taskService.createTaskQuery().processInstanceId(pid).taskName("会签审批").list();
        PrintUtil.tasks("当前待办（a、b 两份会签任务）", approvals);
        for (Task approval : approvals) {
            taskService.complete(approval.getId(), Map.of("approved", true, "comment", "情况属实，批准", "hi",  "我自己传递进去的"));
            System.out.println("【办理】" + approval.getAssignee() + " 批准");
        }
        // 两份都办完：完成条件 nrOfCompletedInstances == nrOfInstances 命中，会签结束
        // → 「发送邮件通知」服务任务打印通过邮件 → 网关走「通过」→ 流程结束

        long todoAfterEnd = taskService.createTaskQuery().processInstanceId(pid).count();
        System.out.println("【核对】流程结束后的待办数量：" + todoAfterEnd + "（应为 0，谁也不能再改）");
        PrintUtil.history(engine.getHistoryService(), pid);
    }

    /** 场景二：a 驳回，短路 → 驳回邮件 → 员工修改重填 → 这轮 a、b 全同意 → 通过。 */
    private static void scenario2RejectAndResubmit(ProcessEngine engine) {
        RuntimeService runtimeService = engine.getRuntimeService();
        TaskService taskService = engine.getTaskService();

        PrintUtil.banner("场景二：小王请 2 天事假——a 驳回短路，修改重填后再通过");

        String businessKey = "QJ-" + System.currentTimeMillis();
        var instance = runtimeService.startProcessInstanceByKey(
            "leaveRequest", businessKey, Map.of("initiator", "小王"));
        String pid = instance.getId();
        System.out.println("【发起】instance=" + pid + "，businessKey=" + businessKey);

        completeSubmit(taskService, pid, 2, "事假"); // 完成提交了

        List<Task> approvals = taskService.createTaskQuery().processInstanceId(pid).taskName("会签审批").list();
        System.out.println("【核对】当前待办数量：" + approvals.size() + "（应为 2）");
        PrintUtil.tasks("当前待办（a、b 两份会签任务）", approvals);

        Task taskA = approvals.stream().filter(t -> "a".equals(t.getAssignee())).findFirst().orElseThrow();
        taskService.complete(taskA.getId(), Map.of("approved", false, "comment", "事由不明，请补充具体原因"));
        System.out.println("【办理】a 不同意（完成条件 approvalRejected==true 命中，会签短路）");

        // a 办结的那一刻：b 的待办被删除 → 驳回邮件已打印 → 网关走「驳回」→ 小王的重填待办已生成
        List<Task> afterShortCircuit = taskService.createTaskQuery().processInstanceId(pid).list();
        PrintUtil.tasks("a 办结后的待办（b 的会签任务已被短路删除，只剩小王的重填待办）", afterShortCircuit); // size=1

        Task resubmit = afterShortCircuit.stream()
            .filter(t -> "提交请假单".equals(t.getName())).findFirst().orElseThrow();
        taskService.complete(resubmit.getId(), Map.of(
            "days", 2,
            "reason", "事假（补充：家人就医需陪同）",
            "approved", true,
            "approvalRejected", false,
            "opinions", new ArrayList<String>(),
            "approverList", List.of("a", "b")));
        System.out.println("【办理】小王补全事由重新提交（同一组键重新赋值，新一轮从干净状态开始）");

        List<Task> approvals2 = taskService.createTaskQuery().processInstanceId(pid).taskName("会签审批").list();
        PrintUtil.tasks("新一轮会签待办（opinions 已清空）", approvals2);
        for (Task approval : approvals2) {
            taskService.complete(approval.getId(), Map.of("approved", true, "comment", "补充后合理，批准"));
            System.out.println("【办理】" + approval.getAssignee() + " 批准");
        }

        long todoAfterEnd = taskService.createTaskQuery().processInstanceId(pid).count();
        System.out.println("【核对】流程结束后的待办数量：" + todoAfterEnd + "（应为 0）");
        PrintUtil.history(engine.getHistoryService(), pid);
    }

    /** 完成「提交请假单」待办：业务数据 + 整轮审批状态初始化一次带全；驳回重提时同一组键重新赋值即重置。 */
    private static void completeSubmit(TaskService taskService, String pid, int days, String reason) {
        Task submit = taskService.createTaskQuery().processInstanceId(pid).taskName("提交请假单").singleResult();
        taskService.complete(submit.getId(), Map.of(
            "days", days,
            "reason", reason,
            "approved", true,
            "approvalRejected", false,
            "opinions", new ArrayList<String>(), // 提交申请时，opinions 被重置。
            "approverList", List.of("a", "b")));
        System.out.println("【办理】提交请假单（" + days + " 天，事由：" + reason + "），审批状态已初始化");
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? def : v;
    }
}
