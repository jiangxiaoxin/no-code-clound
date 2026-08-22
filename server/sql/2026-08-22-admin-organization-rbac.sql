-- 管理后台组织与角色权限迁移
-- 未获得使用者明确许可前不得执行。失败时整体回滚。

START TRANSACTION;

ALTER TABLE `user`
  ADD COLUMN `displayName` varchar(64) NOT NULL DEFAULT '' AFTER `password`,
  ADD COLUMN `status` varchar(16) NOT NULL DEFAULT 'active' AFTER `displayName`;

UPDATE `user`
SET `displayName` = `username`
WHERE `displayName` = '' OR `displayName` IS NULL;

CREATE TABLE `department` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `parentId` int NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_department_parent_name` (`parentId`, `name`),
  KEY `IDX_department_parentId` (`parentId`),
  KEY `IDX_department_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL,
  `code` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `builtIn` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_name` (`name`),
  UNIQUE KEY `uk_role_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `user_department` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `departmentId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_department` (`userId`, `departmentId`),
  KEY `IDX_user_department_userId` (`userId`),
  KEY `IDX_user_department_departmentId` (`departmentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `user_role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `roleId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`userId`, `roleId`),
  KEY `IDX_user_role_userId` (`userId`),
  KEY `IDX_user_role_roleId` (`roleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `role_permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `roleId` int NOT NULL,
  `permission` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`roleId`, `permission`),
  KEY `IDX_role_permission_roleId` (`roleId`),
  KEY `IDX_role_permission_permission` (`permission`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

DROP PROCEDURE IF EXISTS `_ensure_admin_user`;
DELIMITER //
CREATE PROCEDURE `_ensure_admin_user`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM `user` WHERE `username` = 'admin' AND `status` = 'active'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '未找到启用的 admin 账号，请先明确指定首个系统管理员后再执行迁移';
  END IF;
END //
DELIMITER ;

CALL `_ensure_admin_user`();
DROP PROCEDURE `_ensure_admin_user`;

INSERT INTO `user_role` (`userId`, `roleId`)
SELECT u.`id`, @system_admin_id
FROM `user` u
WHERE u.`username` = 'admin' AND u.`status` = 'active'
ON DUPLICATE KEY UPDATE `userId` = VALUES(`userId`);

COMMIT;
