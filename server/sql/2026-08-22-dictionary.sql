-- 应用字典迁移
-- 未获得使用者明确许可前不得执行。失败时整体回滚。

START TRANSACTION;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
