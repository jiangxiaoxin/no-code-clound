# 登录注册明亮蓝插图 Implementation Plan

> 本计划对应 `docs/superpowers/specs/2026-08-19-auth-bright-blue-illustration-design.md`。视觉改动，无后端测试。

**Goal:** 登录/注册改为左亮蓝插图、右白底表单。

**Architecture:** 生成一张扁平插图放入 `front/src/assets/`，用 `el-row` 两列布局，样式集中在 `auth.less`。鉴权逻辑不动。

**Tech Stack:** Vue 3、Element Plus、Less、Vite。

## Global Constraints

- 插图禁止文字
- 电光蓝 `#1E50FF`，右栏白底 `#FFFFFF`
- 不改后端、首页、路由守卫
- 不提交 git，除非使用者明确要求

---

### Task 1: 插图资源

**Files:**
- Create: `front/src/assets/auth-illustration.png`

- [x] 按参考画风生成无代码主题四人插图
- [x] 复制到 `front/src/assets/auth-illustration.png`

### Task 2: 分栏布局与明亮样式

**Files:**
- Modify: `front/src/styles/auth.less`
- Modify: `front/src/views/LoginView.vue`
- Modify: `front/src/views/RegisterView.vue`

- [x] 左 `md=14` 插图列 + 右 `md=10` 表单列；窄屏 `xs=24` 上图下表单
- [x] 去掉暗金毛玻璃、噪点层、`auth-bg.jpg` 引用
- [x] 右栏白底深字，主按钮与品牌色 `#1E50FF`

### Task 3: 目视验收

- [ ] 打开 `http://localhost:5173/login`：左图右表单、无暗遮罩
- [ ] 打开 `/register`：同一套视觉
- [ ] 缩窄窗口：插图在上、表单在下
