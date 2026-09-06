<template>
  <el-dialog
    :model-value="modelValue"
    title="移交所有者"
    width="520px"
    draggable
    destroy-on-close
    @update:model-value="onVisible"
  >
    <p class="hint">
      交出去后你变成普通使用用户，将离开应用后台。不能选自己。
    </p>
    <FormMemberSelect
      :field="memberField"
      :model-value="pickedId"
      @update:model-value="onPick"
    />
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onConfirm">
        确定移交
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  currentUserId: { type: Number, default: 0 },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm'])
const pickedId = ref(undefined)
const memberField = {
  type: 'member',
  placeholder: '选择新的所有者',
}

function onVisible(value) {
  emit('update:modelValue', value)
  if (!value) {
    pickedId.value = undefined
  }
}

function onPick(value) {
  pickedId.value = value
}

function close() {
  emit('update:modelValue', false)
}

function onConfirm() {
  const userId = Number(pickedId.value)
  if (!Number.isInteger(userId) || userId <= 0) {
    ElMessage.warning('请选择要交给的人')
    return
  }
  if (userId === props.currentUserId) {
    ElMessage.warning('不能移交给自己')
    return
  }
  emit('confirm', userId)
}
</script>

<style scoped lang="less">
.hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
