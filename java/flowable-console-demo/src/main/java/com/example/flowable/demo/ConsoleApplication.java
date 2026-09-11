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

        // businessKey：业务表主键，用于关联业务数据,如采购单号,请假单号
//        这里因为没有存采购单的数据库表，所以伪造了一个采购单号来做关联
//        实际项目里应该是先存采购单,此时就已经生产了采购单的id,然后再启动流程.启动后流程实例也有id,再回来update采购单的流程实例id,让两边都记得对方
        String businessKey = "CG-" + System.currentTimeMillis() + "-0001";
        var instance = runtimeService.startProcessInstanceByKey(
            "purchaseApproval", businessKey, baseVars("张三", 3000, "采购打印机一台"));
        String pid = instance.getId();
        System.out.println("【发起流程】instance=" + pid + "，businessKey=" + businessKey);
//  这里例子里,start 节点后面跟的第一个 userTask 是用户要提交表单,所以才有了上面模拟提交后,发起了流程实例,然后就要把这个任务给关掉 completeTask,这样流程才能继续往下走
//        userTask 是要等用户的,不会自动执行. 说的是[flowable 不会自动执行],但业务代码可以通过代码执行完
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

/**
 * 完成提交采购申请的任务
 * @param taskService 任务服务对象，用于操作任务相关功能
 * @param pid 流程实例ID，用于标识特定的流程实例
 */
    private static void completeSubmit(TaskService taskService, String pid) {
    // 创建任务查询，根据流程实例ID和任务名称查询任务
        Task submit = taskService.createTaskQuery()
            .processInstanceId(pid).taskName("提交采购申请").singleResult();
    // 完成任务，传入空Map表示不设置任何变量
        taskService.complete(submit.getId(), Map.of());
    // 输出日志信息，表示发起人已完成提交采购申请任务
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
