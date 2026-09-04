<template>
  <el-drawer
    :model-value="modelValue"
    title="数据详情"
    direction="rtl"
    size="1000px"
    destroy-on-close
    @update:model-value="onVisibleChange"
    @closed="resetDetail"
  >
    <div v-if="record" class="fill-drawer-body">
      <FormFillGrid
        ref="gridRef"
        :app-id="appId"
        :fields="fields"
        :values="detailValues"
        :dict-items-by-code="dictItemsByCode"
        :disabled="!editing"
        :updating="true"
        :user-names="record?.userNames || {}"
        :record-id="record?.id || ''"
      />
      <div v-if="!editing" class="record-audit">
        <div class="record-audit-row">
          <span>创建人：{{ createdByLabel }}</span>
          <span>创建时间：{{ createdAtLabel }}</span>
        </div>
        <div class="record-audit-row">
          <span>更新人：{{ updatedByLabel }}</span>
          <span>更新时间：{{ updatedAtLabel }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="record-detail-footer">
        <div>
          <el-button v-if="!editing && canEdit" type="primary" @click="startEdit">
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
          <el-button v-else @click="closeDrawer">关闭</el-button>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateFormRecordApi } from '../../api/apps'
import FormFillGrid from '../form-fill/FormFillGrid.vue'
import { cloneRecordValues, firstRequiredError, buildRecordData } from '../form-fill/fillValues.js'
import { formatDateTime } from '../../utils/timeValue.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  appId: { type: Number, required: true },
  formId: { type: Number, default: null },
  canEdit: { type: Boolean, default: true },
  startEditing: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const editing = ref(false)
const saving = ref(false)
const detailValues = reactive({})
const snapshot = ref({})
const gridRef = ref(null)

const createdByLabel = computed(() => props.record?.createdByName || '')
const updatedByLabel = computed(() => props.record?.updatedByName || '')
const createdAtLabel = computed(() => formatDateTime(props.record?.createdAt))
const updatedAtLabel = computed(() => formatDateTime(props.record?.updatedAt))

function applyValues(data) {
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
  Object.assign(detailValues, cloneRecordValues(props.fields, data))
  snapshot.value = cloneRecordValues(props.fields, data)
}

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function closeDrawer() {
  emit('update:modelValue', false)
}

function startEdit() {
  editing.value = true
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
  const err = firstRequiredError(props.fields, detailValues)
  if (err) {
    ElMessage.warning(err.message)
    gridRef.value?.revealField(err.key)
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
      buildRecordData(props.fields, detailValues, { clearEmpty: true }),
    )
    applyValues(updated.data)
    editing.value = false
    ElMessage.success('保存成功')
    emit('saved', updated)
    closeDrawer()
  } catch {
    return
  } finally {
    saving.value = false
  }
}

watch(
  [() => props.modelValue, () => props.record?.id, () => props.startEditing],
  () => {
    if (props.modelValue && props.record) {
      editing.value = Boolean(props.startEditing && props.canEdit)
      applyValues(props.record.data)
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.record-audit {
  display: flex;
  flex-direction: column;
  margin-top: 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  background-color: var(--el-disabled-bg-color);
  padding: 6px;
  border-radius: 6px;
}

.record-audit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.record-detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-detail-footer-right {
  display: flex;
}
</style>
