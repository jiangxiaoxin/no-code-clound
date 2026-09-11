-- 流程整单超时截止时间。开启超时后，提交时按开始节点配置写入 dueAt。
-- 未获得使用者明确许可前不得执行。

ALTER TABLE `workflow_instance`
  ADD COLUMN `dueAt` datetime(6) NULL AFTER `startedAt`;
