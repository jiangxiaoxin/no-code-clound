CREATE TABLE IF NOT EXISTS `app_form_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `formId` int NOT NULL,
  `config` json DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_app_form_config_formId` (`formId`),
  CONSTRAINT `FK_app_form_config_formId` FOREIGN KEY (`formId`) REFERENCES `app_form` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
