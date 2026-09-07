<template>
  <div class="wf-access-row">
    <span class="wf-access-name" :title="field.title || field.key">
      {{ field.title || field.key }}
    </span>
    <el-radio-group :model-value="modelValue" class="wf-access-options" @change="onChange">
      <div v-for="mode in allModes" :key="mode" class="wf-access-opt">
        <el-radio v-if="options.includes(mode)" :value="mode" />
      </div>
    </el-radio-group>
  </div>
</template>

<script setup>
const allModes = ['editable', 'readonly', 'hidden']

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: String, default: 'readonly' },
  options: { type: Array, default: () => ['readonly'] },
})
const emit = defineEmits(['change'])

function onChange(value) {
  emit('change', props.field.key, value)
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
</style>
