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
    <el-form v-else-if="tab === 'form'" label-position="top" @submit.prevent>
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
    <el-form v-else-if="tab === 'field'" label-position="top" @submit.prevent>
      <div class="field-type-row">
        <span class="field-type-label">组件类型</span>
        <span class="field-type-text">{{ fieldTypeText }}</span>
      </div>
      <el-form-item :label="field.type === 'divider' ? '标题' : '字段标题'">
        <el-input v-model="field.title" maxlength="32" />
      </el-form-item>
      <template v-if="!isCurrentDisplayField">
      <template v-if="field.type !== 'divider'">
      <el-form-item v-if="field.type !== 'divider' && field.type !== 'image' && field.type !== 'file' && field.type !== 'subform'" label="占位文字">
        <el-input v-model="field.placeholder" maxlength="64" />
      </el-form-item>
      <el-form-item label="字段说明">
        <el-input v-model="field.description" type="textarea" :rows="3" maxlength="200" show-word-limit
          placeholder="填写后，标题右侧会显示说明" />
      </el-form-item>
      <el-form-item label="校验设置">
        <div style="width: 100%;">
          <div class="required-row">
            <span>必填</span>
            <el-switch v-model="field.required" />
          </div>
          <div v-if="field.type === 'address'" class="required-row">
            <span>地址格式</span>
            <el-select v-model="field.addressFormat" class="address-format-select">
              <el-option
                v-for="item in ADDRESS_FORMAT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div class="required-row">
            <span>是否禁用</span>
            <el-switch v-model="field.disabled" />
          </div>
          <div class="required-row">
            <span>是否可修改</span>
            <el-switch :model-value="field.editable !== false" @change="onEditableChange" />
          </div>
          <div v-if="showUniqueSwitch" class="required-row">
            <span>不允许重复值</span>
            <el-switch :model-value="Boolean(field.unique)" @change="onUniqueChange" />
          </div>
          <div v-if="showUniqueInRowsSwitch" class="required-row">
            <span>单条数据内不允许重复值</span>
            <el-switch
              :model-value="Boolean(field.uniqueInRows || field.unique)"
              :disabled="Boolean(field.unique)"
              @change="onUniqueInRowsChange"
            />
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
          <div v-if="field.type === 'image'" class="required-row">
            <span>最多上传</span>
            <el-input-number
              v-model="field.maxCount"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>张图片</span>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>每张不超过</span>
            <el-input-number
              v-model="field.maxSizeMB"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>MB</span>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>允许格式</span>
            <el-select
              v-model="field.acceptFormats"
              class="image-format-select"
              multiple
              placeholder="请选择格式"
            >
              <el-option
                v-for="item in IMAGE_FORMAT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>开启压缩</span>
            <el-switch v-model="field.compress" />
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>最多上传</span>
            <el-input-number
              v-model="field.maxCount"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>个文件</span>
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>每个不超过</span>
            <el-input-number
              v-model="field.maxSizeMB"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>MB</span>
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>允许格式</span>
            <el-select
              v-model="field.acceptFormats"
              class="image-format-select"
              multiple
              placeholder="请选择格式"
            >
              <el-option
                v-for="item in FILE_FORMAT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>是否可下载</span>
            <el-switch v-model="field.downloadable" />
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
      <template v-else-if="hasLinkageSource(field.type)">
        <el-form-item :label="optionSourceLabel">
          <el-select
            v-model="field.optionSource"
            placeholder="请选择"
            @change="onOptionSourceChange"
          >
            <el-option
              v-for="item in optionSourceChoices(field.type)"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
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
            @click="openOptionFilters"
          >
            {{ hasOptionFilters(field.optionFilters) ? '已添加过滤条件' : '添加过滤条件' }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'linkage'" label="数据联动">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasLinkage(field) }"
              @click="openLinkage"
            >
              {{ hasLinkage(field) ? '已设置数据联动' : '设置数据联动' }}
            </div>
            <el-icon
              v-if="hasLinkage(field)"
              class="linkage-clear"
              @click.stop="confirmClearLinkage"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
      </template>
      <template v-else-if="field.type === 'data'">
        <el-form-item label="数据源">
          <FormSourcePicker
            :app-id="appId"
            :form-id="formId"
            :source-form-id="field.sourceFormId"
            @select="onSourceFormSelect"
          />
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="显示在表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasDisplayFields }"
            @click="openDisplayFields"
          >
            {{ displayFieldsTriggerText }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="填充到表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasFillMappings(field.fillMappings) }"
            @click="openFillMapping"
          >
            {{
              hasFillMappings(field.fillMappings)
                ? `已添加 ${field.fillMappings.length} 条填充规则`
                : '设置填充字段'
            }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="选择过程设置">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasProcessSetup }"
            @click="openProcess"
          >
            {{ processTriggerText }}
          </div>
        </el-form-item>
      </template>
      <DataSelectDisplayFieldsDialog
        v-model="displayVisible"
        :display-field-keys="field?.displayFieldKeys"
        :source-fields="sourceFields"
        @confirm="onDisplayConfirm"
      />
      <DataSelectFillMappingDialog
        v-model="mappingVisible"
        :fill-mappings="field?.fillMappings"
        :source-fields="sourceFields"
        :form-fields="formFields"
        @confirm="onMappingConfirm"
      />
      <DataSelectProcessDrawer
        v-model="processVisible"
        :app-id="appId"
        :picker-column-keys="field?.pickerColumnKeys"
        :option-filters="field?.optionFilters"
        :source-fields="sourceFields"
        :form-fields="conditionFields"
        @confirm="onProcessConfirm"
      />
      <DataLinkageDialog
        v-model="linkageVisible"
        :app-id="appId"
        :form-id="formId"
        :field-title="field.title"
        :field-type="field.type"
        :linkage="field.linkage"
        :current-fields="conditionFields"
        :form-fields="conditionFields"
        @confirm="onLinkageConfirm"
      />
      <FormOptionFilterDialog
        v-model="filterVisible"
        :app-id="appId"
        :option-filters="field.optionFilters"
        :source-fields="sourceFields"
        :form-fields="optionFilterFields"
        @confirm="onFilterConfirm"
      />
      </template>
      </template>
      <template v-if="field.type === 'subform'">
        <el-form-item label="取值来源">
          <el-select v-model="field.optionSource" placeholder="请选择" @change="onSubformSourceChange">
            <el-option value="custom" label="自定义" />
            <el-option value="linkage" label="数据联动" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'linkage'" label="数据联动">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasSubformLinkage(field) }"
              @click="openSubformLinkage"
            >
              {{ hasSubformLinkage(field) ? '已设置数据联动' : '设置数据联动' }}
            </div>
            <el-icon
              v-if="hasSubformLinkage(field)"
              class="linkage-clear"
              @click.stop="confirmClearLinkage"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
        <el-form-item v-if="showDefaultRowCount">
          <div class="required-row">
            <span>默认行数</span>
            <el-input-number
              v-model="field.defaultRowCount"
              class="max-length-input"
              :min="0"
              :max="10"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
          </div>
        </el-form-item>
        <el-form-item>
          <div class="required-row">
            <span>固定前 N 列</span>
            <el-input-number
              v-model="field.frozenCols"
              class="max-length-input"
              :min="0"
              :max="5"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
          </div>
        </el-form-item>
        <el-form-item label="子字段">
          <div class="subform-children">
            <div
              v-for="(child, index) in field.fields || []"
              :key="child.key"
              class="subform-child-row"
              @click="onSelectChild(child)"
            >
              <span class="subform-child-title">{{ child.title }}（{{ fieldTypeLabel(child.type) }}）</span>
              <span class="subform-child-actions">
                <el-button
                  link
                  type="primary"
                  :disabled="index === 0"
                  @click.stop="onMoveChild(child, -1)"
                >
                  左移
                </el-button>
                <el-button
                  link
                  type="primary"
                  :disabled="index === (field.fields || []).length - 1"
                  @click.stop="onMoveChild(child, 1)"
                >
                  右移
                </el-button>
                <!-- <el-button link type="primary" @click.stop="onCopyChild(child)">复制</el-button> -->
                <el-button link type="danger" @click.stop="onRemoveChild(child)">删除</el-button>
              </span>
            </div>
            <el-dropdown
              trigger="click"
              popper-class="canvas-subform-type-menu"
              @command="onAddChildType"
            >
              <el-button type="primary" link>添加子字段</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="item in childTypeOptions"
                    :key="item.type"
                    :command="item.type"
                    :icon="item.icon"
                  >
                    {{ item.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-form-item>
        <SubformLinkageDialog
          v-model="subformLinkageVisible"
          :app-id="appId"
          :form-id="formId"
          :linkage="field.linkage"
          :form-fields="mainLabeledFields"
          :target-fields="field.fields || []"
          @confirm="onLinkageConfirm"
        />
      </template>
      <el-form-item v-if="field.type !== 'divider' && field.type !== 'subform' && !parentSubform" label="字段宽度">
        <el-radio-group class="width-options" :model-value="field.width" @change="onWidthChange">
          <el-radio-button value="1/4">1/4</el-radio-button>
          <el-radio-button value="1/3">1/3</el-radio-button>
          <el-radio-button value="1/2">1/2</el-radio-button>
          <el-radio-button value="2/3">2/3</el-radio-button>
          <el-radio-button value="3/4">3/4</el-radio-button>
          <el-radio-button value="1">整行</el-radio-button>
        </el-radio-group>
      </el-form-item>

    </el-form>
  </el-aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { CircleClose } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { formatOptions, formColumnOptions, fieldTypes, fieldTypeLabel, isSelectType } from './fieldTypes'
import FormFieldSourcePicker from './FormFieldSourcePicker.vue'
import FormSourcePicker from './FormSourcePicker.vue'
import FormOptionFilterDialog from './FormOptionFilterDialog.vue'
import DataSelectDisplayFieldsDialog from './DataSelectDisplayFieldsDialog.vue'
import DataSelectFillMappingDialog from './DataSelectFillMappingDialog.vue'
import DataSelectProcessDrawer from './DataSelectProcessDrawer.vue'
import DataLinkageDialog from './DataLinkageDialog.vue'
import SubformLinkageDialog from './SubformLinkageDialog.vue'
import { hasOptionFilters } from './optionFilters'
import {
  hasLinkage,
  hasLinkageSource,
  hasSubformLinkage,
  optionSourceChoices,
} from './linkage'
import {
  cloneDisplayFieldKeys,
  findDisplaySourceField,
  hasDisplayFieldKeys,
  hasFillMappings,
} from './dataSelect'
import { isFillable } from '../form-fill/fillValues'
import { SUBFORM_CHILD_TYPES, fieldRefLabel } from '../form-fill/subformField.js'
import { IMAGE_FORMAT_OPTIONS } from '../form-fill/imageField'
import { FILE_FORMAT_OPTIONS } from '../form-fill/fileField'
import { ADDRESS_FORMAT_OPTIONS } from '../form-fill/addressField'
import { listDictionaryOptionsApi, listFormFieldsApi } from '../../api/apps'

const props = defineProps({
  tab: { type: String, required: true },
  field: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  columns: { type: Number, default: 1 },
  parentSubform: { type: Object, default: null },
})

const emit = defineEmits([
  'update:tab',
  'update:width',
  'update:columns',
  'select-child',
  'add-child',
  'copy-child',
  'remove-child',
  'move-child',
])

function onWidthChange(value) {
  emit('update:width', value)
}

function onEditableChange(value) {
  if (!props.field) {
    return
  }
  props.field.editable = value
}

const dictionaries = ref([])
const sourceFields = ref([])
const filterVisible = ref(false)
const linkageVisible = ref(false)
const displayVisible = ref(false)
const mappingVisible = ref(false)
const processVisible = ref(false)
const subformLinkageVisible = ref(false)

const formFields = computed(() => {
  if (props.parentSubform) {
    return (props.parentSubform.fields || []).filter(
      (item) =>
        item.key !== props.field?.key &&
        item.type !== 'image' &&
        item.type !== 'file' &&
        item.type !== 'data',
    )
  }
  return (props.fields || []).filter(
    (item) => isFillable(item) && item.key !== props.field?.key,
  )
})

const optionFilterFields = computed(() =>
  (props.fields || []).filter(
    (item) =>
      isFillable(item) &&
      item.type !== 'subform' &&
      item.key !== props.field?.key,
  ),
)

const conditionFields = computed(() => {
  const mains = (props.fields || [])
    .filter((item) => item.type !== 'subform' && item.key !== props.field?.key)
    .map((item) => ({
      ...item,
      title: fieldRefLabel(item),
    }))
  if (!props.parentSubform) {
    return mains
  }
  const siblings = (props.parentSubform.fields || [])
    .filter((item) => item.key !== props.field?.key)
    .map((item) => ({
      ...item,
      title: fieldRefLabel(item, {
        parentTitle: props.parentSubform.title || '子表单',
      }),
    }))
  return [...mains, ...siblings]
})

const isSubformChild = computed(() => Boolean(props.parentSubform))

const showUniqueSwitch = computed(
  () =>
    props.field?.type === 'input' ||
    props.field?.type === 'number' ||
    (isSubformChild.value && props.field?.type === 'data'),
)

const showUniqueInRowsSwitch = computed(
  () =>
    isSubformChild.value &&
    (props.field?.type === 'input' ||
      props.field?.type === 'number' ||
      props.field?.type === 'data'),
)

const showDefaultRowCount = computed(
  () =>
    props.field?.type === 'subform' && !hasSubformLinkage(props.field),
)

const mainLabeledFields = computed(() =>
  (props.fields || [])
    .filter((item) => item.type !== 'subform')
    .map((item) => ({
      ...item,
      title: fieldRefLabel(item),
    })),
)

const childTypeOptions = computed(() =>
  fieldTypes.filter((item) => SUBFORM_CHILD_TYPES.includes(item.type)),
)

function onUniqueChange(value) {
  if (!props.field) {
    return
  }
  props.field.unique = value
  if (value) {
    props.field.uniqueInRows = true
  }
}

function onUniqueInRowsChange(value) {
  if (!props.field || props.field.unique) {
    return
  }
  props.field.uniqueInRows = value
}

function onSubformSourceChange(value) {
  if (!props.field) {
    return
  }
  if (value !== 'linkage') {
    delete props.field.linkage
  }
}

function onSelectChild(child) {
  emit('select-child', child)
}

function onAddChildType(type) {
  const item = fieldTypes.find((entry) => entry.type === type)
  if (!item || !props.field) {
    return
  }
  emit('add-child', props.field.key, item)
}

function onCopyChild(child) {
  emit('copy-child', child)
}

function onRemoveChild(child) {
  emit('remove-child', child)
}

function onMoveChild(child, direction) {
  emit('move-child', child.key, direction)
}

const fieldTypeText = computed(() => fieldTypeLabel(props.field?.type))
const optionSourceLabel = computed(() =>
  isSelectType(props.field?.type) ? '选项来源' : '取值来源',
)
const isCurrentDisplayField = computed(
  () =>
    props.field?.type === 'currentUser' ||
    props.field?.type === 'currentUserDept',
)

const hasDisplayFields = computed(() =>
  hasDisplayFieldKeys(props.field?.displayFieldKeys),
)

const displayFieldsTriggerText = computed(() => {
  if (!hasDisplayFields.value) {
    return '请选择显示字段'
  }
  return `已选择 ${cloneDisplayFieldKeys(props.field.displayFieldKeys).length} 个字段`
})

const hasProcessSetup = computed(() => {
  if (!props.field) return false
  return (
    cloneDisplayFieldKeys(props.field.pickerColumnKeys).length > 0 ||
    hasOptionFilters(props.field.optionFilters)
  )
})

const processTriggerText = computed(() => {
  if (!hasProcessSetup.value) {
    return '选择过程设置'
  }
  const parts = []
  const colCount = cloneDisplayFieldKeys(props.field.pickerColumnKeys).length
  if (colCount) parts.push(`${colCount} 列`)
  if (hasOptionFilters(props.field.optionFilters)) {
    parts.push('已添加过滤条件')
  }
  return parts.join('，')
})

function openDisplayFields() {
  displayVisible.value = true
  console.log('open field config', props.field);
  
}

function openFillMapping() {
  mappingVisible.value = true
}

function openProcess() {
  processVisible.value = true
}

function openOptionFilters() {
  filterVisible.value = true
}

function openLinkage() {
  linkageVisible.value = true
}

function openSubformLinkage() {
  subformLinkageVisible.value = true
}

async function confirmClearLinkage() {
  if (!props.field) return
  try {
    await ElMessageBox.confirm('确定删除数据联动？', '删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  delete props.field.linkage
}

function onLinkageConfirm(next) {
  if (!props.field) return
  props.field.linkage = next
}

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
  if (value !== 'dictionary') {
    delete props.field.dictCode
  } else if (props.field.dictCode == null) {
    props.field.dictCode = ''
  }
  if (value !== 'table_data') {
    delete props.field.sourceFormId
    delete props.field.sourceFieldKey
    delete props.field.optionFilters
  }
  if (value !== 'linkage') {
    delete props.field.linkage
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

function onSourceFormSelect({ formId }) {
  if (!props.field) {
    return
  }
  if (props.field.sourceFormId !== formId) {
    props.field.displayFieldKeys = []
    props.field.fillMappings = []
    props.field.pickerColumnKeys = []
    delete props.field.displayFieldLabels
    delete props.field.optionFilters
  }
  props.field.sourceFormId = formId
}

function onDisplayConfirm(next) {
  if (!props.field) {
    return
  }
  props.field.displayFieldKeys = next
  const labels = {}
  for (const key of next) {
    const item = findDisplaySourceField(sourceFields.value, key)
    labels[key] = item?.title || key
  }
  if (next.length) {
    props.field.displayFieldLabels = labels
  } else {
    delete props.field.displayFieldLabels
  }
}

function onMappingConfirm(next) {
  if (!props.field) {
    return
  }
  if (next.length) {
    props.field.fillMappings = next
  } else {
    delete props.field.fillMappings
  }
}

function onProcessConfirm({ pickerColumnKeys, optionFilters }) {
  if (!props.field) {
    return
  }
  props.field.pickerColumnKeys = pickerColumnKeys
  if (optionFilters) {
    props.field.optionFilters = optionFilters
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
    linkageVisible.value = false
    displayVisible.value = false
    mappingVisible.value = false
    processVisible.value = false
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

.image-format-select {
  flex: 1;
  min-width: 0;
}

.address-format-select {
  flex: 1;
  min-width: 0;
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

.linkage-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.linkage-row .filter-trigger {
  flex: 1;
  min-width: 0;
}

.linkage-clear {
  margin-left: 8px;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
}

.linkage-clear:hover {
  color: var(--el-text-color-regular);
}

.field-type-row {
  display: flex;
  align-items: center;
  margin-bottom: 18px;
}

.field-type-label {
  flex-shrink: 0;
  margin-right: 12px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.subform-children {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.subform-child-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
  cursor: pointer;
}

.subform-child-title {
  min-width: 0;
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subform-child-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;

  :deep(.el-button + .el-button) {
    margin-left: 4px;
  }
}

.field-type-text {
  padding: 0 8px;
  font-size: 13px;
  line-height: 22px;
  color: var(--el-text-color-regular);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  flex: 1;
  font-weight: bold;
}
</style>
