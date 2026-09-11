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
