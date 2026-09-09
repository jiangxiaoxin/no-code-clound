-- 新环境 MySQL 全量建表（与当前 TypeORM 实体对齐，2026-09-09）
-- 适用：空库首次部署。已有库请按 server/sql/README.md 跑增量脚本，不要重复执行本文件。
-- 未获得使用者明确许可前不得执行。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 账号与认证
-- ---------------------------------------------------------------------------

CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(32) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `displayName` varchar(64) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `uk_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `revoked_token` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tokenHash` (`tokenHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 组织与 RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE `department` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `parentId` int NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `sortOrder` int NOT NULL DEFAULT 0,
  `leaderUserId` int NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_department_parent_name` (`parentId`, `name`),
  KEY `IDX_department_parentId` (`parentId`),
  KEY `IDX_department_status` (`status`),
  KEY `IDX_department_leaderUserId` (`leaderUserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_department` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `departmentId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_department_userId` (`userId`),
  KEY `IDX_user_department_departmentId` (`departmentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `roleId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`userId`, `roleId`),
  KEY `IDX_user_role_userId` (`userId`),
  KEY `IDX_user_role_roleId` (`roleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `role_permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `roleId` int NOT NULL,
  `permission` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`roleId`, `permission`),
  KEY `IDX_role_permission_roleId` (`roleId`),
  KEY `IDX_role_permission_permission` (`permission`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 应用与表单
-- ---------------------------------------------------------------------------

CREATE TABLE `application` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL,
  `icon` varchar(32) NOT NULL,
  `ownerId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_application_ownerId` (`ownerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `app_group` (
  `id` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `name` varchar(32) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_app_group_applicationId` (`applicationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `app_form` (
  `id` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `groupId` int NULL,
  `name` varchar(32) NOT NULL,
  `fields` json NULL COMMENT '表单设计字段数组',
  `formKind` varchar(16) NOT NULL DEFAULT 'normal',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_app_form_applicationId` (`applicationId`),
  KEY `IDX_app_form_groupId` (`groupId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `app_form_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `formId` int NOT NULL,
  `config` json DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_app_form_config_formId` (`formId`),
  CONSTRAINT `FK_app_form_config_formId` FOREIGN KEY (`formId`) REFERENCES `app_form` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `form_serial_seq` (
  `id` int NOT NULL AUTO_INCREMENT,
  `formId` int NOT NULL,
  `fieldKey` varchar(64) NOT NULL,
  `periodKey` varchar(32) NOT NULL,
  `nextValue` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_serial_seq_bucket` (`formId`, `fieldKey`, `periodKey`),
  CONSTRAINT `FK_form_serial_seq_formId` FOREIGN KEY (`formId`) REFERENCES `app_form` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 应用字典
-- ---------------------------------------------------------------------------

CREATE TABLE `dictionary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `name` varchar(32) NOT NULL,
  `code` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dictionary_app_code` (`applicationId`, `code`),
  UNIQUE KEY `uk_dictionary_app_name` (`applicationId`, `name`),
  KEY `IDX_dictionary_applicationId` (`applicationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dictionary_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dictionaryId` int NOT NULL,
  `label` varchar(64) NOT NULL,
  `value` varchar(64) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dictionary_item_value` (`dictionaryId`, `value`),
  KEY `IDX_dictionary_item_dictionaryId` (`dictionaryId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 应用权限（配置者 / 使用范围）
-- ---------------------------------------------------------------------------

CREATE TABLE `app_configurator` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `userId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_configurator_appId_userId` (`appId`, `userId`),
  KEY `IDX_app_configurator_appId` (`appId`),
  KEY `IDX_app_configurator_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `app_access_scope` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `type` varchar(16) NOT NULL,
  `targetId` int NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_access_scope_appId_type_targetId` (`appId`, `type`, `targetId`),
  KEY `IDX_app_access_scope_appId` (`appId`),
  KEY `IDX_app_access_scope_type_targetId` (`type`, `targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 流程表单
-- ---------------------------------------------------------------------------

CREATE TABLE `workflow_definition` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `hasBeenEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_definition_formId` (`formId`),
  KEY `IDX_workflow_definition_appId` (`appId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_version` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `version` int NOT NULL,
  `graph` json NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_version_formId_version` (`formId`, `version`),
  KEY `IDX_workflow_version_formId` (`formId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_instance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `recordId` varchar(24) NOT NULL,
  `definitionVersion` int NOT NULL,
  `graph` json NOT NULL,
  `initiatorId` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `currentNodeKey` varchar(64) NULL,
  `visitedNodeKeys` json NULL,
  `hasApproved` tinyint(1) NOT NULL DEFAULT 0,
  `round` int NOT NULL DEFAULT 1,
  `errorReason` varchar(255) NULL,
  `retryStep` varchar(32) NULL,
  `retryPatch` json NULL,
  `retryActorId` int NULL,
  `notes` json NULL,
  `startedAt` datetime(6) NULL,
  `endedAt` datetime(6) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_instance_formId_recordId` (`formId`, `recordId`),
  KEY `IDX_workflow_instance_initiatorId` (`initiatorId`),
  KEY `IDX_workflow_instance_appId_status` (`appId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_task` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instanceId` int NOT NULL,
  `nodeKey` varchar(64) NOT NULL,
  `round` int NOT NULL,
  `assigneeId` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `action` varchar(16) NULL,
  `comment` varchar(1000) NULL,
  `cancelReason` varchar(64) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `finishedAt` datetime(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_task_instanceId_nodeKey_assigneeId_round` (`instanceId`, `nodeKey`, `assigneeId`, `round`),
  KEY `IDX_workflow_task_assigneeId_status` (`assigneeId`, `status`),
  KEY `IDX_workflow_task_instanceId` (`instanceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
