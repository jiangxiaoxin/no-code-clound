# 选择数据弹窗：人员 / 部门列误显示「已删除」

日期：2026-09-03  
状态：已修复  
范围：选择数据 `data` 的选记录弹窗，以及主表选择数据「显示在表单中的字段」预览。主表、子表共用 `FormDataSelect.vue`。  
对照手工用例：`docs/testcases/2026-08-30-subform-test-cases.md` **P-20**、**G-01**；组合 `2026-08-31-complex-form-manual-tests.md` **L-07**；纲领 `docs/testcases/README.md` 容易误判。

## 1. 问题表现

填报时点主表（或子表）的选择数据 `data`，弹出「选择数据」表格。源表（例如设备台账）若有人员单选 `member`（标题常为「负责人」）或部门单选 `dept`（标题常为「所属部门」），**已经填过的行**这两列一律显示 **「已删除」**，而不是那个人的显示名、那个部门的名称。

同一弹窗里：

| 列 | 修前实际看到的 |
|---|---|
| 负责人 / 所属部门（源记录里有值） | 「已删除」 |
| 负责人 / 所属部门（源记录没填） | 空，这是对的 |
| 创建人 | 正常显示姓名（例如「我是管理员…」） |
| 设备编号、设备名称、图片、文件等 | 正常 |

数据管理列表、添加/编辑抽屉里**源表自己的**负责人和所属部门是正常姓名。只有「从别的表点选择数据、弹出源表记录列表」这条路径坏了。

期望：人还在用户表、部门还在组织树里时，弹窗显示对应姓名和部门名。「已删除」只留给人已经从库里消失、或部门已经不在组织树里的情况。

## 2. 不是数据被删了

容易看成「源记录引用的用户/部门被软删了」。证据不支持：

- 同一条设备台账，在数据管理打开是正常姓名。
- 「创建人」走记录上的 `createdByName`，弹窗里是对的；「负责人」走字段值里的用户 id，弹窗里变成「已删除」。
- 没填这两项的行是空的，说明空值路径没问题，坏的是「有 id 却解析不出名字」。

根因是**弹窗格式化单元格时没把姓名表传进去**，查不到名字就走了人员/部门控件的兜底文案「已删除」。

## 3. 原因

弹窗每个非图片单元格走 `formatRecordField` → `formatCellValue`。

`formatCellValue`（`front/src/components/form-fill/fillValues.js`）对人员、部门列按 **id 查名字表**：

- 人员：`memberDisplayName(id, userNames)`，没有名字则返回「已删除」（`DELETED_MEMBER_LABEL`）。
- 部门：`deptDisplayName(id, deptNames)`，没有名字则返回「已删除」（`DELETED_DEPT_LABEL`）。

修前 `FormDataSelect.vue` 只传了字段、单元格值、字典，**第 4、第 5 个参数 `userNames` / `deptNames` 都没传**，运行时是 `undefined`。只要源表有人员或部门列且格子里有 id，弹窗必然全是「已删除」。

数据管理列表（`FormRecordList.vue`）和填报表单（`FormFillGrid.vue`）之所以正常，是因为它们自己准备了这两张表再传给 `formatCellValue`。

## 4. 两类名字来源不一样

| 列 | 名字从哪来 | 修前弹窗有没有用 |
|---|---|---|
| 创建人 / 更新人 | 记录上的 `createdByName` / `updatedByName`，`formatRecordField` 单独分支，不走 `formatCellValue` | 有，所以看起来正常 |
| 人员单选 / 人员多选 | 后端 `queryFormRecords` 会扫记录里的人员字段 id（`collectMemberIds`），随结果带回顶层 `userNames`；单条 `get` 也会把 `userNames` 挂在那条记录上 | 接口已经返回了，弹窗丢掉没用 |
| 部门单选 / 部门多选 | 记录接口**不**返回部门名。前端统一 `GET /api/org/departments`，再用 `flattenDeptNames` 摊平 | 弹窗根本没请求 |

因此修复只动选择数据组件，**不必改后端、也不必改 `formatCellValue` 的兜底文案**。

## 5. 修复方案

只改 `front/src/components/form-fill/FormDataSelect.vue`（主表和子表共用，两边一起好）。

1. **人员名**：`loadRecords` 把 `query` 结果的 `userNames` 合并进 `sourceUserNames`（翻页累积，和子表联动里攒 `linkageUserNames` 同一做法）。已选回显走 `getFormRecordApi` 时，再合并该条上的 `userNames`，这样主表「显示在表单中的字段」预览也能显示姓名。
2. **部门名**：`loadSource` 拿到源表字段后，若存在部门单选/多选（`isDeptField`），调一次 `listOrgDepartmentsApi()` → `flattenDeptNames`，存进 `sourceDeptNames`。源表没有部门列就不请求。画布 `preview` 占位不请求。
3. **格式化**：`formatRecordField` 把 `sourceUserNames`、`sourceDeptNames` 作为第 4、5 个参数传给 `formatCellValue`。弹窗表格和选中后的显示字段预览都走这里，一起修好。
4. **数据源清空或加载失败**时，两张名字表一并清空，避免串到下一张源表。

没有改：

- 后端 `loadUserNames` / 记录查询形状
- `fillValues.formatCellValue` 的签名和「查不到名字 → 已删除」兜底
- 快捷搜索（本来就不搜人员/部门列）
- 填充映射：选中后写入其他字段仍是拷贝 id 或源值，展示仍由那些字段自己的控件负责

## 6. 修完后的正确行为

- 弹窗里，源表人员列显示姓名，部门列显示部门名；多人/多部门用顿号 `、` 拼接（与列表同一套 `formatCellValue`）。
- 该行没填人员或部门：这两列为空，不是「已删除」。
- 用户已从库里消失、或部门已不在组织树：才显示「已删除」。这和数据管理、成员/部门控件一致。
- 图片列仍是缩略图；创建人仍用 `createdByName`。

## 7. 怎么验

设备台账（或任意源表）至少一条已填「负责人」「所属部门」，再准备一条这两项都空的。到另一张表的选择数据 `data`（主表或子表「物料」均可）打开选记录弹窗：

- 有值的行：两列是姓名和部门名，不是「已删除」。
- 没填的行：两列为空。
- 数据管理打开同一条源记录，两边姓名应一致。
