<template>
  <el-dialog
    :model-value="modelValue"
    title="选择关联表单"
    width="520px"
    align-center
    draggable
    destroy-on-close
    @update:model-value="onVisibleChange"
    @open="loadOptions"
  >
    <div v-loading="loading" class="relate-subform-picker">
      <div v-if="!loading && !options.length" class="relate-subform-empty">
        还没有表单关联本表单，请先在其他表单里添加「关联数据」并选择本表单
      </div>
      <el-radio-group v-else v-model="picked" class="relate-subform-options">
        <el-radio
          v-for="item in options"
          :key="`${item.formId}:${item.relateKey}`"
          :value="`${item.formId}:${item.relateKey}`"
        >
          {{ item.label }}
        </el-radio>
      </el-radio-group>
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" :disabled="!picked" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { listFormFieldsApi } from '../../api/apps'
import { relateSubformOptions } from './relateSubform.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const loading = ref(false)
const options = ref([])
const picked = ref('')

async function loadOptions() {
  picked.value = ''
  loading.value = true
  try {
    const forms = (await listFormFieldsApi(props.appId, { include: 'relate' })) || []
    options.value = relateSubformOptions(forms, props.formId)
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
}

function onVisibleChange(value) {
  emit('update:modelValue', value)
  if (!value) {
    emit('cancel')
  }
}

function onCancel() {
  emit('update:modelValue', false)
}

function onConfirm() {
  const found = options.value.find(
    (item) => `${item.formId}:${item.relateKey}` === picked.value,
  )
  if (!found) return
  emit('confirm', found)
  emit('update:modelValue', false)
}
</script>

<style scoped lang="less">
.relate-subform-picker {
  min-height: 80px;
}

.relate-subform-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 20px;
}

.relate-subform-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
</style>
