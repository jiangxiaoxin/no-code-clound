package com.example.flowable.demo.delegate;

import java.util.List;

import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;

/**
 * 【教学点】class 方式服务任务：BPMN 里 flowable:class 指到本类，
 * 引擎走到「发送邮件通知」节点时回调 execute（真实邮件把打印换成调 SMTP / 消息队列即可）。
 * 会签结束后通过、驳回都经过这里：读流程变量拼邮件内容——
 * approved 决定结论行，opinions 是监听器逐条收集的审批意见明细，结尾按结果提示后续动作。
 * 对照 delegate/NotifyDelegate（字段注入固定模板），这里直接读运行时变量，内容随结果变化。
 */
public class LeaveNotifyDelegate implements JavaDelegate {

    @Override
    @SuppressWarnings("unchecked")
    public void execute(DelegateExecution execution) {
        boolean approved = Boolean.TRUE.equals(execution.getVariable("approved"));
        String initiator = String.valueOf(execution.getVariable("initiator"));
        Object days = execution.getVariable("days");
        Object reason = execution.getVariable("reason");
        List<String> opinions = (List<String>) execution.getVariable("opinions");

        System.out.println();
        System.out.println("【邮件·模拟】收件人：" + initiator);
        System.out.println("【邮件·模拟】主题：请假审批结果通知");
        System.out.println("【邮件·模拟】正文：你提交的请假申请（" + days + " 天，事由：" + reason + "）"
            + (approved ? "已审批通过。" : "被驳回。"));
        System.out.println("【邮件·模拟】审批意见明细：");
        for (String opinion : opinions) {
            System.out.println("【邮件·模拟】  - " + opinion);
        }
        if (approved) {
            System.out.println("【邮件·模拟】流程已结束，申请单不可再修改。");
        } else {
            System.out.println("【邮件·模拟】请在「提交请假单」待办中修改后重新提交。");
        }
    }
}
