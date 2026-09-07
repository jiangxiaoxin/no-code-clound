<template>
  <el-dropdown trigger="click" @command="onCommand" placement="bottom-start">
    <div class="wf-ver-trigger">
      <span>{{ currentTitle }}</span>
      <span class="wf-ver-dot" :class="currentDotClass" />
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="row in sorted"
          :key="row.id"
          :command="row.id"
        >
          <div class="wf-ver-item">
            <el-icon v-if="row.id === viewingId" class="wf-ver-check">
              <Check />
            </el-icon>
            <span v-else class="wf-ver-check" />
            <span class="wf-ver-name">{{ row.title }}</span>
            <span class="wf-ver-status" :class="statusClass(row)">
              {{ row.enabled ? '启用中' : '设计中' }}
            </span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item divided command="add">添加新版本</el-dropdown-item>
        <el-dropdown-item command="manage">管理已有版本</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { computed } from 'vue'
import { Check } from '@element-plus/icons-vue'
import { sortVersions, versionTitle } from './workflowVersion.js'

const props = defineProps({
  versions: { type: Array, default: () => [] },
  viewingId: { type: Number, default: 0 },
})
const emit = defineEmits(['pick', 'add', 'manage'])

const sorted = computed(() => sortVersions(props.versions))
const current = computed(
  () => sorted.value.find((row) => row.id === props.viewingId) || sorted.value[0],
)
const currentTitle = computed(() =>
  current.value ? versionTitle(current.value.version) : '流程版本',
)
const currentDotClass = computed(() =>
  current.value?.enabled ? 'is-enabled' : 'is-draft',
)

function statusClass(row) {
  return row.enabled ? 'is-enabled' : 'is-draft'
}

function onPickVersion(id) {
  emit('pick', id)
}

function onAddVersion() {
  emit('add')
}

function onOpenManage() {
  emit('manage')
}

function onCommand(command) {
  if (command === 'add') {
    onAddVersion()
    return
  }
  if (command === 'manage') {
    onOpenManage()
    return
  }
  onPickVersion(command)
}
</script>

<style scoped lang="less">
.wf-ver-trigger {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
}

.wf-ver-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 8px;
  border-radius: 50%;
  background: var(--el-color-warning);
}

.wf-ver-dot.is-enabled {
  background: var(--el-color-success);
}

.wf-ver-item {
  display: flex;
  align-items: center;
  min-width: 220px;
}

.wf-ver-check {
  width: 16px;
  margin-right: 8px;
}

.wf-ver-name {
  flex: 1;
  min-width: 0;
}

.wf-ver-status {
  margin-left: 12px;
  padding: 0 6px;
  font-size: 12px;
  border-radius: 4px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.wf-ver-status.is-enabled {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}
</style>
