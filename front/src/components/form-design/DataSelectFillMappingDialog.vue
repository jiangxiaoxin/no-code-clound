<template>
  <el-dialog
    :model-value="modelValue"
    title="设置填充字段"
    width="720px"
    align-center
    draggable
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-button type="primary" link :icon="Plus" @click="addRow">新建</el-button>
    <div class="mapping-rows">
      <div v-for="(item, index) in draft" :key="index" class="mapping-row">
        <span>数据源表中的</span>
        <el-select
          v-model="item.sourceKey"
          class="mapping-select"
          size="small"
          placeholder="请选择字段"
        >
          <el-option
            v-for="field in sourceFields"
            :key="field.key"
            :label="field.title || field.key"
            :value="field.key"
          />
        </el-select>
        <span>字段 将填充到 本表单中</span>
        <el-select
          v-model="item.targetKey"
          class="mapping-select"
          size="small"
          placeholder="请选择字段"
        >
          <el-option
            v-for="field in formFields"
            :key="field.key"
            :label="field.title || field.key"
            :value="field.key"
          />
        </el-select>
        <span>的字段</span>
        <el-button
          type="danger"
          link
          :icon="Delete"
          @click="draft.splice(index, 1)"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { cloneFillMappings } from './dataSelect'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  fillMappings: { type: Array, default: () => [] },
  sourceFields: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const draft = ref([])

watch(
  () => [props.modelValue, props.fillMappings],
  () => {
    if (!props.modelValue) return
    const next = cloneFillMappings(props.fillMappings)
    draft.value = next.length ? next : [{ sourceKey: '', targetKey: '' }]
  },
)

function addRow() {
  draft.value.push({ sourceKey: '', targetKey: '' })
}

function confirm() {
  const next = cloneFillMappings(draft.value).filter(
    (item) => item.sourceKey && item.targetKey,
  )
  emit('confirm', next)
  emit('update:modelValue', false)
}
</script>

<style scoped lang="less">
.mapping-rows {
  display: flex;
  flex-direction: column;
  max-height: 360px;
  margin-top: 8px;
  overflow: auto;
}

.mapping-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  gap: 4px;
}

// .mapping-row + .mapping-row {
//   border-top: 1px solid var(--el-border-color-lighter);
// }

.mapping-select {
  width: 160px;
  margin: 0 8px;
}
</style>
