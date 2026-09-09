-- 初始化内置角色与权限（新环境在 bootstrap 之后执行）
-- 不会创建用户；首个管理员需注册后在管理后台赋权，或按下方注释手动 INSERT user_role。
-- 未获得使用者明确许可前不得执行。

START TRANSACTION;

INSERT INTO `role` (`name`, `code`, `description`, `status`, `builtIn`)
VALUES ('系统管理员', 'system_admin', '拥有全部管理权限', 'active', 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `status` = 'active',
  `builtIn` = 1;

SET @system_admin_id = (
  SELECT `id` FROM `role` WHERE `code` = 'system_admin' LIMIT 1
);

INSERT INTO `role_permission` (`roleId`, `permission`)
VALUES
  (@system_admin_id, 'admin.access'),
  (@system_admin_id, 'users.read'),
  (@system_admin_id, 'users.create'),
  (@system_admin_id, 'users.update'),
  (@system_admin_id, 'users.change_status'),
  (@system_admin_id, 'users.reset_password'),
  (@system_admin_id, 'users.assign_departments'),
  (@system_admin_id, 'users.assign_roles'),
  (@system_admin_id, 'departments.read'),
  (@system_admin_id, 'departments.create'),
  (@system_admin_id, 'departments.update'),
  (@system_admin_id, 'departments.delete'),
  (@system_admin_id, 'roles.read'),
  (@system_admin_id, 'roles.create'),
  (@system_admin_id, 'roles.update'),
  (@system_admin_id, 'roles.delete'),
  (@system_admin_id, 'roles.assign_permissions')
ON DUPLICATE KEY UPDATE `permission` = VALUES(`permission`);

-- 若已通过 /api/auth/register 注册首个账号且用户名为 admin，取消下面三行注释并执行：
-- INSERT INTO `user_role` (`userId`, `roleId`)
-- SELECT u.`id`, @system_admin_id FROM `user` u WHERE u.`username` = 'admin' AND u.`status` = 'active'
-- ON DUPLICATE KEY UPDATE `userId` = VALUES(`userId`);

COMMIT;
