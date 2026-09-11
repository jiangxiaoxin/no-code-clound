package com.example.flowable.demo.delegate;

import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;

/**
 * 【教学点】class 方式的 JavaDelegate：流程走到「预算核对」服务任务时自动执行。
 * 演示：从流程变量读入参（amount），处理完写一个新变量（budgetNote）。
 */
public class BudgetCheckDelegate implements JavaDelegate {

    @Override
    public void execute(DelegateExecution execution) {
        Object amountObj = execution.getVariable("amount");
        long amount = amountObj instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(amountObj));
        String note = "预算充足（金额 " + amount + " 元，走常规预算科目）";
        execution.setVariable("budgetNote", note);
        System.out.println("【委托】预算核对完成：" + note);
    }
}
