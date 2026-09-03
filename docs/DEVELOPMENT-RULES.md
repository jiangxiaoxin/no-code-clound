# 开发规则维护说明

本项目同时支持 Codex 和 Cursor 两种开发工具。为了避免规则分叉，项目规则按下面的方式维护：

| 工具 | 规则入口 | 文件格式 |
| --- | --- | --- |
| Codex | 根目录 `AGENTS.md` | Markdown（轻量标记语言） |
| Cursor | `.cursor/rules/` | MDC（带元数据的 Markdown 规则文件） |

## 同步约定

1. 新增或修改开发规则时，同时更新 `AGENTS.md` 和对应的 `.cursor/rules/*.mdc`。
2. Codex 版本使用章节和条目表达适用范围；Cursor 版本保留 `description`、`globs`、`alwaysApply` 等元数据。
3. 两个版本的措辞可以适配工具格式，但约束含义、例外条件和禁止事项必须一致。
4. `docs/superpowers/` 用于功能设计与实施记录，`docs/TODO.md` 用于待办，不作为工具规则入口。

## 当前规则范围

- 默认在 `master` 分支开发；未经使用者允许不创建分支或 worktree。
- 保持实现简单，避免无需求的抽象。
- 前端优先使用 Element Plus（Vue 组件库）和 Flex 布局。
- 不使用 `el-text`、`el-space`；按钮容器不重复设置 `gap`。
- `el-dialog` 默认可拖拽，模板中不写行内 JavaScript（JavaScript，脚本语言）。
- 使用图标前必须查验 `@element-plus/icons-vue` 是否有对应导出。
- 日期时间处理优先使用 dayjs，复用 `front/src/utils/timeValue.js`。
- 保留用户注释、日志和日志文件。
- Git 提交信息使用具体、清晰的中文描述。
- 设计文档、实现计划、测试用例、使用说明用人话写，不允许只用规格黑话。
