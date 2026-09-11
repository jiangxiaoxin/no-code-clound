package com.example.flowable.demo.listener;

import org.flowable.bpmn.model.SequenceFlow;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.ExecutionListener;

/**
 * 【教学点】event="take" 的执行监听器：流程经过某条连线时回调。
 * take 事件里 getCurrentFlowElement() 正是这条 SequenceFlow，能拿到连线名称。
 */
public class GatewayTakeExecutionListener implements ExecutionListener {

    @Override
    public void notify(DelegateExecution execution) {
        if (execution.getCurrentFlowElement() instanceof SequenceFlow flow) {
            System.out.println("【监听】网关流转：经过连线「" + flow.getName() + "」");
        }
    }
}
