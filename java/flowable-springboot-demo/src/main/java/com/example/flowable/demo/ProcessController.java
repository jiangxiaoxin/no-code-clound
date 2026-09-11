package com.example.flowable.demo;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 用 REST 驱动和控制台版完全相同的流程，便于对照两种接入方式。 */
@RestController
@RequestMapping("/api/processes")
public class ProcessController {

    @GetMapping("/hi")
    public String hi() {
        return "hello from server";
    }

    private final ProcessService processService;

    public ProcessController(ProcessService processService) {
        this.processService = processService;
    }

    /** 发起：POST /api/processes，body 例 {"initiator":"张三","amount":80000,"reason":"采购服务器","timeoutDuration":"PT24H"} */
    @PostMapping
    public Map<String, Object> start(@RequestBody StartRequest req) {
        return processService.start(req.initiator(), req.amount(), req.reason(), req.timeoutDuration());
    }

    /** 发起请假：POST /api/processes/leaves，body 例 {"initiator":"小李"}。
     *  发起后先办「提交请假单」待办（带 days/reason），再办 a、b 的「会签审批」待办（带 approved/comment）。 */
    @PostMapping("/leaves")
    public Map<String, Object> startLeave(@RequestBody StartLeaveRequest req) {
        return processService.startLeave(req.initiator());
    }

    /** 待办：GET /api/processes/tasks?assignee=王主管 或 GET /api/processes/tasks?group=compliance（请假流程按 assignee=a / b 查） */
    @GetMapping("/tasks")
    public List<Map<String, Object>> tasks(@RequestParam(required = false) String assignee,
                                           @RequestParam(required = false) String group) {
        return processService.tasks(assignee, group);
    }

    /** 办理：POST /api/processes/tasks/{taskId}/complete。
     *  不同任务传不同字段：提交请假单 {"days":3,"reason":"年假"}；
     *  会签审批 {"approved":true,"comment":"情况属实，批准"}（comment 必填）；
     *  采购审批/总监/总经理 {"approved":true}；经理投票 {"approved":true}；候选组任务加 "assignee"。 */
    @PostMapping("/tasks/{taskId}/complete")
    public ResponseEntity<Map<String, Object>> complete(@PathVariable String taskId,
                                                        @RequestBody(required = false) CompleteRequest req) {
        processService.complete(taskId,
            req == null ? null : req.assignee(),
            req == null ? null : req.approved(),
            req == null ? null : req.comment(),
            req == null ? null : req.days(),
            req == null ? null : req.reason());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** 历史：GET /api/processes/{instanceId} */
    @GetMapping("/{instanceId}")
    public Map<String, Object> history(@PathVariable String instanceId) {
        return processService.history(instanceId);
    }

    public record StartRequest(String initiator, long amount, String reason, String timeoutDuration) {
    }

    public record StartLeaveRequest(String initiator) {
    }

    public record CompleteRequest(String assignee, Boolean approved, String comment, Long days, String reason) {
    }
}
