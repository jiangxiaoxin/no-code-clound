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

    /** 发起请假申请（leaveRequest）：与控制台版 LeaveApplication 一致，发起时只带 initiator——
     *  提交待办的 assignee 要用它；请假天数/事由和整轮审批状态在办理「提交请假单」时一并提交。 */
    public Map<String, Object> startLeave(String initiator) {
        String businessKey = "QJ-" + System.currentTimeMillis();
        var instance = runtimeService.startProcessInstanceByKey("leaveRequest", businessKey, Map.of("initiator", initiator));
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

    /** 办理任务：候选组任务先认领再办理。
     *  按任务名分发提交的变量：经理投票用 voteApproved 表达这一票；
     *  会签审批（请假）用 approved + comment，审批意见必填（接口层校验，引擎不校验）；
     *  提交请假单完成时初始化整轮审批状态——与控制台版 completeSubmit 完全一致，
     *  驳回重提时同一组键重新赋值即完成重置（不设独立「重置」服务任务）。 */
    public void complete(String taskId, String assignee, Boolean approved, String comment, Long days, String reason) {
        Task task = taskService.createTaskQuery().taskId(taskId).singleResult();
        if (task == null) {
            throw new IllegalArgumentException("任务不存在：" + taskId);
        }
        if (task.getAssignee() == null && assignee != null && !assignee.isBlank()) {
            taskService.claim(taskId, assignee);
        }
        Map<String, Object> vars = new HashMap<>();
        if ("提交请假单".equals(task.getName())) {
            if (days == null || reason == null || reason.isBlank()) {
                throw new IllegalArgumentException("提交请假单需要填写 days（请假天数）和 reason（事由）");
            }
            vars.put("days", days);
            vars.put("reason", reason);
            vars.put("approved", true);
            vars.put("approvalRejected", false);
            vars.put("opinions", new ArrayList<String>());
            vars.put("approverList", Arrays.asList("a", "b"));
        } else if ("会签审批".equals(task.getName())) {
            if (approved == null) {
                throw new IllegalArgumentException("会签审批需要传 approved（true 同意 / false 不同意）");
            }
            if (comment == null || comment.isBlank()) {
                throw new IllegalArgumentException("会签审批需要填写审批意见（comment）");
            }
            vars.put("approved", approved);
            vars.put("comment", comment);
        } else if (approved != null && "经理投票".equals(task.getName())) {
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
