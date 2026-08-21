<template>
  <el-container class="form-body">
    <el-aside class="palette" width="260px">
      <div class="palette-grid">
        <div
          v-for="item in fieldTypes"
          :key="item.type"
          class="palette-item"
          @click="addField(item)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </div>
      </div>
    </el-aside>

    <el-main class="canvas">
      <div class="canvas-paper">
        <el-empty
          v-if="fields.length === 0"
          description="从左侧选择字段添加到表单"
        />
        <div
          v-for="field in fields"
          :key="field.key"
          class="canvas-field"
          :class="{ 'is-selected': selectedKey === field.key }"
          @click="selectField(field)"
        >
          <div v-if="selectedKey === field.key" class="canvas-field-actions">
            <el-button
              text
              :icon="CopyDocument"
              @click.stop="copyField(field)"
            />
            <el-button text :icon="Delete" @click.stop="removeField(field)" />
          </div>
          <el-text v-if="field.type !== 'divider'" class="canvas-field-title">
            {{ field.title }}
          </el-text>
          <el-input
            v-if="field.type === 'input' || field.type === 'number'"
            disabled
            :placeholder="field.placeholder"
          />
          <el-input
            v-else-if="field.type === 'textarea'"
            type="textarea"
            disabled
            :rows="3"
            :placeholder="field.placeholder"
          />
          <el-radio-group v-else-if="field.type === 'radio'" disabled>
            <el-radio value="1">选项一</el-radio>
            <el-radio value="2">选项二</el-radio>
          </el-radio-group>
          <el-checkbox-group v-else-if="field.type === 'checkbox'" disabled>
            <el-checkbox value="1">选项一</el-checkbox>
            <el-checkbox value="2">选项二</el-checkbox>
          </el-checkbox-group>
          <el-date-picker
            v-else-if="field.type === 'date'"
            disabled
            class="canvas-full"
            type="datetime"
            :placeholder="field.placeholder || '请选择'"
          />
          <el-select
            v-else-if="
              field.type === 'select' ||
              field.type === 'member' ||
              field.type === 'dept' ||
              field.type === 'data' ||
              field.type === 'relate'
            "
            disabled
            class="canvas-full"
            :placeholder="field.placeholder"
          />
          <el-divider v-else-if="field.type === 'divider'">
            {{ field.title }}
          </el-divider>
          <el-upload
            v-else-if="field.type === 'image'"
            disabled
            list-type="picture-card"
            :auto-upload="false"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
          <el-upload
            v-else-if="field.type === 'file'"
            disabled
            :auto-upload="false"
            :show-file-list="false"
          >
            <el-button disabled :icon="Upload" />
          </el-upload>
          <div v-else-if="field.type === 'subform'" class="canvas-subform" />
        </div>
      </div>
    </el-main>

    <el-aside class="props" width="320px">
      <div class="props-tabs">
        <el-text
          class="props-tab"
          :class="{ 'is-active': propTab === 'field' }"
          @click="propTab = 'field'"
        >
          字段属性
        </el-text>
        <el-text
          class="props-tab"
          :class="{ 'is-active': propTab === 'form' }"
          @click="propTab = 'form'"
        >
          表单属性
        </el-text>
      </div>
      <el-empty
        v-if="propTab === 'field' && !selectedField"
        description="请选择字段"
      />
      <el-form
        v-else-if="propTab === 'field'"
        label-position="top"
      >
        <el-form-item label="标题">
          <el-input v-model="selectedField.title" maxlength="32" />
        </el-form-item>
        <el-form-item label="提示文字">
          <el-input v-model="selectedField.placeholder" maxlength="64" />
        </el-form-item>
      </el-form>
    </el-aside>
  </el-container>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  Calendar,
  CircleCheck,
  CopyDocument,
  Delete,
  EditPen,
  Finished,
  Grid,
  Link,
  Minus,
  Notebook,
  Odometer,
  OfficeBuilding,
  Picture,
  Plus,
  SemiSelect,
  Tickets,
  Upload,
  User,
} from '@element-plus/icons-vue'

const fieldTypes = [
  { type: 'input', label: '单行文本', icon: EditPen },
  { type: 'textarea', label: '多行文本', icon: Notebook },
  { type: 'number', label: '数字', icon: Odometer },
  { type: 'date', label: '日期时间', icon: Calendar },
  { type: 'radio', label: '单选框', icon: CircleCheck },
  { type: 'checkbox', label: '复选框', icon: Finished },
  { type: 'select', label: '下拉框', icon: SemiSelect },
  { type: 'member', label: '成员选择', icon: User },
  { type: 'dept', label: '部门选择', icon: OfficeBuilding },
  { type: 'divider', label: '分割线', icon: Minus },
  { type: 'image', label: '图片上传', icon: Picture },
  { type: 'file', label: '文件上传', icon: Upload },
  { type: 'data', label: '选择数据', icon: Grid },
  { type: 'subform', label: '子表单', icon: Tickets },
  { type: 'relate', label: '关联数据', icon: Link },
]

const propTab = ref('field')
const fields = ref([])
const selectedKey = ref('')
let nextKey = 1

const selectedField = computed(
  () => fields.value.find((field) => field.key === selectedKey.value) || null,
)

function addField(item) {
  const field = {
    key: `f${nextKey++}`,
    type: item.type,
    title: item.label,
    placeholder: '',
  }
  fields.value.push(field)
  selectField(field)
}

function copyField(field) {
  const copied = {
    ...field,
    key: `f${nextKey++}`,
  }
  const index = fields.value.findIndex((item) => item.key === field.key)
  fields.value.splice(index + 1, 0, copied)
  selectField(copied)
}

function removeField(field) {
  fields.value = fields.value.filter((item) => item.key !== field.key)
  if (selectedKey.value === field.key) {
    selectedKey.value = fields.value.at(-1)?.key || ''
  }
}

function selectField(field) {
  selectedKey.value = field.key
  propTab.value = 'field'
}
</script>

<style scoped lang="less">
.form-body {
  min-height: 0;
}

.palette,
.props {
  padding: 16px;
  background: var(--el-bg-color);
  overflow: auto;
}

.palette {
  border-right: 1px solid var(--el-border-color);
}

.props {
  border-left: 1px solid var(--el-border-color);
}

.props-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.props-tab {
  padding: 8px 0;
  font-weight: 600;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}

.props-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.palette-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
}

.palette-item:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.palette-item:hover .el-icon,
.palette-item:hover span {
  color: var(--el-color-primary);
}

.canvas {
  padding: 24px;
}

.canvas-paper {
  min-height: 100%;
  padding: 24px;
  background: var(--el-bg-color);
  border-radius: 4px;
}

.canvas-field {
  position: relative;
  padding: 16px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 4px;
}

.canvas-field.is-selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.canvas-field-actions {
  position: absolute;
  top: 4px;
  right: 4px;
}

.canvas-field-title {
  display: block;
  margin-bottom: 8px;
}

.canvas-full {
  width: 100%;
}

.canvas-subform {
  min-height: 88px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}
</style>
