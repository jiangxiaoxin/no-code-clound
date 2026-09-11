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
