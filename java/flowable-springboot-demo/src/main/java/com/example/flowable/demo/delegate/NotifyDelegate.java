package com.example.flowable.demo.delegate;

import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;

/**
 * 【教学点】JavaDelegate 的字段注入：BPMN 里用 <flowable:field> 给 to / template 赋值，
 * to 是表达式（取变量 initiator），template 是常量字符串。
 * 生产上真正发通知；这里只打印，方便观察执行时机。
 */
public class NotifyDelegate implements JavaDelegate {

    private Expression to;
    private Expression template;

    @Override
    public void execute(DelegateExecution execution) {
        String receiver = String.valueOf(to.getValue(execution));
        String tpl = String.valueOf(template.getValue(execution));
        boolean approved = Boolean.TRUE.equals(execution.getVariable("approved"));
        String content = approved ? "您的采购申请已通过" : "您的采购申请被驳回";
        System.out.println("【委托】发送通知：to=" + receiver + "，模板=" + tpl + "，内容=" + content);
    }
}
