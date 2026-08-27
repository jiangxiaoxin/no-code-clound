<template>
  <div class="source-picker">
    <el-popover
      v-model:visible="open"
      placement="bottom-start"
      :fallback-placements="['top-start', 'bottom-start']"
      :width="popperWidth"
      :offset="4"
      :show-arrow="false"
      :hide-after="0"
      trigger="click"
      :popper-style="{ padding: '8px' }"
      @show="onPopoverShow"
    >
      <template #reference>
        <div
          ref="triggerRef"
          class="source-picker-trigger"
          :class="{ 'is-open': open, 'is-placeholder': !displayText }"
        >
          <span class="source-picker-value">{{ displayText || '请选择表单' }}</span>
          <el-icon class="source-picker-arrow"><ArrowDown /></el-icon>
        </div>
      </template>
      <div class="source-picker-panel">
        <el-input
          v-model="keyword"
          size="small"
          clearable
          placeholder="搜索表名"
        />
        <div v-if="loadError" class="source-picker-status">加载失败</div>
        <div v-else-if="!filteredForms.length" class="source-picker-status">
          暂无已保存的表单
        </div>
        <div v-else class="source-picker-list">
          <div
            v-for="form in filteredForms"
            :key="form.id"
            class="source-picker-item"
            :class="{ 'is-active': Number(form.id) === Number(sourceFormId) }"
            @click="onPick(form)"
          >
            {{ form.name }}
          </div>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { listFormFieldsApi } from '../../api/apps'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  sourceFormId: { type: Number, default: null },
  includeCurrent: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])

const triggerRef = ref(null)
const open = ref(false)
const popperWidth = ref(288)
const keyword = ref('')
const loadError = ref(false)
const loaded = ref(false)
const forms = ref([])

const displayText = computed(() => {
  if (!props.sourceFormId) {
    return ''
  }
  const form = forms.value.find(
    (item) => Number(item.id) === Number(props.sourceFormId),
  )
  if (form) {
    return form.name
  }
  if (!loaded.value) {
    return ''
  }
  return '已选表单不可用'
})

const filteredForms = computed(() => {
  const q = keyword.value.trim()
  return forms.value.filter((form) => !q || form.name.includes(q))
})

async function loadForms() {
  loadError.value = false
  try {
    const params = props.includeCurrent
      ? {}
      : { excludeFormId: props.formId }
    const rows = (await listFormFieldsApi(props.appId, params)) || []
    forms.value = props.includeCurrent
      ? rows
      : rows.filter((form) => Number(form.id) !== Number(props.formId))
  } catch {
    forms.value = []
    loadError.value = true
  } finally {
    loaded.value = true
  }
}

function onPopoverShow() {
  keyword.value = ''
  popperWidth.value = triggerRef.value?.offsetWidth || 288
  loadForms()
}

function onPick(form) {
  emit('select', { formId: form.id })
  open.value = false
}

onMounted(() => {
  if (props.sourceFormId) {
    loadForms()
  }
})

watch(
  () => [props.appId, props.formId, props.includeCurrent],
  () => {
    forms.value = []
    if (open.value || props.sourceFormId) {
      loadForms()
    }
  },
)
</script>

<style scoped lang="less">
.source-picker {
  width: 100%;
}

.source-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}

.source-picker-trigger.is-open {
  border-color: var(--el-color-primary);
}

.source-picker-trigger:hover {
  border-color: var(--el-border-color-hover);
}

.source-picker-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-picker-trigger.is-placeholder .source-picker-value {
  color: var(--el-text-color-placeholder);
}

.source-picker-arrow {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}

.source-picker-status {
  padding: 12px 0;
  color: var(--el-text-color-placeholder);
  text-align: center;
  font-size: 13px;
}

.source-picker-list {
  margin-top: 8px;
  height: min(240px, 40vh);
  overflow: auto;
}

.source-picker-item {
  padding: 6px 8px;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  border-radius: var(--el-border-radius-base);
}

.source-picker-item:hover {
  background: var(--el-fill-color-light);
}

.source-picker-item.is-active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
</style>
