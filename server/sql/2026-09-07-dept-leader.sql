-- 部门负责人记在部门上：一个部门同一时间只有一位。
-- 人员管理里打开「是否为部门领导」时写入本列；后来的人会顶替先前的人。

ALTER TABLE `department`
  ADD COLUMN `leaderUserId` int NULL,
  ADD KEY `IDX_department_leaderUserId` (`leaderUserId`);
