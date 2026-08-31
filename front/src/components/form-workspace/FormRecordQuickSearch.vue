<template>
  <div class="quick-search">
    <el-input
      v-model="keyword"
      clearable
      placeholder="搜索数据"
      @clear="onSearchNow"
      @keyup.enter="onSearchNow"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
      <template #suffix>
        <el-popover
          v-model:visible="popoverVisible"
          placement="bottom-end"
          :width="280"
          trigger="click"
          :show-arrow="false"
        >
          <template #reference>
            <el-icon class="quick-search-caret">
              <ArrowDown />
            </el-icon>
          </template>
          <div class="quick-search-menu">
            <div
              class="quick-search-option"
              :class="{ 'is-active': isAllMode }"
              @click="selectAll"
            >
              <span>搜索全部</span>
              <el-icon v-if="isAllMode"><Check /></el-icon>
            </div>
            <div
              class="quick-search-option"
              :class="{ 'is-active': isSpecificMode }"
              @click="selectSpecific"
            >
              <span class="quick-search-option-label">
                搜索特定字段
                <el-tooltip
                  content="勾选后只在这些字段里搜索。可选单行文本、多行文本、数字、下拉框、单选和多选。"
                  placement="top"
                >
                  <el-icon class="quick-search-tip">
                    <QuestionFilled />
                  </el-icon>
                </el-tooltip>
              </span>
              <el-icon @click.stop="toggleFieldsExpanded">
                <ArrowUp v-if="fieldsExpanded" />
                <ArrowDown v-else />
              </el-icon>
            </div>
            <div v-if="fieldsExpanded" class="quick-search-fields">
              <el-input
                v-model="fieldQuery"
                clearable
                placeholder="搜索"
                size="small"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-checkbox-group
                class="quick-search-checks"
                :model-value="selectedKeys"
                @change="onSelectedKeysChange"
              >
                <el-checkbox
                  v-for="field in visibleFields"
                  :key="field.key"
                  :value="field.key"
                >
                  {{ field.title || '未命名字段' }}
                </el-checkbox>
              </el-checkbox-group>
              <div v-if="!visibleFields.length" class="quick-search-empty">
                没有匹配的字段
              </div>
            </div>
          </div>
        </el-popover>
      </template>
    </el-input>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Check,
  QuestionFilled,
  Search,
} from '@element-plus/icons-vue'

import { flattenFields } from '../form-design/tabsField.js'
import {
  loadQuickSearchPrefs,
  quickSearchStorageKey,
  saveQuickSearchPrefs,
} from './quickSearch'
import { useUserStore } from '../../stores/user'

// 快捷筛选的配置存入本地，方便使用。不存入数据库

const props = defineProps({
  fields: { type: Array, default: () => [] },
  appId: { type: Number, default: 0 },
  formId: { type: Number, default: 0 },
})

const emit = defineEmits(['search'])
const userStore = useUserStore()

const keyword = ref('')
const fieldQuery = ref('')
const mode = ref('all')
const selectedKeys = ref([])
const fieldsExpanded = ref(true)
const popoverVisible = ref(false)

const isAllMode = computed(() => mode.value === 'all')
const isSpecificMode = computed(() => mode.value === 'specific')

const flatFields = computed(() => flattenFields(props.fields))

const visibleFields = computed(() => {
  const q = fieldQuery.value.trim().toLowerCase()
  return flatFields.value.filter((field) => {
    if (!q) return true
    return String(field.title || '未命名字段').toLowerCase().includes(q)
  })
})

function storageKey() {
  return quickSearchStorageKey(
    userStore.user?.id,
    props.appId,
    props.formId,
  )
}

function emitSearch() {
  emit('search', {
    keyword: keyword.value.trim(),
    fieldKeys: mode.value === 'all' ? null : selectedKeys.value.slice(),
  })
}

function onSearchNow() {
  emitSearch()
}

function selectAll() {
  mode.value = 'all'
}

function selectSpecific() {
  mode.value = 'specific'
  fieldsExpanded.value = true
}

function toggleFieldsExpanded() {
  fieldsExpanded.value = !fieldsExpanded.value
}

function onSelectedKeysChange(keys) {
  selectedKeys.value = keys
  mode.value = 'specific'
}

function persistPrefs() {
  saveQuickSearchPrefs(
    storageKey(),
    { mode: mode.value, selectedKeys: selectedKeys.value },
    flatFields.value,
  )
}

watch(
  () => [
    props.appId,
    props.formId,
    userStore.user?.id,
    flatFields.value.map((field) => field.key).join(','),
  ],
  () => {
    const next = loadQuickSearchPrefs(storageKey(), flatFields.value)
    mode.value = next.mode
    selectedKeys.value = next.selectedKeys
  },
  { immediate: true },
)

watch(popoverVisible, (visible, wasVisible) => {
  if (wasVisible && !visible) {
    persistPrefs()
    emitSearch()
  }
})
</script>

<style scoped lang="less">
.quick-search {
  width: 260px;
  margin-right: 8px;
}

.quick-search-caret {
  cursor: pointer;
  color: var(--el-text-color-placeholder);
}

.quick-search-menu {
  display: flex;
  flex-direction: column;
}

.quick-search-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.quick-search-option.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.quick-search-option-label {
  display: flex;
  align-items: center;
}

.quick-search-tip {
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
  cursor: help;
}

.quick-search-fields {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.quick-search-checks {
  display: flex;
  flex-direction: column;
  max-height: 200px;
  margin-top: 8px;
  overflow: auto;
}

.quick-search-checks :deep(.el-checkbox) {
  margin-right: 0;
  height: 32px;
}

.quick-search-empty {
  margin-top: 8px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 24px;
}
</style>
