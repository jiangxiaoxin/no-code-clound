<template>
  <div class="wf-props">
    <div class="wf-props-body">
      <template v-if="node?.type === 'approve' || node?.type === 'cc'">
        <label class="wf-label">节点名称</label>
        <el-input :model-value="node.title" :disabled="disabled" @update:model-value="onTitle" />
        <label class="wf-label">指定人员</label>
        <FormMemberSelect :field="memberField" :model-value="node.approver?.userIds || []"
          :disabled="disabled" @update:model-value="onUserIds" />
        <label class="wf-label">指定角色</label>
        <el-button :disabled="disabled" @click="openRoles">选择角色</el-button>
        <div v-if="selectedRoles.length" class="wf-selected-roles">
          <span
            v-for="role in selectedRoles"
            :key="role.id"
            class="wf-selected-role"
          >
            {{ role.name }}
          </span>
        </div>
        <el-checkbox :model-value="node.approver?.sameDeptAsInitiator !== false" :disabled="disabled" @change="onSameDept">
          限定与发起人同部门
        </el-checkbox>
        <label class="wf-label wf-label-break">表单内人员字段</label>
        <el-select multiple :disabled="disabled" :model-value="node.approver?.memberFieldKeys || []" @update:model-value="onMemberFields">
          <el-option v-for="field in memberFields" :key="field.key" :label="field.title || field.key"
            :value="field.key" />
        </el-select>
        <label class="wf-label wf-label-break">部门负责人</label>
        <el-checkbox :model-value="Boolean(node.approver?.deptLeaderOfInitiator)" :disabled="disabled" @change="onDeptLeader">
          发起人所属部门的负责人
        </el-checkbox>
        <template v-if="node?.type === 'approve'">
          <label class="wf-label">多人时</label>
          <el-radio-group :model-value="node.signMode || 'any'" :disabled="disabled" @change="onSignMode">
            <el-radio value="any">或签（一人即可）</el-radio>
            <el-radio value="all">会签（全部通过）</el-radio>
          </el-radio-group>
          <label class="wf-label wf-label-break">意见是否必填</label>
          <el-checkbox :model-value="Boolean(node.commentRequiredOnApprove)" :disabled="disabled" @change="onCommentRequiredOnApprove" class="same-as-radio">
            通过时意见必填
          </el-checkbox>
          <el-checkbox :model-value="node.commentRequiredOnReject !== false" :disabled="disabled" @change="onCommentRequiredOnReject" class="same-as-radio">
            拒绝时意见必填
          </el-checkbox>
          <div class="wf-label wf-label-break">审批操作</div>
          <el-checkbox :model-value="Boolean(node.allowTransfer)" :disabled="disabled" @change="onAllowTransfer" class="same-as-radio">
            允许转交
          </el-checkbox>
          <el-checkbox :model-value="Boolean(node.allowAddSign)" :disabled="disabled" @change="onAllowAddSign" class="same-as-radio">
            允许加签
          </el-checkbox>
          <el-checkbox :model-value="node.allowReturnPrevious !== false" :disabled="disabled" @change="onAllowReturnPrevious" class="same-as-radio">
            允许退回上一节点
          </el-checkbox>
          <el-checkbox :model-value="Boolean(node.allowReturnStart)" :disabled="disabled" @change="onAllowReturnStart" class="same-as-radio">
            允许打回发起人
          </el-checkbox>
          <p class="wf-action-hint">打回发起人：发起人改单后继续审，不是驳回</p>
        </template>
        <div class="wf-label">字段权限</div>
        <div class="wf-access-table">
          <div v-if="node?.type === 'cc'" class="wf-access-header wf-access-header-cc">
            <span class="wf-access-name" />
            <div class="wf-access-options">
              <div class="wf-access-opt">
                <span class="wf-access-col-title">不可见</span>
                <el-link type="primary" underline="never" :disabled="disabled" @click="onToggleAccessAllHidden">
                  {{ bulkLabel('hidden') }}
                </el-link>
              </div>
            </div>
            <div class="wf-access-brief">
              <span class="wf-access-col-title">简报</span>
              <el-link type="primary" underline="never" :disabled="disabled" @click="onToggleBriefAll">
                {{ briefBulkLabel }}
              </el-link>
            </div>
          </div>
          <div v-else class="wf-access-header">
            <span class="wf-access-name" />
            <div class="wf-access-options">
              <div class="wf-access-opt">
                <span class="wf-access-col-title">可编辑</span>
                <el-link type="primary" underline="never" :disabled="disabled" @click="onToggleAccessAllEditable">
                  {{ bulkLabel('editable') }}
                </el-link>
              </div>
              <div class="wf-access-opt">
                <span class="wf-access-col-title">只读</span>
                <el-link type="primary" underline="never" :disabled="disabled" @click="onToggleAccessAllReadonly">
                  {{ bulkLabel('readonly') }}
                </el-link>
              </div>
              <div class="wf-access-opt">
                <span class="wf-access-col-title">不可见</span>
                <el-link type="primary" underline="never" :disabled="disabled" @click="onToggleAccessAllHidden">
                  {{ bulkLabel('hidden') }}
                </el-link>
              </div>
            </div>
            <div class="wf-access-brief">
              <span class="wf-access-col-title">简报</span>
              <el-link type="primary" underline="never" :disabled="disabled" @click="onToggleBriefAll">
                {{ briefBulkLabel }}
              </el-link>
            </div>
          </div>
          <WorkflowFieldAccessRow v-for="field in accessFields" :key="field.key" :field="field"
            :model-value="accessOf(field)" :brief="briefOf(field)" :options="accessOptions(field)"
            :disabled="disabled" @change="onAccess" @brief="onBrief" />
        </div>
      </template>
      <template v-else-if="node?.type === 'branch'">
        <label class="wf-label">分支名称</label>
        <el-input :model-value="node.title" :disabled="disabled" @update:model-value="onTitle" />
      </template>
      <template v-else-if="node?.type === 'start' || node?.type === 'end'">
        <label class="wf-label">节点名称</label>
        <el-input :model-value="node.title" :disabled="disabled" @update:model-value="onTitle" />
      </template>
      <RolePicker v-model="roleVisible" :model-value-ids="node?.approver?.roleIds || []"
        @update:model-value-ids="onRoleIds" />
      <el-button class="wf-props-delete" type="danger" plain :disabled="disabled || node?.type === 'start'" @click="onDelete">
        删除节点
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { listOrgRolesApi } from '../../api/org'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'
import { flattenFields } from '../form-design/tabsField.js'
import { resolveFieldAccess } from './fieldAccess.js'
import RolePicker from './RolePicker.vue'
import WorkflowFieldAccessRow from './WorkflowFieldAccessRow.vue'

const props = defineProps({
  node: { type: Object, default: null },
  formFields: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change', 'delete'])
const roleVisible = ref(false)
const orgRoles = ref([])
const memberField = { type: 'member-multiple', placeholder: '请选择人员' }

const memberFields = computed(() =>
  flattenFields(props.formFields).filter(
    (field) => field.type === 'member' || field.type === 'member-multiple',
  ),
)

const accessFields = computed(() =>
  flattenFields(props.formFields).filter(
    (field) =>
      field.type !== 'relate-subform' &&
      field.type !== 'divider' &&
      field.type !== 'tabs',
  ),
)

function patch(next) {
  if (props.disabled) return
  emit('change', { ...props.node, ...next })
}

function onTitle(title) {
  patch({ title })
}

function onUserIds(userIds) {
  patch({
    approver: { ...(props.node.approver || {}), userIds },
  })
}

function onRoleIds(roleIds) {
  patch({
    approver: { ...(props.node.approver || {}), roleIds },
  })
}

async function onSameDept(value) {
  if (!value) {
    try {
      await ElMessageBox.confirm(
        '该角色下所有部门的人都会收到待办',
        '取消同部门限定',
        { confirmButtonText: '仍然取消', cancelButtonText: '返回', type: 'warning' },
      )
    } catch {
      return
    }
  }
  patch({
    approver: { ...(props.node.approver || {}), sameDeptAsInitiator: value },
  })
}

function onMemberFields(memberFieldKeys) {
  patch({
    approver: { ...(props.node.approver || {}), memberFieldKeys },
  })
}

function onDeptLeader(deptLeaderOfInitiator) {
  patch({
    approver: { ...(props.node.approver || {}), deptLeaderOfInitiator },
  })
}

function onSignMode(signMode) {
  patch({ signMode })
}

function onCommentRequiredOnApprove(commentRequiredOnApprove) {
  patch({ commentRequiredOnApprove })
}

function onCommentRequiredOnReject(commentRequiredOnReject) {
  patch({ commentRequiredOnReject })
}

function onAllowTransfer(allowTransfer) {
  patch({ allowTransfer: Boolean(allowTransfer) })
}

function onAllowAddSign(allowAddSign) {
  patch({ allowAddSign: Boolean(allowAddSign) })
}

function onAllowReturnPrevious(allowReturnPrevious) {
  patch({ allowReturnPrevious: Boolean(allowReturnPrevious) })
}

function onAllowReturnStart(allowReturnStart) {
  patch({ allowReturnStart: Boolean(allowReturnStart) })
}

function accessOf(field) {
  return resolveFieldAccess(props.node?.fieldAccess, field.key)
}

function accessOptions(field) {
  if (props.node?.type === 'cc') return ['hidden']
  if (
    field.type === 'subform' ||
    field.type === 'currentUser' ||
    field.type === 'currentUserDept' ||
    field.type === 'serialNumber'
  ) {
    return ['readonly', 'hidden']
  }
  return ['editable', 'readonly', 'hidden']
}

function onAccess(key, value) {
  patch({
    fieldAccess: { ...(props.node.fieldAccess || {}), [key]: value },
  })
}

const DEFAULT_BRIEF_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'time',
  'date',
  'datetime',
])

function isDefaultBrief(field) {
  return DEFAULT_BRIEF_TYPES.has(field.type)
}

function resolvedBriefKeys() {
  if (Array.isArray(props.node?.briefFieldKeys)) {
    return [...props.node.briefFieldKeys]
  }
  return accessFields.value.filter(isDefaultBrief).map((field) => field.key)
}

function briefOf(field) {
  return resolvedBriefKeys().includes(field.key)
}

function allBriefSelected() {
  return (
    accessFields.value.length > 0 &&
    accessFields.value.every((field) => briefOf(field))
  )
}

const briefBulkLabel = computed(() => (allBriefSelected() ? '全不选' : '全选'))

function onBrief(key, checked) {
  const current = resolvedBriefKeys()
  const next = checked
    ? [...new Set([...current, key])]
    : current.filter((item) => item !== key)
  patch({ briefFieldKeys: next })
}

function onToggleBriefAll() {
  if (allBriefSelected()) {
    patch({ briefFieldKeys: [] })
    return
  }
  patch({ briefFieldKeys: accessFields.value.map((field) => field.key) })
}

function fieldsForMode(mode) {
  return accessFields.value.filter((field) => accessOptions(field).includes(mode))
}

function allSetTo(mode) {
  const eligible = fieldsForMode(mode)
  return eligible.length > 0 && eligible.every((field) => accessOf(field) === mode)
}

function bulkLabel(mode) {
  return allSetTo(mode) ? '全不选' : '全选'
}

function toggleAccessAll(mode) {
  const eligible = fieldsForMode(mode)
  const next = { ...(props.node.fieldAccess || {}) }
  if (allSetTo(mode)) {
    for (const field of eligible) {
      if (accessOf(field) === mode) {
        next[field.key] = 'readonly'
      }
    }
  } else {
    for (const field of eligible) {
      next[field.key] = mode
    }
  }
  patch({ fieldAccess: next })
}

function onToggleAccessAllEditable() {
  toggleAccessAll('editable')
}

function onToggleAccessAllReadonly() {
  toggleAccessAll('readonly')
}

function onToggleAccessAllHidden() {
  toggleAccessAll('hidden')
}

function openRoles() {
  if (props.disabled) return
  roleVisible.value = true
}

async function loadRoles() {
  try {
    orgRoles.value = (await listOrgRolesApi()) || []
  } catch {
    orgRoles.value = []
  }
}

async function onDelete() {
  if (props.disabled || props.node?.type === 'start') return
  const title = props.node?.title || '该节点'
  try {
    await ElMessageBox.confirm(
      `确定删除「${title}」吗？连到该节点的连线也会一起删除。`,
      '删除节点',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  emit('delete')
}

const selectedRoles = computed(() => {
  const ids = props.node?.approver?.roleIds || []
  const byId = new Map(orgRoles.value.map((role) => [role.id, role]))
  return ids.map((id) => ({
    id,
    name: byId.get(id)?.name || `角色 ${id}`,
  }))
})

onMounted(loadRoles)
</script>

<style scoped lang="less">
@import './workflowProps.less';

.wf-selected-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}

.wf-selected-role {
  padding: 2px 8px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color);
  border-radius: 4px;
}

.wf-label-break {
  margin-top: 12px;
}

.wf-access-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wf-access-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.wf-access-name {
  flex: 0 0 72px;
}

.wf-access-options {
  display: flex;
  flex: 1;
  min-width: 0;
}

.wf-access-opt {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  gap: 2px;
}

.wf-access-col-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.wf-access-brief {
  display: flex;
  flex: 0 0 64px;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  gap: 2px;
}

.same-as-radio {
  :deep(.el-checkbox__label) {
    line-height: 21px;
  }
}

.wf-action-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
