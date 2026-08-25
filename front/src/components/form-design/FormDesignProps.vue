<template>
  <el-aside class="props" width="320px">
    <div class="props-tabs">
      <span class="props-tab" :class="{ 'is-active': tab === 'field' }" @click="$emit('update:tab', 'field')">
        字段属性
      </span>
      <span class="props-tab" :class="{ 'is-active': tab === 'form' }" @click="$emit('update:tab', 'form')">
        表单属性
      </span>
    </div>
    <el-empty v-if="tab === 'field' && !field" description="请选择字段" />
    <el-form v-else-if="tab === 'form'" label-position="top">
      <el-form-item label="表单布局">
        <el-select :model-value="columns" @change="$emit('update:columns', $event)">
          <el-option
            v-for="item in formColumnOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <el-form v-else-if="tab === 'field'" label-position="top">
      <el-form-item :label="field.type === 'divider' ? '标题' : '字段标题'">
        <el-input v-model="field.title" maxlength="32" />
      </el-form-item>
      <template v-if="field.type !== 'divider'">
      <el-form-item label="占位文字">
        <el-input v-model="field.placeholder" maxlength="64" />
      </el-form-item>
      <el-form-item label="字段说明">
        <el-input v-model="field.description" type="textarea" :rows="3" maxlength="200" show-word-limit
          placeholder="填写后，标题右侧会显示说明" />
      </el-form-item>
      <el-form-item label="校验设置">
        <div>
          <div class="required-row">
            <span>必填</span>
            <el-switch v-model="field.required" />
          </div>
          <div v-if="field.type === 'input'" class="required-row">
            <span>不允许重复值</span>
            <el-switch v-model="field.unique" />
          </div>
          <div v-if="field.type === 'input' || field.type === 'textarea'" class="required-row">
            <span>最大文本长度：</span>
            <el-input-number
              v-model="field.maxLength"
              class="max-length-input"
              :min="0"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
              placeholder="最大长度"
            />
            <span>字符</span>
          </div>
          <div v-if="field.type === 'number'" class="required-row">
            <span>数值范围</span>
            <el-switch v-model="field.rangeEnabled" />
          </div>
          <div v-if="field.type === 'number' && field.rangeEnabled" class="range-inputs">
            <el-input-number v-model="field.min" :controls="false" placeholder="最小值" size="small" align="left"/>
            <span>~</span>
            <el-input-number v-model="field.max" :controls="false" placeholder="最大值" size="small" align="left"/>
          </div>
        </div>
      </el-form-item>
      <el-form-item v-if="field.type === 'number'" label="格式">
        <div class="required-row">
          <span>保持</span>
          <el-input-number
            v-model="field.precision"
            :min="0"
            :precision="0"
            :step="1"
            step-strictly
            :controls="false"
            size="small"
            align="left"
          />
          <span>位小数</span>
        </div>
      </el-form-item>
      <el-form-item v-else-if="formatOptions[field.type]" label="格式">
        <el-select v-model="field.format">
          <el-option
            v-for="item in formatOptions[field.type]"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="field.type === 'radio' || field.type === 'checkbox'" label="选项字典">
        <el-select v-model="field.dictCode" clearable placeholder="请选择字典">
          <el-option
            v-for="item in dictionaries"
            :key="item.code"
            :label="item.name"
            :value="item.code"
          />
        </el-select>
      </el-form-item>
      <template v-else-if="field.type === 'select' || field.type === 'select-multiple'">
        <el-form-item label="数据源">
          <el-radio-group v-model="field.optionSource" @change="onOptionSourceChange">
            <el-radio value="dictionary">字典</el-radio>
            <el-radio value="table_data">其他表数据</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'dictionary'" label="选项字典">
          <el-select v-model="field.dictCode" clearable placeholder="请选择字典">
            <el-option
              v-for="item in dictionaries"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="field.optionSource === 'table_data'" label="表字段">
          <FormFieldSourcePicker
            :app-id="appId"
            :form-id="formId"
            :source-form-id="field.sourceFormId"
            :source-field-key="field.sourceFieldKey"
            @select="onSourceFieldSelect"
          />
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'table_data'" label="选项过滤">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasOptionFilters(field.optionFilters) }"
            @click="filterVisible = true"
          >
            {{ hasOptionFilters(field.optionFilters) ? '已添加过滤条件' : '添加过滤条件' }}
          </div>
        </el-form-item>
      </template>
      <FormOptionFilterDialog
        v-model="filterVisible"
        :app-id="appId"
        :option-filters="field.optionFilters"
        :source-fields="sourceFields"
        :form-fields="formFields"
        @confirm="onFilterConfirm"
      />
      <el-form-item label="字段宽度">
        <el-radio-group class="width-options" :model-value="field.width" @change="$emit('update:width', $event)">
          <el-radio-button value="1/4">1/4</el-radio-button>
          <el-radio-button value="1/3">1/3</el-radio-button>
          <el-radio-button value="1/2">1/2</el-radio-button>
          <el-radio-button value="2/3">2/3</el-radio-button>
          <el-radio-button value="3/4">3/4</el-radio-button>
          <el-radio-button value="1">整行</el-radio-button>
        </el-radio-group>
      </el-form-item>
      </template>

    </el-form>
  </el-aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { formatOptions, formColumnOptions } from './fieldTypes'
import FormFieldSourcePicker from './FormFieldSourcePicker.vue'
import FormOptionFilterDialog from './FormOptionFilterDialog.vue'
import { hasOptionFilters } from './optionFilters'
import { isFillable } from '../form-fill/fillValues'
import { listDictionaryOptionsApi, listFormFieldsApi } from '../../api/apps'

const props = defineProps({
  tab: { type: String, required: true },
  field: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  columns: { type: Number, default: 1 },
})

defineEmits(['update:tab', 'update:width', 'update:columns'])

const dictionaries = ref([])
const sourceFields = ref([])
const filterVisible = ref(false)

const formFields = computed(() =>
  (props.fields || []).filter(
    (item) => isFillable(item) && item.key !== props.field?.key,
  ),
)

async function loadOptions() {
  if (!props.appId) {
    dictionaries.value = []
    return
  }
  try {
    dictionaries.value = (await listDictionaryOptionsApi(props.appId)) || []
  } catch {
    dictionaries.value = []
  }
}

function onOptionSourceChange(value) {
  if (!props.field) {
    return
  }
  if (value === 'table_data') {
    delete props.field.dictCode
  } else {
    delete props.field.sourceFormId
    delete props.field.sourceFieldKey
    delete props.field.optionFilters
    if (props.field.dictCode == null) {
      props.field.dictCode = ''
    }
  }
}

function onSourceFieldSelect({ formId, fieldKey }) {
  if (!props.field) {
    return
  }
  if (props.field.sourceFormId !== formId) {
    delete props.field.optionFilters
  }
  props.field.sourceFormId = formId
  props.field.sourceFieldKey = fieldKey
}

function onFilterConfirm(next) {
  if (!props.field) {
    return
  }
  if (next) {
    props.field.optionFilters = next
  } else {
    delete props.field.optionFilters
  }
}

async function loadSourceFields() {
  if (!props.appId || !props.field?.sourceFormId) {
    sourceFields.value = []
    return
  }
  try {
    const forms =
      (await listFormFieldsApi(props.appId, { excludeFormId: props.formId })) ||
      []
    const form = forms.find(
      (item) => Number(item.id) === Number(props.field.sourceFormId),
    )
    sourceFields.value = form?.fields || []
  } catch {
    sourceFields.value = []
  }
}

watch(() => props.appId, loadOptions, { immediate: true })
watch(
  () => [props.appId, props.formId, props.field?.sourceFormId],
  loadSourceFields,
  { immediate: true },
)
watch(
  () => props.field?.key,
  () => {
    filterVisible.value = false
  },
)
</script>

<style scoped lang="less">
.props {
  padding: 16px;
  background: var(--el-bg-color);
  overflow: auto;
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

.width-options {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
}

.width-options :deep(.el-radio-button) {
  flex: 1 1 0;
}

.width-options :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
  font-size: 12px;
}

.required-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.required-row+.required-row {
  margin-top: 12px;
}

.max-length-input {
  width: 96px;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.filter-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: pointer;
  font-size: 14px;
  line-height: 32px;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.filter-trigger:hover {
  border-color: var(--el-border-color-hover);
}

.filter-trigger.is-placeholder {
  color: var(--el-text-color-placeholder);
}
</style>
