<template>
  <div class="dept-select">
    <div
      class="dept-select-trigger"
      :class="{
        'is-disabled': disabled,
        'is-placeholder': !selectedIds.length,
        'is-preview': preview,
      }"
      @click="onOpenPicker"
    >
      <div v-if="selectedIds.length" class="dept-select-tags">
        <span
          v-for="id in selectedIds"
          :key="id"
          class="dept-select-tag"
        >
          <span>{{ nameOf(id) }}</span>
          <el-icon
            v-if="!disabled && !preview"
            class="dept-select-tag-close"
            @click.stop="onRemove(id)"
          >
            <Close />
          </el-icon>
        </span>
      </div>
      <span v-else class="dept-select-placeholder">
        {{ field.placeholder || '请选择' }}
      </span>
    </div>
    <el-dialog
      v-if="!preview"
      v-model="pickerVisible"
      title="选择部门"
      width="520px"
      draggable
      destroy-on-close
      @open="onPickerOpen"
    >
      <div class="dept-picker">
        <div class="dept-picker-selected">
          <div v-if="draftIds.length" class="dept-select-tags">
            <span
              v-for="id in draftIds"
              :key="id"
              class="dept-select-tag"
            >
              <span>{{ nameOf(id) }}</span>
              <el-icon
                class="dept-select-tag-close"
                @click.stop="onRemoveDraft(id)"
              >
                <Close />
              </el-icon>
            </span>
          </div>
          <div v-else class="dept-picker-selected-empty">未选择部门</div>
        </div>
        <div v-if="!departmentTree.length" class="dept-picker-empty">
          没有可选择的部门
        </div>
        <el-tree
          v-else
          class="dept-picker-tree"
          :data="departmentTree"
          node-key="id"
          :current-node-key="multiple ? undefined : draftIds[0]"
          :props="{ label: 'name', children: 'children' }"
          highlight-current
          default-expand-all
          @node-click="onDeptNodeClick"
        />
      </div>
      <template #footer>
        <el-button @click="closePicker">取消</el-button>
        <el-button type="primary" @click="confirmPick">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { listOrgDepartmentsApi } from '../../api/org'
import {
  deptDisplayName,
  deptValueIds,
  flattenDeptNames,
} from '../form-design/deptField.js'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  deptNames: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const multiple = computed(() => props.field.type === 'dept-multiple')
const selectedIds = computed(() =>
  deptValueIds(props.field.type, props.modelValue),
)

const pickerVisible = ref(false)
const draftIds = ref([])
const departmentTree = ref([])
const extraDeptNames = ref({})

const nameMap = computed(() => ({
  ...props.deptNames,
  ...extraDeptNames.value,
}))

function nameOf(id) {
  return deptDisplayName(id, nameMap.value)
}

function emitValue(ids) {
  if (multiple.value) {
    emit('update:modelValue', ids.length ? ids : [])
    return
  }
  emit('update:modelValue', ids[0])
}

function onRemove(id) {
  if (props.disabled || props.preview) return
  emitValue(selectedIds.value.filter((item) => item !== id))
}

function onRemoveDraft(id) {
  draftIds.value = draftIds.value.filter((item) => item !== id)
}

function onOpenPicker() {
  if (props.disabled || props.preview) return
  pickerVisible.value = true
}

function closePicker() {
  pickerVisible.value = false
}

function confirmPick() {
  emitValue([...draftIds.value])
  closePicker()
}

function onDeptNodeClick(node) {
  const id = node?.id
  if (!id) return
  extraDeptNames.value = {
    ...extraDeptNames.value,
    [id]: node.name || extraDeptNames.value[id],
    [String(id)]: node.name || extraDeptNames.value[String(id)],
  }
  if (multiple.value) {
    if (draftIds.value.includes(id)) {
      draftIds.value = draftIds.value.filter((item) => item !== id)
    } else {
      draftIds.value = [...draftIds.value, id]
    }
    return
  }
  draftIds.value = [id]
}

async function loadDepartments() {
  const tree = (await listOrgDepartmentsApi()) || []
  departmentTree.value = tree
  extraDeptNames.value = {
    ...extraDeptNames.value,
    ...flattenDeptNames(tree),
  }
}

async function onPickerOpen() {
  draftIds.value = [...selectedIds.value]
  await loadDepartments()
}

onMounted(() => {
  if (selectedIds.value.length) {
    loadDepartments()
  }
})
</script>

<style scoped lang="less">
.dept-select-trigger {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dept-select-trigger.is-disabled,
.dept-select-trigger.is-preview {
  cursor: default;
  background: var(--el-fill-color-light);
}

.dept-select-placeholder {
  color: var(--el-text-color-placeholder);
}

.dept-select-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dept-select-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  background: var(--el-fill-color);
  border-radius: 4px;
}

.dept-select-tag-close {
  cursor: pointer;
}

.dept-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dept-picker-selected {
  display: flex;
  align-items: flex-start;
  min-height: 72px;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.dept-picker-selected-empty {
  flex: 1;
  align-self: stretch;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--el-text-color-placeholder);
}

.dept-picker-tree {
  max-height: 360px;
  overflow: auto;
  padding: 4px 0;
}

.dept-picker-empty {
  color: var(--el-text-color-secondary);
  padding: 10px 12px;
  text-align: center;
}
</style>
