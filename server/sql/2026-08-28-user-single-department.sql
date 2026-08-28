-- 人员改为只能属于一个部门。
-- 未获得使用者明确许可前不得执行。失败时整体回滚。

START TRANSACTION;

DELETE ud
FROM `user_department` ud
INNER JOIN `user_department` older
  ON ud.`userId` = older.`userId`
 AND ud.`id` > older.`id`;

ALTER TABLE `user_department`
  DROP INDEX `uk_user_department`,
  DROP INDEX `IDX_user_department_userId`,
  ADD UNIQUE KEY `uk_user_department_userId` (`userId`);

COMMIT;
