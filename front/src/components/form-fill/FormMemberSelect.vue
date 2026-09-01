<template>
  <div class="member-select">
    <div
      class="member-select-trigger"
      :class="{
        'is-disabled': disabled,
        'is-placeholder': !selectedIds.length,
        'is-preview': preview,
      }"
      @click="onOpenPicker"
    >
      <div v-if="selectedIds.length" class="member-select-tags">
        <span
          v-for="id in selectedIds"
          :key="id"
          class="member-select-tag"
        >
          <span>{{ nameOf(id) }}</span>
          <el-icon
            v-if="!disabled && !preview"
            class="member-select-tag-close"
            @click.stop="onRemove(id)"
          >
            <Close />
          </el-icon>
        </span>
      </div>
      <span v-else class="member-select-placeholder">
        {{ field.placeholder || '请选择' }}
      </span>
    </div>
    <el-dialog
      v-if="!preview"
      v-model="pickerVisible"
      title="选择人员"
      width="720px"
      draggable
      destroy-on-close
      @open="onPickerOpen"
    >
      <div class="member-picker">
        
        <div class="member-picker-selected">
          <div v-if="draftIds.length" class="member-select-tags">
            <span
              v-for="id in draftIds"
              :key="id"
              class="member-select-tag"
            >
              <span>{{ nameOf(id) }}</span>
              <el-icon
                class="member-select-tag-close"
                @click.stop="onRemoveDraft(id)"
              >
                <Close />
              </el-icon>
            </span>
          </div>
          <div v-else class="member-picker-selected-empty">未选择人员</div>
        </div>
        <el-input
          v-model="keyword"
          clearable
          placeholder="按姓名 / 用户名搜索"
          @change="onKeywordChange"
        />
        <div v-if="emptyCustom" class="member-picker-empty">没有可选择的人员</div>
        <div v-else class="member-picker-body">
          <div class="member-picker-nav">
            <button
              type="button"
              class="member-picker-nav-item"
              :class="{ 'is-active': browseMode === 'dept' }"
              @click="onBrowseDept"
            >
              部门
            </button>
            <button
              v-if="showRoles"
              type="button"
              class="member-picker-nav-item"
              :class="{ 'is-active': browseMode === 'role' }"
              @click="onBrowseRole"
            >
              角色
            </button>
            <button
              type="button"
              class="member-picker-nav-item"
              :class="{ 'is-active': browseMode === 'user' }"
              @click="onBrowseUser"
            >
              人员
            </button>
          </div>
          <div class="member-picker-side">
            <el-tree
              v-if="browseMode === 'dept'"
              :data="departmentTree"
              node-key="id"
              :props="{ label: 'name', children: 'children' }"
              highlight-current
              default-expand-all
              @node-click="onDeptNodeClick"
            />
            <div v-else-if="browseMode === 'role'" class="member-picker-roles">
              <button
                v-for="role in roles"
                :key="role.id"
                type="button"
                class="member-picker-role"
                :class="{ 'is-active': selectedRoleId === role.id }"
                @click="onSelectRole(role)"
              >
                {{ role.name }}
              </button>
            </div>
            <div v-else class="member-picker-hint">范围内全部人员</div>
          </div>
          <div class="member-picker-list">
            <div
              v-for="user in visibleUsers"
              :key="user.id"
              class="member-picker-user"
              :class="{ 'is-active': draftIds.includes(user.id) }"
              @click="onPickUser(user)"
            >
              <el-checkbox
                v-if="multiple"
                :model-value="draftIds.includes(user.id)"
              >
                {{ user.displayName }}
              </el-checkbox>
              <el-radio
                v-else
                :model-value="draftIds[0]"
                :value="user.id"
              >
                {{ user.displayName }}
              </el-radio>
            </div>
            <div v-if="!visibleUsers.length" class="member-picker-hint">暂无人员</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="closePicker">取消</el-button>
        <el-button type="primary" @click="confirmPick">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { listOrgDepartmentsApi, listOrgRolesApi, listOrgUsersApi } from '../../api/org'
import {
  candidateUsers,
  memberDisplayName,
  memberValueIds,
  normalizeMemberScope,
  pruneMembersOutOfScope,
} from '../form-design/memberField.js'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  recordValues: { type: Object, default: () => ({}) },
  userNames: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const multiple = computed(() => props.field.type === 'member-multiple')
const selectedIds = computed(() =>
  memberValueIds(props.field.type, props.modelValue),
)

const pickerVisible = ref(false)
const keyword = ref('')
const browseMode = ref('dept')
const selectedDeptId = ref(null)
const selectedRoleId = ref(null)
const departments = ref([])
const roles = ref([])
const users = ref([])
const draftIds = ref([])

const showRoles = computed(
  () => normalizeMemberScope(props.field.memberScope) !== 'dept_field',
)

const candidates = computed(() =>
  candidateUsers(props.field, users.value, departments.value, props.recordValues),
)

const emptyCustom = computed(
  () =>
    normalizeMemberScope(props.field.memberScope) === 'custom' &&
    !candidates.value.length,
)

const orgNames = computed(() => {
  const map = { ...props.userNames }
  for (const user of users.value) {
    map[user.id] = user.displayName
    map[String(user.id)] = user.displayName
  }
  return map
})

const departmentTree = computed(() => {
  if (normalizeMemberScope(props.field.memberScope) !== 'dept_field') {
    return departments.value
  }
  const rootId = Number(props.recordValues?.[props.field.sourceDeptFieldKey])
  if (!Number.isInteger(rootId) || rootId <= 0) return []
  const found = findDeptNode(departments.value, rootId)
  return found ? [found] : []
})

const visibleUsers = ref([])

function refreshVisibleUsers() {
  const q = keyword.value.trim().toLowerCase()
  let list = candidates.value
  // debugger
  if (browseMode.value === 'dept' && selectedDeptId.value) {
    const node = findDeptNode(departments.value, selectedDeptId.value)
    const ids = collectDeptIds(node)
    list = list.filter((user) => ids.has(user.departmentId))
  }
  if (browseMode.value === 'role' && selectedRoleId.value) {
    list = list.filter((user) => (user.roleIds || []).includes(selectedRoleId.value))
  }
  if (!q) {
    visibleUsers.value = list
    return
  }
  // displayName 是人名  username 是用户名
  visibleUsers.value = list.filter(
    (user) =>
      user.displayName.toLowerCase().includes(q) ||
      String(user.username || '').toLowerCase().includes(q),
  )
}

function onKeywordChange() {
  refreshVisibleUsers()
}

function nameOf(id) {
  return memberDisplayName(id, orgNames.value)
}

function findDeptNode(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node
    const child = findDeptNode(node.children, id)
    if (child) return child
  }
  return null
}

function collectDeptIds(node, ids = new Set()) {
  if (!node) return ids
  ids.add(node.id)
  for (const child of node.children || []) {
    collectDeptIds(child, ids)
  }
  return ids
}

function onOpenPicker() {
  if (props.disabled || props.preview) return
  pickerVisible.value = true
}

function closePicker() {
  pickerVisible.value = false
}

function onPickUser(user) {
  if (multiple.value) {
    onToggleUser(user.id)
    return
  }
  draftIds.value = [user.id]
}

function onBrowseDept() {
  browseMode.value = 'dept'
  refreshVisibleUsers()
}

function onBrowseRole() {
  browseMode.value = 'role'
  refreshVisibleUsers()
}

function onBrowseUser() {
  browseMode.value = 'user'
  refreshVisibleUsers()
}

function onDeptNodeClick(node) {
  selectedDeptId.value = node.id
  refreshVisibleUsers()
}

function onSelectRole(role) {
  selectedRoleId.value = role.id
  refreshVisibleUsers()
}

function onRemove(id) {
  if (props.disabled || props.preview) return
  if (multiple.value) {
    emit(
      'update:modelValue',
      selectedIds.value.filter((item) => item !== id),
    )
    return
  }
  emit('update:modelValue', undefined)
}

function onRemoveDraft(id) {
  draftIds.value = draftIds.value.filter((item) => item !== id)
}

function onToggleUser(id) {
  if (draftIds.value.includes(id)) {
    draftIds.value = draftIds.value.filter((item) => item !== id)
    return
  }
  draftIds.value = [...draftIds.value, id]
}

function confirmPick() {
  if (multiple.value) {
    emit('update:modelValue', [...draftIds.value])
  } else {
    emit('update:modelValue', draftIds.value[0])
  }
  closePicker()
}

async function loadOrg() {
  const [deptRows, roleRows, userRows] = await Promise.all([
    listOrgDepartmentsApi(),
    showRoles.value ? listOrgRolesApi() : Promise.resolve([]),
    listOrgUsersApi(),
  ])
  departments.value = deptRows || []
  roles.value = roleRows || []
  users.value = userRows || []
}

async function onPickerOpen() {
  keyword.value = ''
  browseMode.value = 'dept'
  selectedDeptId.value = null
  selectedRoleId.value = null
  await loadOrg()
  draftIds.value = selectedIds.value.filter((id) =>
    candidateUsers(
      props.field,
      users.value,
      departments.value,
      props.recordValues,
    ).some((item) => item.id === id),
  )
  refreshVisibleUsers()
}

onMounted(() => {
  if (normalizeMemberScope(props.field.memberScope) === 'dept_field') {
    loadOrg()
  }
})

watch(
  () => props.recordValues?.[props.field.sourceDeptFieldKey],
  () => {
    if (normalizeMemberScope(props.field.memberScope) !== 'dept_field') return
    if (!users.value.length) return
    const allowed = new Set(candidates.value.map((item) => item.id))
    const next = pruneMembersOutOfScope(
      props.field.type,
      props.modelValue,
      allowed,
    )
    const current = multiple.value
      ? selectedIds.value
      : selectedIds.value[0]
    if (JSON.stringify(next ?? null) === JSON.stringify(current ?? null)) return
    emit('update:modelValue', next)
  },
)
</script>

<style scoped lang="less">
.member-select-trigger {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.member-select-trigger.is-disabled,
.member-select-trigger.is-preview {
  cursor: default;
  background: var(--el-fill-color-light);
}

.member-select-placeholder {
  color: var(--el-text-color-placeholder);
}

.member-select-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-select-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  background: var(--el-fill-color);
  border-radius: 4px;
}

.member-select-tag-close {
  cursor: pointer;
}

.member-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-picker-selected {
  display: flex;
  align-items: flex-start;
  min-height: 120px;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.member-picker-selected-empty {
  flex: 1;
  align-self: stretch;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--el-text-color-placeholder);
}

.member-picker-body {
  display: flex;
  min-height: 320px;
  border: 1px solid var(--el-border-color-lighter);
}

.member-picker-nav {
  display: flex;
  flex-direction: column;
  width: 88px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.member-picker-nav-item,

.member-picker-user-btn {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
}

.member-picker-role{
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  padding: 4px;
}
.member-picker-nav-item.is-active,
.member-picker-role.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.member-picker-side {
  width: 180px;
  overflow: auto;
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 8px;
}

.member-picker-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-picker-user {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px;

  :deep(.el-radio),
  :deep(.el-checkbox) {
    margin-right: 0;
    height: auto;
  }
}

.member-picker-user.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.member-picker-empty,
.member-picker-hint {
  color: var(--el-text-color-secondary);
  padding: 10px 12px;
  text-align: center;
}

.member-picker-roles {
  display: flex;
  flex-direction: column;
}
</style>
