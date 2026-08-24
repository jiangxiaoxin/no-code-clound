<template>
  <el-dialog
    :model-value="modelValue"
    title="数据详情"
    width="800px"
    align-center
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="resetDetail"
  >
    <div v-if="record" class="fill-dialog-body">
      <FormFillGrid
        :fields="fields"
        :values="detailValues"
        :dict-items-by-code="dictItemsByCode"
        :disabled="!editing"
      />
    </div>
    <template #footer>
      <div class="record-detail-footer">
        <div>
          <el-button v-if="!editing" type="primary" @click="editing = true">
            编辑
          </el-button>
        </div>
        <div class="record-detail-footer-right">
          <template v-if="editing">
            <el-button @click="cancelEdit">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveDetail">
              保存
            </el-button>
          </template>
          <el-button v-else @click="$emit('update:modelValue', false)">关闭</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateFormRecordApi } from '../../api/apps'
import FormFillGrid from '../form-fill/FormFillGrid.vue'
import { cloneRecordValues, validateRequired, buildRecordData } from '../form-fill/fillValues.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  appId: { type: Number, required: true },
  formId: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const editing = ref(false)
const saving = ref(false)
const detailValues = reactive({})
const snapshot = ref({})

function applyValues(data) {
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
  Object.assign(detailValues, cloneRecordValues(props.fields, data))
  snapshot.value = cloneRecordValues(props.fields, data)
}

function resetDetail() {
  editing.value = false
  snapshot.value = {}
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
}

function cancelEdit() {
  applyValues(snapshot.value)
  editing.value = false
}

async function saveDetail() {
  const message = validateRequired(props.fields, detailValues)
  if (message) {
    ElMessage.warning(message)
    return
  }
  if (!props.record?.id || !props.formId) {
    return
  }
  saving.value = true
  try {
    const updated = await updateFormRecordApi(
      props.appId,
      props.formId,
      props.record.id,
      buildRecordData(props.fields, detailValues),
    )
    applyValues(updated.data)
    editing.value = false
    ElMessage.success('保存成功')
    emit('saved', updated)
  } catch {
    return
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.modelValue, props.record, props.fields],
  () => {
    if (props.modelValue && props.record) {
      editing.value = false
      applyValues(props.record.data)
    }
  },
)
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.record-detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-detail-footer-right {
  display: flex;
}
</style>
