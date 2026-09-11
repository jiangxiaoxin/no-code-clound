package com.example.flowable.demo.listener;

import java.util.List;

import org.flowable.engine.delegate.TaskListener;
import org.flowable.task.service.delegate.DelegateTask;

/**
 * 【教学点】会签审批的意见收集与驳回标记：
 * 每份审批任务完成时带变量 approved（true 同意 / false 不同意）和 comment（审批意见），
 * 本监听器把「姓名：同意/不同意（意见）」追加进流程变量 opinions（List&lt;String&gt;）；
 * 任何人不同意就置 approvalRejected=true（会签完成条件读到它立即短路，没办完的待办被删除）、
 * approved=false（网关据此走「驳回」分支）。
 * 变量作用域：approved / approvalRejected / opinions 在发起人提交「请假单」时已初始化在
 * 流程根作用域，这里的 setVariable 会沿作用域向上找到已有变量并原地更新；
 * 驳回重填再提交时，提交任务会把这组变量重新赋值，新一轮从干净状态开始。
 */
public class ApprovalOpinionTaskListener implements TaskListener {

    @Override
    @SuppressWarnings("unchecked")
    public void notify(DelegateTask delegateTask) {
        System.out.println("== ApprovalOpinionTaskListener == notify");
        boolean approved = Boolean.TRUE.equals(delegateTask.getVariable("approved"));
        String comment = String.valueOf(delegateTask.getVariable("comment"));
        String mymsg = String.valueOf(delegateTask.getVariable("hi"));
        System.out.println("【监听】临时添加：" + mymsg);
        String approver = delegateTask.getAssignee();
        List<String> opinions = (List<String>) delegateTask.getVariable("opinions");// 从流程实例里拿出 opinions，下面只是push，不是清空，重置。
        opinions.add(approver + (approved ? "：同意（" + comment + "）" : "：不同意（" + comment + "）"));
        delegateTask.setVariable("opinions", opinions);
        if (approved) {
            System.out.println("【监听】会签审批：" + approver + " 同意，意见已记录");
        } else {
            delegateTask.setVariable("approvalRejected", true);
            delegateTask.setVariable("approved", false);
            System.out.println("【监听】会签审批：" + approver + " 不同意，标记 approvalRejected=true（其余待办将被短路删除）");
        }
    }
}
