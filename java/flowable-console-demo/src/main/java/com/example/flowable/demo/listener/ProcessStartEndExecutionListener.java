package com.example.flowable.demo.listener;

import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.ExecutionListener;

/**
 * 【教学点】执行监听器（ExecutionListener），挂在 <process> 上监听 start / end：
 * 流程实例启动、结束时各回调一次。
 */
public class ProcessStartEndExecutionListener implements ExecutionListener {

    @Override
    public void notify(DelegateExecution execution) {
        if (EVENTNAME_START.equals(execution.getEventName())) {
            System.out.println("【监听】流程启动：definition=" + execution.getProcessDefinitionId()
                + "，instance=" + execution.getProcessInstanceId()
                + "，businessKey=" + execution.getProcessInstanceBusinessKey());
        } else if (EVENTNAME_END.equals(execution.getEventName())) {
            System.out.println("【监听】流程结束：instance=" + execution.getProcessInstanceId());
        }
    }
}
