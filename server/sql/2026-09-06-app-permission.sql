CREATE TABLE IF NOT EXISTS `app_configurator` (
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

CREATE TABLE IF NOT EXISTS `app_access_scope` (
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
