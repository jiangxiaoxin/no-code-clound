<template>
  <div class="wf-props">
    <template v-if="node?.type === 'approve'">
      <label class="wf-label">节点名称</label>
      <el-input :model-value="node.title" @update:model-value="onTitle" />
      <label class="wf-label">指定人员</label>
      <FormMemberSelect
        :field="memberField"
        :model-value="node.approver?.userIds || []"
        @update:model-value="onUserIds"
      />
      <label class="wf-label">指定角色</label>
      <el-button @click="openRoles">选择角色</el-button>
      <div v-if="roleNames" class="wf-hint">{{ roleNames }}</div>
      <el-checkbox
        :model-value="node.approver?.sameDeptAsInitiator !== false"
        @change="onSameDept"
      >
        限定与发起人同部门
      </el-checkbox>
      <label class="wf-label">表单内人员字段</label>
      <el-select
        multiple
        :model-value="node.approver?.memberFieldKeys || []"
        @update:model-value="onMemberFields"
      >
        <el-option
          v-for="field in memberFields"
          :key="field.key"
          :label="field.title || field.key"
          :value="field.key"
        />
      </el-select>
      <label class="wf-label">多人时</label>
      <el-radio-group :model-value="node.signMode || 'any'" @change="onSignMode">
        <el-radio value="any">或签（一人即可）</el-radio>
        <el-radio value="all">会签（全部通过）</el-radio>
      </el-radio-group>
      <el-checkbox
        :model-value="Boolean(node.commentRequiredOnApprove)"
        @change="onCommentRequired"
      >
        通过时意见必填
      </el-checkbox>
      <div class="wf-label">字段权限</div>
      <div class="wf-access-table">
        <div class="wf-access-header">
          <span class="wf-access-name" />
          <div class="wf-access-options">
            <div class="wf-access-opt">
              <span class="wf-access-col-title">可编辑</span>
              <el-link type="primary" underline="never" @click="onToggleAccessAllEditable">
                {{ bulkLabel('editable') }}
              </el-link>
            </div>
            <div class="wf-access-opt">
              <span class="wf-access-col-title">只读</span>
              <el-link type="primary" underline="never" @click="onToggleAccessAllReadonly">
                {{ bulkLabel('readonly') }}
              </el-link>
            </div>
            <div class="wf-access-opt">
              <span class="wf-access-col-title">不可见</span>
              <el-link type="primary" underline="never" @click="onToggleAccessAllHidden">
                {{ bulkLabel('hidden') }}
              </el-link>
            </div>
          </div>
        </div>
        <WorkflowFieldAccessRow
          v-for="field in accessFields"
          :key="field.key"
          :field="field"
          :model-value="accessOf(field)"
          :options="accessOptions(field)"
          @change="onAccess"
        />
      </div>
    </template>
    <template v-else-if="node?.type === 'branch'">
      <label class="wf-label">分支名称</label>
      <el-input :model-value="node.title" @update:model-value="onTitle" />
    </template>
    <div v-else class="wf-hint">开始和结束节点不用改属性</div>
    <RolePicker
      v-model="roleVisible"
      :model-value-ids="node?.approver?.roleIds || []"
      @update:model-value-ids="onRoleIds"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'
import { flattenFields } from '../form-design/tabsField.js'
import RolePicker from './RolePicker.vue'
import WorkflowFieldAccessRow from './WorkflowFieldAccessRow.vue'

const props = defineProps({
  node: { type: Object, default: null },
  formFields: { type: Array, default: () => [] },
})
const emit = defineEmits(['change'])
const roleVisible = ref(false)
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

function onSignMode(signMode) {
  patch({ signMode })
}

function onCommentRequired(commentRequiredOnApprove) {
  patch({ commentRequiredOnApprove })
}

function accessOf(field) {
  return props.node?.fieldAccess?.[field.key] || 'readonly'
}

function accessOptions(field) {
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
  roleVisible.value = true
}

const roleNames = computed(() => {
  const ids = props.node?.approver?.roleIds || []
  if (!ids.length) return ''
  return `已选 ${ids.length} 个角色`
})
</script>

<style scoped lang="less">
.wf-props {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
  padding: 12px;
  overflow: auto;
  border-left: 1px solid var(--el-border-color);
}

.wf-label {
  font-weight: 600;
}

.wf-hint {
  color: var(--el-text-color-secondary);
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
</style>
