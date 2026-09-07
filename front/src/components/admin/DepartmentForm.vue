<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="480px"
    align-center
    draggable
    destroy-on-close
    @close="onClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="left"
      label-width="100px"
    >
      <el-form-item label="部门名称" prop="name">
        <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="请输入部门名称" />
      </el-form-item>
      <el-form-item label="上级部门" prop="parentId">
        <el-tree-select
          v-model="form.parentId"
          class="field-full"
          :data="parentOptions"
          :props="{ label: 'name', value: 'id', children: 'children' }"
          check-strictly
          clearable
          placeholder="请选择上级部门"
        />
      </el-form-item>
      <el-form-item label="负责人" prop="leaderUserId">
        <FormMemberSelect
          class="field-full"
          :field="leaderField"
          :model-value="form.leaderUserId"
          :user-names="leaderNames"
          @update:model-value="onLeaderChange"
        />
      </el-form-item>
      <el-form-item label="排序" prop="sortOrder">
        <el-input-number v-model="form.sortOrder" :controls="false" :precision="0" placeholder="请输入排序" align="left" style="width: 100%;"/>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="onClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  tree: { type: Array, default: () => [] },
  department: { type: Object, default: null },
  defaultParentId: { type: Number, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'submit'])

const formRef = ref()
const form = reactive({
  name: '',
  parentId: null,
  leaderUserId: null,
  sortOrder: 0,
})
const leaderField = { type: 'member', placeholder: '请选择部门负责人' }

const rules = {
  name: [
    { required: true, message: '请输入部门名称', trigger: 'blur' },
    { min: 1, max: 64, message: '部门名称须为 1–64 个字', trigger: 'blur' },
  ],
}

const title = computed(() => (props.department ? '编辑部门' : '新建部门'))

const parentOptions = computed(() => {
  const excludeId = props.department?.id
  return filterTree(props.tree, excludeId)
})

const leaderNames = computed(() => {
  const leader = props.department?.leader
  if (!leader) return {}
  const label =
    leader.status === 'disabled'
      ? `${leader.displayName}（已停用）`
      : leader.displayName
  return {
    [leader.id]: label,
    [String(leader.id)]: label,
  }
})

watch(
  () => [props.visible, props.department, props.defaultParentId],
  () => {
    if (!props.visible) {
      return
    }
    form.name = props.department?.name || ''
    form.parentId = props.department
      ? props.department.parentId
      : props.defaultParentId
    form.leaderUserId = props.department?.leader?.id ?? null
    form.sortOrder = props.department?.sortOrder ?? 0
  },
)

function filterTree(nodes, excludeId) {
  if (!excludeId) {
    return nodes
  }
  return nodes
    .filter((node) => node.id !== excludeId)
    .map((node) => ({
      ...node,
      children: filterTree(node.children || [], excludeId),
    }))
}

function onLeaderChange(value) {
  const id = Number(value)
  form.leaderUserId = Number.isInteger(id) && id > 0 ? id : null
}

function onClose() {
  emit('update:visible', false)
}

async function onSubmit() {
  await formRef.value.validate()
  emit('submit', {
    name: form.name.trim(),
    parentId: form.parentId ?? null,
    sortOrder: form.sortOrder ?? 0,
    leaderUserId: form.leaderUserId ?? null,
  })
}
</script>

<style scoped lang="less">
.field-full {
  width: 100%;
}

.field-full :deep(.member-select-trigger) {
  width: 100%;
  box-sizing: border-box;
  height: var(--el-component-size);
  min-height: var(--el-component-size);
  padding: 0 11px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.field-full :deep(.member-select-tags),
.field-full :deep(.member-select-tag) {
  min-width: 0;
  overflow: hidden;
}

.field-full :deep(.member-select-placeholder),
.field-full :deep(.member-select-tag span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
