# 人员单选 / 人员多选 Implementation Plan

> **For agentic workers:** 在 `.worktrees/feat-member-select`、分支 `feat/member-select` 上改。未经使用者要求不 commit、不合 master、不 push。

**Goal:** 做成主表「人员单选 / 人员多选」：调色板可拖；属性配可选范围和取值来源；填报弹框从平台组织选人；库里存用户 id；列表按现名展示。

**Architecture:** 字段 JSON 存 `memberScope`（`all` / `custom` / `dept_field`）和 `optionSource`。运行时弹框只打登录即可的 `GET /api/org/*`，在前端按范围过滤候选人。入库只存正整数 id / id 数组。查询记录时把人员字段 id 并进 `loadUserNames`，列表用这份 map 换姓名。

**Tech Stack:** Vue 3、Element Plus、NestJS、TypeORM MySQL、Mongo 记录库、前端 `node:test`、后端 Jest。

**Spec:** `docs/superpowers/specs/2026-08-31-member-select-design.md`

## Global Constraints

- 只在 `feat/member-select` worktree 改，不改主目录 master。
- 模板不写行内 JS；布局优先 flex；相邻 `el-button` 容器不加 `gap`；`el-dialog` 默认 `draggable`。
- 清除图标必须从 `@element-plus/icons-vue` 导入已有的 `Close`。
- 不删不改使用者已有注释和 `console.log`。
- 不新增 npm 依赖。不自动 git commit。
- 不实现部门选择控件、子表单内人员、人数上限、按人员列复杂筛选、跨应用、设计器预选默认人。
- `flattenFields` 只展开标签页。`dept_field` 只认摊平后 `type === 'dept'`。
- 不把 `member` / `member-multiple` 加入 `SUBFORM_CHILD_TYPES`。
- 人员多选不进 `FILTERABLE_TYPES`、不建 `data.*` 索引。人员单选沿用已有 `member` 索引。

## Design review（对照规格与现码）

规格可按原文做，无需改需求。现码缺口与规格对齐方式：

1. 调色板 `member` 仍在「未完成」、文案是「成员选择」→ 改名「人员单选」并移出未完成，新增 `member-multiple`。
2. `fillValues` 把 `member` 放在 `SKIP_TYPES`，填报不入库 → 移出 SKIP，写入 id。
3. `coerce` 的 `member` 与 `dept` 共用「任意整数」→ 人员改为正整数；多选单独收数组。
4. `loadUserNames` 只收创建人/更新人 → 并入人员字段 id；查询多带 `userNames`，不改 `data` 形状。
5. 停用/删除：弹框接口只返回 `status === 'active'`；回显用 `loadUserNames`（含停用），库里没有则前端显示「已删除」。
6. `dept` 控件未做：「按部门字段」选项仍在，下拉为空并提示先添加部门选择。
7. 联动：`LINKAGE_VALUE_TYPES` 加入两项；单选走记录条数（多条清空+提示）；多选 `pageSize: 100` 按记录收集 id。联动写入不受可选范围限制。
8. 「其他表数据」树排除人员字段。`sourceTypesFor`：单选只对单选，多选只对多选。

---

## File Structure

```text
front/src/components/form-design/memberField.js            # 新建：类型判断、默认值、范围、候选人、id 规范化
front/src/components/form-design/memberField.spec.js       # 新建
front/src/components/form-design/fieldTypes.js             # 人员单选/多选移出未完成
front/src/components/form-design/linkage.js                # LINKAGE_VALUE_TYPES + sourceTypesFor
front/src/components/form-design/FormDesignProps.vue       # 可选范围、自定义弹框、部门字段下拉
front/src/components/form-design/FormDesignCanvasField.vue # 画布人名区（禁用、不打开弹框）
front/src/components/form-design/FormFieldSourcePicker.vue # 排除 member / member-multiple
front/src/components/FormDesignPanel.vue                   # 拖入默认 memberScope + optionSource
front/src/components/form-fill/FormMemberSelect.vue        # 新建：标签 + 选人弹框
front/src/components/form-fill/FormFillField.vue           # 改用 FormMemberSelect
front/src/components/form-fill/fillValues.js               # 持久化、必填、列表列、空值
front/src/components/form-fill/fillValues.spec.js
front/src/components/form-fill/linkageRuntime.js           # 单选/多选联动
front/src/components/form-fill/linkageRuntime.spec.js
front/src/api/org.js                                       # 新建：/org/*
front/src/components/form-workspace/FormRecordList.vue     # 接 userNames
front/src/components/form-workspace/FormRecordCell.vue     # 姓名展示
docs/superpowers/specs/2026-08-27-data-linkage-design.md   # member 行改为已做
server/src/org/org.service.ts                              # 新建：启用组织只读
server/src/org/org.controller.ts                           # 新建：JwtAuthGuard，无管理权限
server/src/org/org.module.ts
server/src/org/org.service.spec.ts
server/src/app.module.ts                                   # 注册 OrgModule
server/src/application/form-record/form-record.coerce.ts
server/src/application/form-record/form-record.coerce.spec.ts
server/src/application/form-record/form-record.import.ts   # member-multiple
server/src/application/form-record/form-record.indexes.ts  # 不加多选
server/src/application/form-record/form-record.service.ts  # loadUserNames + userNames
server/src/application/application.service.ts              # OPTION_FIELD_TYPES
server/src/application/application.module.ts               # 若 query 需要 fields
```

---

### Task 1: 设计器 / 运行时纯函数

**Files:**
- Create: `front/src/components/form-design/memberField.js`
- Test: `front/src/components/form-design/memberField.spec.js`

**Interfaces:**
- Produces: `MEMBER_SCOPES`、`DELETED_MEMBER_LABEL`（`'已删除'`）、`isMemberField`、`createDefaultMemberField`、`normalizeMemberScope`、`deptFieldsForMemberScope`、`positiveIntIds`、`memberValueIds`、`candidateUsers`、`pruneMembersOutOfScope`

- [ ] **Step 1: 写失败测试** `memberField.spec.js`

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DELETED_MEMBER_LABEL,
  candidateUsers,
  createDefaultMemberField,
  deptFieldsForMemberScope,
  isMemberField,
  memberValueIds,
  normalizeMemberScope,
  positiveIntIds,
  pruneMembersOutOfScope,
} from './memberField.js'

test('default field is all + custom optionSource', () => {
  const single = createDefaultMemberField('m1', 'member')
  assert.equal(single.type, 'member')
  assert.equal(single.memberScope, 'all')
  assert.equal(single.optionSource, 'custom')
  const multi = createDefaultMemberField('m2', 'member-multiple')
  assert.equal(multi.type, 'member-multiple')
})

test('isMemberField', () => {
  assert.equal(isMemberField('member'), true)
  assert.equal(isMemberField('member-multiple'), true)
  assert.equal(isMemberField('dept'), false)
})

test('normalizeMemberScope falls back to all', () => {
  assert.equal(normalizeMemberScope('custom'), 'custom')
  assert.equal(normalizeMemberScope('nope'), 'all')
})

test('positiveIntIds de-dupes and keeps order', () => {
  assert.deepEqual(positiveIntIds([2, 0, 2, -1, 3, 'x']), [2, 3])
})

test('deptFieldsForMemberScope only type dept after flatten', () => {
  const fields = [
    { key: 'd1', type: 'dept', title: '部门' },
    { key: 'm1', type: 'member' },
    {
      type: 'tabs',
      panes: [{ id: 'p1', fields: [{ key: 'd2', type: 'dept', title: '页内部' }] }],
    },
  ]
  assert.deepEqual(
    deptFieldsForMemberScope(fields).map((item) => item.key),
    ['d1', 'd2'],
  )
})

test('candidateUsers all / custom union / empty custom / dept_field', () => {
  const users = [
    { id: 1, displayName: '甲', departmentId: 10, roleIds: [100], status: 'active' },
    { id: 2, displayName: '乙', departmentId: 11, roleIds: [], status: 'active' },
    { id: 3, displayName: '丙', departmentId: null, roleIds: [100], status: 'active' },
    { id: 4, displayName: '丁', departmentId: 10, roleIds: [], status: 'disabled' },
  ]
  const departments = [
    { id: 10, name: '研发', parentId: null, status: 'active', children: [
      { id: 11, name: '前端', parentId: 10, status: 'active', children: [] },
    ] },
  ]
  const all = candidateUsers({ memberScope: 'all' }, users, departments, {})
  assert.deepEqual(all.map((u) => u.id), [1, 2, 3])
  const custom = candidateUsers(
    { memberScope: 'custom', memberScopeConfig: { departmentIds: [11], roleIds: [100], userIds: [] } },
    users,
    departments,
    {},
  )
  assert.deepEqual(custom.map((u) => u.id).sort(), [1, 2, 3])
  const empty = candidateUsers(
    { memberScope: 'custom', memberScopeConfig: { departmentIds: [], roleIds: [], userIds: [] } },
    users,
    departments,
    {},
  )
  assert.deepEqual(empty, [])
  const byDept = candidateUsers(
    { memberScope: 'dept_field', sourceDeptFieldKey: 'dept1' },
    users,
    departments,
    { dept1: 10 },
  )
  assert.deepEqual(byDept.map((u) => u.id), [1, 2])
  const noDept = candidateUsers(
    { memberScope: 'dept_field', sourceDeptFieldKey: 'dept1' },
    users,
    departments,
    {},
  )
  assert.deepEqual(noDept, [])
})

test('pruneMembersOutOfScope clears single and filters multiple', () => {
  const allowed = new Set([1, 2])
  assert.equal(pruneMembersOutOfScope('member', 3, allowed), undefined)
  assert.deepEqual(pruneMembersOutOfScope('member-multiple', [1, 3, 2], allowed), [1, 2])
})
```

- [ ] **Step 2: 跑测试应失败**（模块不存在）
- [ ] **Step 3: 实现 `memberField.js`**
  - `all`：只留 `status === 'active'`（接口已过滤时仍再滤一次）。
  - `custom`：所选部门及其**下级**、所选角色、指定 `userIds` 三者并集；停用部门不贡献新人；三个名单都空 → `[]`。
  - `dept_field`：引用值不是正整数部门 id → `[]`；否则该部门及下级里的启用用户。
  - `memberValueIds`：单选一个 id 或空；多选数组。
- [ ] **Step 4: 测试通过**

Run: `node --test front/src/components/form-design/memberField.spec.js`

---

### Task 2: `/api/org/*` 只读接口

**Files:**
- Create: `server/src/org/org.service.ts`、`org.controller.ts`、`org.module.ts`、`org.service.spec.ts`
- Modify: `server/src/app.module.ts` 注册 `OrgModule`
- Create: `front/src/api/org.js`

**Interfaces:**
- `GET /api/org/departments` → 启用部门树 `{ id, name, parentId, children }[]`（不含停用节点）
- `GET /api/org/roles` → `{ id, name, code }[]` 仅启用
- `GET /api/org/users` → `{ id, displayName, departmentId, roleIds }[]` 仅启用；query：`keyword`（displayName / username）、`departmentId`（含下级）、`roleId`
- 不返回 password、email 不是必出（不要 email）
- `@UseGuards(JwtAuthGuard)`，**不要** `PermissionsGuard`

- [ ] **Step 1: 写 Jest**：mock repo，断言停用用户/部门/角色不出现；keyword 命中 displayName；departmentId 含下级；无 password。
- [ ] **Step 2: 实现 OrgService + Controller + Module**
- [ ] **Step 3: `front/src/api/org.js`**：`listOrgDepartmentsApi`、`listOrgRolesApi`、`listOrgUsersApi`

一人一部：用户 `departmentId` 来自 `user_department`（没有则为 `null`）。`roleIds` 来自 `user_role`。

---

### Task 3: 入库 coerce、导入、索引、姓名 map

**Files:**
- Modify: `form-record.coerce.ts` / `.spec.ts`
- Modify: `form-record.import.ts` 加 `member-multiple`
- Modify: `form-record.indexes.ts`：`member` 已在 FILTERABLE，**不要**加 `member-multiple`；补 indexes.spec 断言多选不建索引
- Modify: `application.service.ts` `OPTION_FIELD_TYPES` 加 `member`、`member-multiple`
- Modify: `form-record.service.ts`：`loadUserNames(docs, fields)` 收集 `createdBy`/`updatedBy` 以及人员字段 id（含停用用户）；`query` 返回 `userNames: Record<string, string>`（key 为 id 字符串）；`getOne`/`create`/`update` 在视图上多带 `userNames`（与 data 并列，不写进 `data`）

- [ ] **Step 1: coerce 测试**

```ts
it('member keeps positive int and drops empty', () => {
  expect(coerceRecordData([{ key: 'owner', type: 'member' }], { owner: 8 })).toEqual({ owner: 8 });
  expect(coerceRecordData([{ key: 'owner', type: 'member' }], { owner: '' })).toEqual({});
});
it('member-multiple keeps unique positive ints in order', () => {
  expect(
    coerceRecordData([{ key: 'owners', type: 'member-multiple' }], { owners: [3, 3, 1] }),
  ).toEqual({ owners: [3, 1] });
});
it('rejects non-positive member id', () => {
  expect(() => coerceRecordData([{ key: 'owner', type: 'member' }], { owner: 0 })).toThrow(BadRequestException);
});
```

- [ ] **Step 2: 实现 coerce**（`member` 与 `dept` 拆开：`dept` 保持原整数逻辑）
- [ ] **Step 3: loadUserNames** 用 `flattenFields(fields)` 找出人员字段，从 `doc.data` 取 id。用户不在库里的 id 不进 map（前端显示「已删除」）。

---

### Task 4: 设计器投放和属性面板

**Files:**
- `fieldTypes.js`：`member` 改「人员单选」，新增 `{ type: 'member-multiple', label: '人员多选', icon: User, placeholder: '请选择' }`，二者移到「未完成」注释之上。
- `FormDesignPanel.vue` `createFieldFromItem`：`isMemberField(item.type)` 时写入 `createDefaultMemberField` 的 `memberScope`、`optionSource`。
- `FormDesignProps.vue`：紧挨校验设置之后，`isMemberField` 时：
  1. 可选范围 radio：全部 / 自定义 / 按部门字段
  2. 自定义：设置按钮打开 draggable `el-dialog`，勾选部门树、角色、人员；已设置文案「已设置可选范围」；清除 `ElMessageBox.confirm`
  3. 按部门字段：`el-select` 绑定 `sourceDeptFieldKey`，options 来自 `deptFieldsForMemberScope`；无选项时 placeholder「请先添加部门选择字段」
  4. 取值来源走已有 `hasLinkageSource`（Task 6 加类型后出现）
- `FormDesignCanvasField.vue`：人员用禁用的人名标签区（可复用 `FormMemberSelect` 的 `preview` 或本地只读标签），不打开弹框。
- 模板事件抽到 script 函数。

---

### Task 5: 填报控件、必填、禁用、可修改

**Files:**
- Create: `front/src/components/form-fill/FormMemberSelect.vue`
- Modify: `FormFillField.vue` 替换 disabled `el-select`
- Modify: `fillValues.js` / `.spec.js`

行为：

- 从 `SKIP_TYPES` 去掉 `member`（`dept`/`relate` 仍 skip）。`member-multiple` 本来就不在 SKIP。
- `persistsValue`：fillable 已覆盖。
- `emptyValue`：多选 `[]`，单选 `undefined`。
- `isEmptyValue`：单选无正整数；多选空数组。
- `isListColumn`：加上 `member`、`member-multiple`。
- `cloneRecordValues`：单选整数；多选拷贝数组。
- `serializeValue`：走 id / 数组。
- 必填：`isFillable` 为 true 后现有 `firstRequiredError` 即可。
- 控件：flex 换行标签 + 每人 `Close`；`@click.stop` 清除不打开弹框。点空白打开弹框。
- 弹框：标题「选择人员」，宽 720px，`draggable`。左栏部门/角色/人员（`dept_field` 不要角色）。右栏人员列表。顶栏即时过滤当前列表。单选点行即关；多选勾选 + 确定。
- `disabled` 或（`updating && editable === false`）：不打开、不清除。由 `FormFillField` 传入 `locked`。
- 打开弹框时拉 `/api/org/*`。候选人用 `candidateUsers`。
- 已选但不在候选人里：标签仍显示，弹框不勾选。
- 范围=自定义且候选人空：弹框提示「没有可选择的人员」。
- `dept_field`：watch 引用字段值，`pruneMembersOutOfScope` 后 `update:modelValue`（在 `FormFillGrid` 或控件内 watch `recordValues`）。

`fillValues.spec.js` 补：

```js
test('member single persists id; multiple persists unique ids; required', () => {
  const one = { key: 'owner', type: 'member', title: '负责人', required: true }
  const many = { key: 'owners', type: 'member-multiple', title: '成员' }
  assert.equal(isFillable(one), true)
  assert.equal(isListColumn(one), true)
  assert.equal(isInlineEditable(one), false)
  assert.deepEqual(buildRecordData([one], { owner: 9 }), { owner: 9 })
  assert.deepEqual(buildRecordData([many], { owners: [1, 1, 2] }), { owners: [1, 2] })
  assert.equal(validateRequired([one], { owner: undefined }), '请填写「负责人」')
})
```

---

### Task 6: 数据联动与列表姓名

**Files:**
- `linkage.js`：`LINKAGE_VALUE_TYPES` 加入 `member`、`member-multiple`；`sourceTypesFor` 各自只返回自己。
- `linkageRuntime.js`：
  - `linkageQueryPaging`：`member-multiple` 与图片一样 `{ page: 1, pageSize: 100 }`；人员单选仍 `pageSize: 2`。
  - `applyLinkageResult`：人员单选按**匹配记录条数**（0 清空；1 写该记录的 userId，值是数组则只取一个 id；>1 清空 + `linkageManyMessage`）。人员多选：0 → `[]`；否则按记录顺序收集 id、去重保序，不清空提示。
- `FormFieldSourcePicker.vue`：`treeData` filter 再排除 `member`、`member-multiple`。
- `FormRecordList.vue`：保存 `query.userNames`，传给 cell。
- `FormRecordCell.vue` / `formatCellValue`：人员用 names map，缺名显示「已删除」；多选用顿号连接，`title` 为全称。
- `docs/superpowers/specs/2026-08-27-data-linkage-design.md`：成员行改为已实现人员单选/多选；部门仍未完成。

`hasCurrentValue`：人员多选数组非空视为已填（联动条件字段引用）。

---

### Task 7: 自测

```text
node --test front/src/components/form-design/memberField.spec.js front/src/components/form-fill/fillValues.spec.js front/src/components/form-fill/linkageRuntime.spec.js
npx jest src/org/org.service.spec.ts src/application/form-record/form-record.coerce.spec.ts src/application/form-record/form-record.indexes.spec.ts
```

对照规格 §11 清单走一遍设计器 + 填报（若本机前后端已起）。普通登录账号打 `/api/org/users` 应 200 不是 403。

---

## Spec coverage

| 规格节 | 任务 |
|---|---|
| §1 两个类型、存 id、停用/已删除、导入 skip、不做部门控件 | 1, 3, 4, 5 |
| §3 字段配置、属性面板、画布 | 4 |
| §4 值形状、loadUserNames | 3, 5, 6 |
| §5 可选范围、改部门清人 | 1, 5 |
| §6 选人弹框 | 2, 5 |
| §7 标签+清除+必填 | 5 |
| §8 `/api/org/*` | 2 |
| §9 联动、OPTION_FIELD_TYPES、排除他表树 | 6 |
| §10 列表姓名、导入、索引 | 3, 6 |
| §11 验收 | 7 |
