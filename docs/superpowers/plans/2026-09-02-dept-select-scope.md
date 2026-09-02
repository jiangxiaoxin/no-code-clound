# 部门可选范围与取值来源 Implementation Plan

> **For agentic workers:** 在本地 `master` 上改。未经使用者要求不 commit、不 push。

**Goal:** 部门单选 / 多选对齐简道云：属性有可选范围和取值来源；多选树复选框勾父级带下级；空值可按当前用户所在部门预填。

**Architecture:** 字段 JSON 存 `deptScope`（`all` / `custom`）和 `optionSource`（`custom` / `current_user_dept` / `linkage`）。运行时用组织部门树按范围裁剪；多选 `el-tree` 默认级联勾选。登录人部门 id 来自 `user.departmentIds[0]`。

**Tech Stack:** Vue 3、Element Plus、现有 `/api/org/departments`、前端 `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-02-dept-select-design.md`

## Global Constraints

- 在 `master` 上改，不开分支、不开 worktree。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 容器不加 `gap`；`el-dialog` 默认 `draggable`。
- 图标只从 `@element-plus/icons-vue` 导入已有导出。
- 不删不改使用者已有注释和 `console.log`。
- 不新增 npm 依赖。不自动 git commit。
- 文档和代码 UTF-8。改完对照界面用例。

---

## File Structure

```text
docs/superpowers/specs/2026-09-02-dept-select-design.md   # 规格（已写）
docs/superpowers/plans/2026-09-02-dept-select-scope.md    # 本计划
front/src/components/form-design/deptField.js             # 范围、树裁剪、默认值
front/src/components/form-design/deptField.spec.js
front/src/components/form-design/linkage.js               # 取值来源增加当前用户所在部门
front/src/components/form-design/FormDesignProps.vue      # 可选范围 UI
front/src/components/FormDesignPanel.vue                  # 拖入默认 deptScope
front/src/components/form-fill/FormDeptSelect.vue         # 范围树、多选复选框、预填
docs/testcases/2026-09-02-dept-select-test-cases.md
docs/testcases/README.md
docs/testcases/2026-08-31-complex-form-manual-tests.md
```

---

### Task 1: 纯函数 —— 范围、裁剪树、默认部门

**Files:**
- Modify: `front/src/components/form-design/deptField.js`
- Test: `front/src/components/form-design/deptField.spec.js`

**Produces:**
- `DEPT_SCOPES = ['all', 'custom']`
- `normalizeDeptScope(value) => 'all' | 'custom'`
- `hasCustomDeptScope(field) => boolean`
- `allowedDeptIds(field, departments) => Set<number>`
- `filterDeptTree(nodes, allowedIds) => tree`
- `collectDeptTreeIds(nodes) => number[]`
- `currentUserDeptId(user) => number | undefined`
- `defaultDeptValue(field, user) => number | number[] | undefined`

- [ ] 先写失败测试：自定义范围含父级时下级也在 allowed；父级不在范围时子级提到根；`current_user_dept` 且范围内才返回默认值。
- [ ] 实现上述函数。
- [ ] `node --test front/src/components/form-design/deptField.spec.js` 通过。

---

### Task 2: 设计器属性 —— 可选范围 + 取值来源选项

**Files:**
- Modify: `front/src/components/form-design/linkage.js`（`optionSourceChoices`）
- Modify: `front/src/components/form-design/FormDesignProps.vue`
- Modify: `front/src/components/FormDesignPanel.vue`

- [ ] `optionSourceChoices('dept')` 为：自定义、当前用户所在部门、数据联动。
- [ ] 部门字段属性：可选范围全部/自定义；自定义弹框只勾部门树（复选框级联）；取值来源沿用现有 `hasLinkageSource` 那一块，联动设置仅 `optionSource === 'linkage'`。
- [ ] `createFieldFromItem` 写入 `deptScope: 'all'`。

---

### Task 3: 填报弹框 —— 范围树、多选复选框、预填

**Files:**
- Modify: `front/src/components/form-fill/FormDeptSelect.vue`

- [ ] 加载组织树后按 `allowedDeptIds` + `filterDeptTree` 展示。
- [ ] 多选：`show-checkbox`，不要 `check-strictly`，`@check` 用 `getCheckedKeys(false)` 作为草稿。
- [ ] 单选：无复选框，点节点选一个。
- [ ] 挂载时若值为空且 `optionSource === 'current_user_dept'`，写入登录人第一个部门（须在范围内）。只写一次。

---

### Task 4: 手工用例

**Files:**
- Modify: `docs/testcases/2026-09-02-dept-select-test-cases.md`
- Modify: `docs/testcases/README.md`（容易误判如需要）
- Modify: `docs/testcases/2026-08-31-complex-form-manual-tests.md`（能力表如需要）

- [ ] D-01 改为要有可选范围和取值来源三项。
- [ ] 补自定义范围、勾父级带下级、当前用户所在部门预填。

---

### Task 5: 跑测试

```text
node --test front/src/components/form-design/deptField.spec.js front/src/components/form-design/linkage.spec.js
```
