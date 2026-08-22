<template>
  <el-dialog
    :model-value="visible"
    :title="dictionary ? '编辑字典' : '新建字典'"
    width="720px"
    align-center
    destroy-on-close
    @close="$emit('update:visible', false)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="left" label-width="100px">
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          maxlength="32"
          show-word-limit
          placeholder="请输入字典名称"
        />
      </el-form-item>
      <el-form-item label="编码" prop="code">
        <el-input
          v-model="form.code"
          :disabled="Boolean(dictionary)"
          maxlength="64"
          placeholder="小写字母、数字或下划线"
        />
      </el-form-item>
      <el-form-item label="说明" prop="description">
        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="255" />
      </el-form-item>
      <el-form-item label="字典项">
        <div class="items">
          <el-table :data="form.items" border stripe size="small" max-height="250">
            <el-table-column label="名称" min-width="140">
              <template #default="{ row }">
                <el-input size="small" v-model="row.label" maxlength="64" placeholder="请输入名称" />
              </template>
            </el-table-column>
            <el-table-column label="值" min-width="140">
              <template #default="{ row }">
                <el-input size="small" v-model="row.value" maxlength="64" placeholder="请输入值" />
              </template>
            </el-table-column>
            <el-table-column label="排序" width="100">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.sortOrder"
                  class="sort-input"
                  :controls="false"
                  :precision="0"
                  size="small"
                />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-select v-model="row.status" size="small">
                  <el-option label="启用" value="active" />
                  <el-option label="停用" value="disabled" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="操作">
              <template #default="{ $index }">
                <el-button link type="danger" size="small" @click="form.items.splice($index, 1)">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button class="add-item" type="primary" size="small" @click="addItem">添加选项</el-button>
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
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: { type: Boolean, default: false },
  dictionary: { type: Object, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'submit'])
const formRef = ref()
const form = reactive({
  name: '',
  code: '',
  description: '',
  items: [],
})

const rules = {
  name: [
    { required: true, message: '请输入字典名称', trigger: 'blur' },
    { min: 1, max: 32, message: '字典名称须为 1–32 个字', trigger: 'blur' },
  ],
  code: [
    { required: true, message: '请输入字典编码', trigger: 'blur' },
    {
      pattern: /^[a-z0-9_]{2,64}$/,
      message: '字典编码须为 2–64 位小写字母、数字或下划线',
      trigger: 'blur',
    },
  ],
}

function emptyItem() {
  return { label: '', value: '', sortOrder: 0, status: 'active' }
}

function addItem() {
  form.items.push(emptyItem())
}

watch(
  () => [props.visible, props.dictionary],
  () => {
    if (!props.visible) {
      return
    }
    form.name = props.dictionary?.name || ''
    form.code = props.dictionary?.code || ''
    form.description = props.dictionary?.description || ''
    form.items = (props.dictionary?.items || []).map((item) => ({
      label: item.label,
      value: item.value,
      sortOrder: item.sortOrder ?? 0,
      status: item.status || 'active',
    }))
  },
)

async function onSubmit() {
  await formRef.value.validate()
  const items = form.items.map((item) => ({
    label: item.label.trim(),
    value: item.value.trim(),
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status || 'active',
  }))
  if (items.some((item) => !item.label || !item.value)) {
    ElMessage.error('请填写字典项名称和值')
    return
  }
  const values = items.map((item) => item.value)
  if (new Set(values).size !== values.length) {
    ElMessage.error('同一请求里选项值不能重复')
    return
  }
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    items,
  }
  if (!props.dictionary) {
    payload.code = form.code.trim()
  }
  emit('submit', payload)
}
</script>

<style scoped lang="less">
.items {
  width: 100%;
}

.add-item {
  margin-top: 8px;
}

.sort-input {
  width: 100%;
}

.sort-input :deep(.el-input) {
  width: 100%;
}
</style>
