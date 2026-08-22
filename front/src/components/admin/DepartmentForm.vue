<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="480px"
    align-center
    destroy-on-close
    @close="$emit('update:visible', false)"
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
      <el-form-item label="排序" prop="sortOrder">
        <el-input-number v-model="form.sortOrder" :controls="false" :precision="0" placeholder="请输入排序"/>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'

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
  sortOrder: 0,
})

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

async function onSubmit() {
  await formRef.value.validate()
  emit('submit', {
    name: form.name.trim(),
    parentId: form.parentId ?? null,
    sortOrder: form.sortOrder ?? 0,
  })
}
</script>

<style scoped lang="less">
.field-full {
  width: 100%;
}
</style>
