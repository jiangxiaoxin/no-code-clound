<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="480px"
    draggable
    destroy-on-close
    @update:model-value="onVisible"
    @closed="reset"
  >
    <div class="wf-picker">
      <FormMemberSelect
        :field="memberField"
        :model-value="picked"
        @update:model-value="onPicked"
      />
      <el-input
        v-model="comment"
        type="textarea"
        :rows="2"
        placeholder="说明（选填）"
      />
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'transfer' },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const comment = ref('')
const picked = ref(props.mode === 'addSign' ? [] : undefined)
const memberField = computed(() =>
  props.mode === 'addSign'
    ? { type: 'member-multiple', placeholder: '请选择人员' }
    : { type: 'member', placeholder: '请选择人员' },
)
const title = computed(() =>
  props.mode === 'addSign' ? '加签给谁' : '转交给谁',
)

function onVisible(value) {
  emit('update:modelValue', value)
}

function onPicked(value) {
  picked.value = value
}

function reset() {
  comment.value = ''
  picked.value = props.mode === 'addSign' ? [] : undefined
}

function onCancel() {
  emit('update:modelValue', false)
}

function onConfirm() {
  if (props.mode === 'addSign') {
    const assigneeIds = Array.isArray(picked.value) ? picked.value : []
    if (!assigneeIds.length) {
      ElMessage.warning('请选择加签人员')
      return
    }
    emit('confirm', { assigneeIds, comment: comment.value.trim() })
    return
  }
  const assigneeId = Number(picked.value)
  if (!Number.isInteger(assigneeId) || assigneeId <= 0) {
    ElMessage.warning('请选择人员')
    return
  }
  emit('confirm', { assigneeId, comment: comment.value.trim() })
}
</script>

<style scoped lang="less">
.wf-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
