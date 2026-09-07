<template>
  <div class="wf-props">
    <label class="wf-label">连线标题</label>
    <el-input :model-value="edge.title" @update:model-value="onTitle" />
    <template v-if="fromBranch">
      <el-checkbox :model-value="Boolean(edge.isDefault)" @change="onDefault">
        其他情况
      </el-checkbox>
      <div v-if="!edge.isDefault" class="wf-hint">
        在下面配条件。字段只列主表（含标签页），不含子表列。
      </div>
      <FormFilterConditions
        v-if="!edge.isDefault"
        :filters="filterModel"
        :app-id="appId"
        :source-fields="conditionFields"
        :form-fields="conditionFields"
      />
      <div class="wf-sort">
        <el-button @click="moveUp">上移</el-button>
        <el-button @click="moveDown">下移</el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import FormFilterConditions from '../form-design/FormFilterConditions.vue'
import { flattenFields } from '../form-design/tabsField.js'

const props = defineProps({
  edge: { type: Object, default: null },
  fromBranch: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
  formFields: { type: Array, default: () => [] },
})
const emit = defineEmits(['change', 'move'])

const conditionFields = computed(() =>
  flattenFields(props.formFields).filter((field) => field.type !== 'subform'),
)

// 条件组件是就地改传进去的对象，所以这里自己存一份，改完再写回连线。
// 换连线时才重建，避免写回后又被覆盖。
const filterModel = ref(modelFromEdge())

watch(() => props.edge?.key, resetFilterModel)

watch(filterModel, saveFilters, { deep: true })

function modelFromEdge() {
  return {
    match: props.edge?.when?.logic === 'any' ? 'any' : 'all',
    conditions: (props.edge?.when?.items || []).map((item) => ({ ...item })),
  }
}

function resetFilterModel() {
  filterModel.value = modelFromEdge()
}

function saveFilters(value) {
  if (!props.edge || props.edge.isDefault) return
  patch({
    when: {
      logic: value.match === 'any' ? 'any' : 'all',
      items: (value.conditions || []).map((item) => ({ ...item })),
    },
  })
}

function patch(next) {
  emit('change', { ...props.edge, ...next })
}

function onTitle(title) {
  patch({ title })
}

function onDefault(isDefault) {
  patch({
    isDefault,
    when: isDefault ? undefined : props.edge.when,
  })
}

function moveUp() {
  emit('move', -1)
}

function moveDown() {
  emit('move', 1)
}
</script>

<style scoped lang="less">
.wf-props {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
  padding: 12px;
  border-left: 1px solid var(--el-border-color);
}

.wf-label {
  font-weight: 600;
}

.wf-hint {
  color: var(--el-text-color-secondary);
}

.wf-sort {
  display: flex;
}
</style>
