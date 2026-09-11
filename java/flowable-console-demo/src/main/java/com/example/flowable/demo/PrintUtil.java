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
