-- 重试时补回审批人改过的内容
-- 通过时先把审批人填的字段存进 retryPatch，写回表单失败后点【重试】按它补写，成功后清空。
-- 没有这两列时，异常单点【重试】会丢掉审批人刚改的内容。

ALTER TABLE `workflow_instance`
  ADD COLUMN `retryPatch` json NULL,
  ADD COLUMN `retryActorId` int NULL;
