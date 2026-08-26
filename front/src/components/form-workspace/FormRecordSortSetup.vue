<template>
  <el-popover v-model:visible="visible" placement="bottom-end" :width="380" trigger="click">
    <template #reference>
      <el-button :icon="Sort" link :type="modelValue.length ? 'primary' : undefined">
        排序
      </el-button>
    </template>
    <div class="sort-setup">
      <button class="sort-add" type="button" @click="addRule">
        <el-icon><Plus /></el-icon>
        添加排序规则
      </button>
      <div v-if="draftRules.length" class="sort-rules">
        <div
          v-for="(rule, index) in draftRules"
          :key="rule.id"
          class="sort-rule"
          :class="{ 'is-dragging': dragIndex === index, 'is-drag-over': dragOverIndex === index }"
          @dragover.prevent="dragOverIndex = index"
          @drop.prevent="dropRule(index)"
        >
          <span
            class="sort-handle"
            draggable="true"
            @dragstart.stop="onDragStart($event, index)"
            @dragend="onDragEnd"
          ><el-icon><Rank /></el-icon></span>
          <el-select v-model="rule.key" size="small" class="sort-field">
            <el-option v-for="option in sortOptions" :key="option.key" :label="option.title" :value="option.key" />
          </el-select>
          <el-button-group class="sort-order">
            <el-button size="small" :type="rule.order === 'asc' ? 'primary' : undefined" @click="rule.order = 'asc'">升序</el-button>
            <el-button size="small" :type="rule.order === 'desc' ? 'primary' : undefined" @click="rule.order = 'desc'">降序</el-button>
          </el-button-group>
          <el-button :icon="Delete" link size="small" title="删除" @click="removeRule(index)" />
        </div>
      </div>
      <el-empty v-else :image-size="42" description="暂无排序规则" />
      <div class="sort-footer">
        <el-button type="primary" @click="apply">排序</el-button>
        <el-button link @click="clearRules">删除全部</el-button>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Delete, Plus, Rank, Sort } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  sortOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'apply'])
const visible = ref(false)
const draftRules = ref([])
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
let nextId = 0

function cloneRules(rules) {
  return (rules || []).map((rule) => ({ ...rule, id: rule.id || `sort-${nextId++}` }))
}

watch(() => props.modelValue, (value) => { draftRules.value = cloneRules(value) }, { immediate: true, deep: true })

function addRule() {
  const used = new Set(draftRules.value.map((rule) => rule.key))
  const first = props.sortOptions.find((option) => !used.has(option.key))
  if (!first) return
  draftRules.value.push({ id: `sort-${nextId++}`, key: first.key, order: 'asc' })
}

function removeRule(index) { draftRules.value.splice(index, 1) }
function clearRules() {
  draftRules.value = []
  apply()
}

function apply() {
  const seen = new Set()
  const rules = draftRules.value
    .filter((rule) => {
      if (seen.has(rule.key)) return false
      seen.add(rule.key)
      return true
    })
    .map(({ key, order }) => ({ key, order }))
  emit('update:modelValue', rules)
  emit('apply', rules)
  visible.value = false
}

function onDragStart(event, index) {
  dragIndex.value = index
  dragOverIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}
function onDragEnd() { dragIndex.value = -1; dragOverIndex.value = -1 }
function dropRule(to) {
  const from = dragIndex.value
  if (from < 0 || from === to) return onDragEnd()
  const next = draftRules.value.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  draftRules.value = next
  onDragEnd()
}
</script>

<style scoped lang="less">
.sort-setup { display: flex; flex-direction: column; }
.sort-add { display: inline-flex; align-items: center; align-self: flex-start; padding: 6px 10px; border: 0; background: transparent; color: var(--el-color-primary); cursor: pointer; }
.sort-rules { display: flex; flex-direction: column; margin-top: 8px; padding: 8px; border-radius: 6px; background: var(--el-fill-color-light); }
.sort-rule { display: flex; align-items: center; min-height: 36px; }
.sort-handle { display: inline-flex; flex: none; width: 22px; color: var(--el-text-color-secondary); cursor: grab; }
.sort-field { flex: 1; min-width: 0; }
.sort-order { display: flex; flex: none; margin-left: 8px; }
.sort-rule > .el-button { flex: none; margin-left: 4px; }
.sort-rule.is-dragging { opacity: .55; }
.sort-rule.is-drag-over { outline: 1px dashed var(--el-color-primary); }
.sort-footer { display: flex; align-items: center; margin-top: 12px; }
</style>
