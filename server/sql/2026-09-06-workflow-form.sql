ALTER TABLE `app_form`
  ADD COLUMN `formKind` varchar(16) NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS `workflow_definition` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `formId` int NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `draftGraph` json NULL,
  `publishedGraph` json NULL,
  `publishedVersion` int NOT NULL DEFAULT 0,
  `publishedAt` datetime(6) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_definition_formId` (`formId`),
  KEY `IDX_workflow_definition_appId` (`appId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workflow_instance` (
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

CREATE TABLE IF NOT EXISTS `workflow_task` (
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
