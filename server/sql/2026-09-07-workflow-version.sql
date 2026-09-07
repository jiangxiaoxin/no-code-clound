CREATE TABLE IF NOT EXISTS `workflow_version` (
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

ALTER TABLE `workflow_definition`
  ADD COLUMN `hasBeenEnabled` tinyint(1) NOT NULL DEFAULT 0;

INSERT INTO `workflow_version` (`appId`, `formId`, `version`, `graph`, `enabled`)
SELECT `appId`, `formId`, GREATEST(`publishedVersion`, 1), `publishedGraph`, `enabled`
FROM `workflow_definition`
WHERE `publishedGraph` IS NOT NULL;

UPDATE `workflow_definition`
SET `hasBeenEnabled` = 1
WHERE `publishedVersion` > 0;

INSERT INTO `workflow_version` (`appId`, `formId`, `version`, `graph`, `enabled`)
SELECT d.`appId`, d.`formId`,
  IFNULL((SELECT MAX(v.`version`) FROM `workflow_version` v WHERE v.`formId` = d.`formId`), 0) + 1,
  d.`draftGraph`, 0
FROM `workflow_definition` d
WHERE d.`draftGraph` IS NOT NULL
  AND (d.`publishedGraph` IS NULL OR NOT (d.`draftGraph` <=> d.`publishedGraph`));

ALTER TABLE `workflow_definition`
  DROP COLUMN `draftGraph`,
  DROP COLUMN `publishedGraph`,
  DROP COLUMN `publishedVersion`,
  DROP COLUMN `publishedAt`,
  DROP COLUMN `enabled`;
