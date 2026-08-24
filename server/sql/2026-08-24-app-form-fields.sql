ALTER TABLE `app_form`
  ADD COLUMN `fields` json NULL COMMENT '表单设计字段数组' AFTER `name`;
