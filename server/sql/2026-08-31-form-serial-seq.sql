CREATE TABLE IF NOT EXISTS `form_serial_seq` (
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
