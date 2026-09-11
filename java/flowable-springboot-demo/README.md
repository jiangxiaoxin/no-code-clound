# flowable-springboot-demo（Spring Boot 集成版）

用 `flowable-spring-boot-starter` 自动配置引擎并部署 `src/main/resources/processes/` 下的 BPMN，
通过 REST 接口驱动与控制台版完全相同的采购审批流程和请假单流程（并行会签 + 驳回重填）。

## 运行

```bash
sh mvnw spring-boot:run  # Windows 命令行：mvnw.cmd spring-boot:run
```

然后按 `../docs/flowable-example-run-guide.md` 第 3 节的 curl 序列走：采购三种路径见 §3.3–3.5，请假路径见 §3.6（发起入口 `POST /api/processes/leaves`，会签审批的审批意见 `comment` 必填）。
BPMN、委托类、监听器类与 `flowable-console-demo` 字节级相同（同包名），便于对照两种接入方式。
