<template>
  <el-dialog
    :model-value="visible"
    :title="user ? '编辑人员' : '新建人员'"
    width="560px"
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
      autocomplete="off"
    >
      <el-form-item label="姓名" prop="displayName">
        <el-input
          v-model="form.displayName"
          maxlength="64"
          show-word-limit
          autocomplete="off"
          placeholder="请输入姓名"
        />
      </el-form-item>
      <el-form-item label="用户名" prop="username">
        <el-input
          v-model="form.username"
          maxlength="32"
          autocomplete="off"
          placeholder="请输入用户名"
        />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" autocomplete="off" placeholder="请输入邮箱" />
      </el-form-item>
      <el-form-item v-if="!user" label="初始密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="请输入初始密码"
        />
      </el-form-item>
      <el-form-item label="部门" prop="departmentIds">
        <el-tree-select
          v-model="form.departmentIds"
          class="field-full"
          :data="activeDepartments"
          :props="{ label: 'name', value: 'id', children: 'children' }"
          multiple
          show-checkbox
          check-strictly
          :disabled="!canAssignDepartments"
          placeholder="请选择部门"
        />
      </el-form-item>
      <el-form-item label="角色" prop="roleIds">
        <el-select
          v-model="form.roleIds"
          class="field-full"
          multiple
          :disabled="!canAssignRoles"
          placeholder="请选择角色"
        >
          <el-option
            v-for="role in activeRoles"
            :key="role.id"
            :label="role.name"
            :value="role.id"
          />
        </el-select>
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
  user: { type: Object, default: null },
  departments: { type: Array, default: () => [] },
  roles: { type: Array, default: () => [] },
  canAssignDepartments: { type: Boolean, default: false },
  canAssignRoles: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'submit'])
const formRef = ref()
const form = reactive({
  displayName: '',
  username: '',
  email: '',
  password: '',
  departmentIds: [],
  roleIds: [],
})

const rules = {
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_]{3,32}$/,
      message: '用户名须为 3–32 位字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效邮箱', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入初始密码', trigger: 'blur' },
    { min: 6, max: 72, message: '密码须为 6–72 位', trigger: 'blur' },
  ],
}

const activeDepartments = computed(() => filterActiveTree(props.departments))
const activeRoles = computed(() =>
  props.roles.filter((role) => role.status === 'active'),
)

watch(
  () => [props.visible, props.user],
  () => {
    if (!props.visible) {
      return
    }
    form.displayName = props.user?.displayName || ''
    form.username = props.user?.username || ''
    form.email = props.user?.email || ''
    form.password = ''
    form.departmentIds = (props.user?.departments || []).map((item) => item.id)
    form.roleIds = (props.user?.roles || []).map((item) => item.id)
  },
)

function filterActiveTree(nodes) {
  return (nodes || [])
    .filter((node) => node.status === 'active')
    .map((node) => ({
      ...node,
      children: filterActiveTree(node.children),
    }))
}

async function onSubmit() {
  await formRef.value.validate()
  const payload = {
    displayName: form.displayName.trim(),
    username: form.username.trim(),
    email: form.email.trim(),
  }
  if (!props.user) {
    payload.password = form.password
    payload.departmentIds = props.canAssignDepartments ? [...form.departmentIds] : []
    payload.roleIds = props.canAssignRoles ? [...form.roleIds] : []
  } else {
    if (props.canAssignDepartments) {
      payload.departmentIds = [...form.departmentIds]
    }
    if (props.canAssignRoles) {
      payload.roleIds = [...form.roleIds]
    }
  }
  emit('submit', payload)
}
</script>

<style scoped lang="less">
.field-full {
  width: 100%;
}
</style>
