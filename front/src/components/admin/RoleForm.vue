<template>
  <el-dialog
    :model-value="visible"
    :title="role ? '编辑角色' : '新建角色'"
    width="640px"
    align-center
    destroy-on-close
    @close="$emit('update:visible', false)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="left" label-width="100px">
      <el-form-item label="角色名称" prop="name">
        <el-input v-model="form.name" maxlength="32" show-word-limit />
      </el-form-item>
      <el-form-item label="角色代码" prop="code">
        <el-input
          v-model="form.code"
          :disabled="Boolean(role)"
          maxlength="64"
          placeholder="小写字母、数字或下划线"
        />
      </el-form-item>
      <el-form-item label="说明" prop="description">
        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="255" />
      </el-form-item>
      <el-form-item label="权限">
        <div v-for="group in groups" :key="group.module" class="perm-group">
          <b class="perm-module">{{ group.module }}</b>
          <el-checkbox-group v-model="form.permissionCodes" :disabled="!canAssign">
            <el-checkbox
              v-for="item in group.permissions"
              :key="item.code"
              :value="item.code"
            >
              {{ item.name }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  role: { type: Object, default: null },
  groups: { type: Array, default: () => [] },
  canAssign: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'submit'])
const formRef = ref()
const form = reactive({
  name: '',
  code: '',
  description: '',
  permissionCodes: [],
})

const rules = {
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { min: 1, max: 32, message: '角色名称须为 1–32 个字', trigger: 'blur' },
  ],
  code: [
    { required: true, message: '请输入角色代码', trigger: 'blur' },
    {
      pattern: /^[a-z0-9_]{2,64}$/,
      message: '角色代码须为 2–64 位小写字母、数字或下划线',
      trigger: 'blur',
    },
  ],
}

watch(
  () => [props.visible, props.role],
  () => {
    if (!props.visible) {
      return
    }
    form.name = props.role?.name || ''
    form.code = props.role?.code || ''
    form.description = props.role?.description || ''
    form.permissionCodes = [...(props.role?.permissionCodes || [])]
  },
)

async function onSubmit() {
  await formRef.value.validate()
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
  }
  if (!props.role) {
    payload.code = form.code.trim()
  }
  if (props.canAssign) {
    payload.permissionCodes = [...form.permissionCodes]
  }
  emit('submit', payload)
}
</script>

<style scoped lang="less">
.perm-group {
  margin-bottom: 12px;
}

.perm-module {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}
</style>
