# 应用内功能目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点进应用后，左栏用一层分组 + 表单树管理目录，右栏本期空着。

**Architecture:** 在现有 `application` 模块扩展：`GET /apps/:id`、directory、分组/表单 CRUD。两张表 `app_group`、`app_form`，名称可重复，用 id 区分。前端新增 `/apps/:id` 工作台，首页卡片跳入。

**Tech Stack:** Vue 3, Vite, Vue Router, Element Plus, NestJS, TypeORM, MySQL 8, Jest.

## Global Constraints

- 接口前缀 `/api`，JWT 保护，仅应用主人可操作。
- 名称 trim 后 1–32 字；同名允许，不对 `name` 建唯一索引、不返回 409。
- 分组一层；表单 `groupId` 可空（根上）；非空分组不可删。
- TypeORM `synchronize: false`；建表须使用者同意。
- 后端按 TDD：先写失败测试再实现。前端无单测，手动走通。
- 未经使用者明确要求，不执行 git commit。

## File Structure

```text
server/src/application/
  application.entity.ts          # 已有
  app-group.entity.ts            # 新建
  app-form.entity.ts             # 新建
  application.service.ts         # 扩展
  application.service.spec.ts    # 扩展
  application.controller.ts      # 扩展
  application.module.ts          # 注册新 entity
  dto/create-application.dto.ts  # 已有
  dto/name.dto.ts                # 分组/表单改名共用
  dto/create-form.dto.ts         # name + 可选 groupId
front/src/
  api/apps.js                    # 扩展
  router/index.js                # 加 /apps/:id
  views/HomeView.vue             # 卡片可点
  views/AppWorkspaceView.vue     # 新建工作台
```

---

### Task 1: 后端 directory 与 CRUD（TDD）

**Files:**
- Create: `server/src/application/app-group.entity.ts`
- Create: `server/src/application/app-form.entity.ts`
- Create: `server/src/application/dto/name.dto.ts`
- Create: `server/src/application/dto/create-form.dto.ts`
- Modify: `server/src/application/application.service.spec.ts`
- Modify: `server/src/application/application.service.ts`
- Modify: `server/src/application/application.controller.ts`
- Modify: `server/src/application/application.module.ts`

**Interfaces:**
- `getOne(ownerId, id) => { id, name, icon }`，否则 `NotFoundException('应用不存在')`
- `directory(ownerId, id) => { groups: [{ id, name, forms }], forms }`
- `createGroup(ownerId, appId, { name }) => { id, name }`
- `renameGroup(...) => { id, name }`
- `deleteGroup(...) => void`；组内有表单则 `BadRequestException('请先删除分组内的表单')`
- `createForm(ownerId, appId, { name, groupId? }) => { id, name, groupId }`
- `renameForm(...) => { id, name, groupId }`
- `deleteForm(...) => void`

- [ ] 先写 `application.service.spec.ts` 失败用例（详情 404、directory 排序、同名允许、非法 groupId、非空分组不可删、改名/删除）
- [ ] `npx jest application.service.spec.ts` 确认因方法不存在而失败
- [ ] 实现 entity、dto、service、controller
- [ ] 再跑测试至通过
- [ ] **停下来问使用者是否同意 `CREATE TABLE app_group / app_form`**，未同意不执行 SQL

### Task 2: 前端工作台

**Files:**
- Modify: `front/src/api/apps.js`
- Modify: `front/src/router/index.js`
- Modify: `front/src/views/HomeView.vue`
- Create: `front/src/views/AppWorkspaceView.vue`

- [ ] 首页卡片 `@click` 进入 `/apps/:id`
- [ ] 工作台：左栏返回箭头 + 应用名；搜索 + 加号下拉；`el-tree`；右栏空
- [ ] 树节点 key 用 `group:${id}` / `form:${id}`，避免两组自增 id 撞车
- [ ] 对话框新建/改名；删除确认；非空分组本地提示不弹确认
- [ ] 应用 404 回 `/`（http 拦截器已弹 `message`）

### Task 3: 验证

- [ ] `npm test --prefix server -- application.service.spec.ts`
- [ ] 使用者同意建表后，手动：进入应用 → 建分组/表单 → 搜索 → 改名 → 删除
