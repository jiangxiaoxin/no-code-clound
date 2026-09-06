<template>
  <el-dialog
    :model-value="modelValue"
    title="选择角色"
    width="480px"
    draggable
    @update:model-value="onVisible"
  >
    <el-checkbox-group :model-value="modelValueIds" @change="onChange">
      <div v-for="role in roles" :key="role.id" class="role-row">
        <el-checkbox :value="role.id">{{ role.name }}</el-checkbox>
      </div>
    </el-checkbox-group>
    <el-empty v-if="!roles.length" description="没有启用中的角色" />
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { listOrgRolesApi } from '../../api/org'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  modelValueIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'update:modelValueIds', 'confirm'])
const roles = ref([])

async function loadRoles() {
  try {
    roles.value = (await listOrgRolesApi()) || []
  } catch {
    roles.value = []
  }
}

function onVisible(value) {
  emit('update:modelValue', value)
}

function onChange(value) {
  emit('update:modelValueIds', value)
}

function close() {
  emit('update:modelValue', false)
}

function confirm() {
  emit('confirm', [...(props.modelValueIds || [])])
  close()
}

onMounted(loadRoles)
</script>

<style scoped lang="less">
.role-row {
  display: flex;
  align-items: center;
  min-height: 32px;
}
</style>
