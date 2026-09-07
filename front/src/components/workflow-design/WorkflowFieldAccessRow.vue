<template>
  <div class="wf-access-row">
    <span class="wf-access-name" :title="field.title || field.key">
      {{ field.title || field.key }}
    </span>
    <el-radio-group :model-value="modelValue" class="wf-access-options" :disabled="disabled" @change="onChange">
      <div v-for="mode in allModes" :key="mode" class="wf-access-opt">
        <el-radio v-if="options.includes(mode)" :value="mode" />
      </div>
    </el-radio-group>
    <div class="wf-access-brief">
      <el-checkbox :model-value="brief" :disabled="disabled" @change="onBriefChange" />
    </div>
  </div>
</template>

<script setup>
const allModes = ['editable', 'readonly', 'hidden']

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: String, default: 'readonly' },
  brief: { type: Boolean, default: false },
  options: { type: Array, default: () => ['readonly'] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change', 'brief'])

function onChange(value) {
  emit('change', props.field.key, value)
}

function onBriefChange(checked) {
  emit('brief', props.field.key, checked)
}
</script>

<style scoped lang="less">
.wf-access-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wf-access-name {
  flex: 0 0 72px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wf-access-options {
  display: flex;
  flex: 1;
  min-width: 0;
}

.wf-access-opt {
  display: flex;
  flex: 1;
  justify-content: center;
  min-width: 0;
}

.wf-access-brief {
  display: flex;
  flex: 0 0 64px;
  justify-content: center;
  min-width: 0;
}

.wf-access-brief :deep(.el-checkbox) {
  height: auto;
  margin: 0;
}
</style>
