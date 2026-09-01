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
      width="840px"
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
              :current-node-key="selectedDeptId || undefined"
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
            <div v-else class="member-picker-user-filter">
              <el-input
                v-model="keyword"
                clearable
                placeholder="按姓名 / 用户名搜索"
                @change="onKeywordChange"
              />
            </div>
          </div>
          <div class="member-picker-result">
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
              <div v-if="listHint" class="member-picker-hint">{{ listHint }}</div>
            </div>
            <div v-if="showPickerPager" class="member-picker-pager">
              <el-pagination
                background
                layout="total, prev, pager, next"
                :current-page="pickerPage"
                :page-size="PICKER_PAGE_SIZE"
                :total="pickerTotal"
                size="small"
                @current-change="onPickerPageChange"
              />
            </div>
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
  dropMissingMemberNames,
  hasCustomMemberScope,
  memberDisplayName,
  memberValueIds,
  normalizeMemberScope,
  pickerDraftIds,
  positiveIntIds,
  pruneMembersOutOfScope,
} from '../form-design/memberField.js'

const PICKER_PAGE_SIZE = 10

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
const visibleUsers = ref([])
const extraUserNames = ref({})
const draftIds = ref([])
const pickerPage = ref(1)
const pickerTotal = ref(0)
let userQuerySeq = 0

const showRoles = computed(
  () => normalizeMemberScope(props.field.memberScope) !== 'dept_field',
)

const emptyCustom = computed(
  () =>
    normalizeMemberScope(props.field.memberScope) === 'custom' &&
    !hasCustomMemberScope(props.field),
)

const orgNames = computed(() => {
  console.log('calc orgNames========');
  console.log(props.userNames);
  console.log(extraUserNames.value);
  console.log('visibleUsers', visibleUsers.value);
  
    
  const map = { ...props.userNames, ...extraUserNames.value }
  for (const user of visibleUsers.value) {
    map[user.id] = user.displayName
    map[String(user.id)] = user.displayName
  }

  console.log('orgnames000000000000', map);
  
  return map
})

const departmentTree = computed(() => {
  if (normalizeMemberScope(props.field.memberScope) !== 'dept_field') {
    return departments.value
  }
  const rootId = deptFieldRootId()
  if (!rootId) return []
  const found = findDeptNode(departments.value, rootId)
  return found ? [found] : []
})

const canQueryPicker = computed(() => {
  if (emptyCustom.value) return false
  if (
    normalizeMemberScope(props.field.memberScope) === 'dept_field' &&
    !deptFieldRootId()
  ) {
    return false
  }
  if (browseMode.value === 'dept') return Boolean(selectedDeptId.value)
  if (browseMode.value === 'role') return Boolean(selectedRoleId.value)
  return Boolean(keyword.value.trim())
})

const listHint = computed(() => {
  if (canQueryPicker.value) {
    return visibleUsers.value.length ? '' : '暂无人员'
  }
  if (browseMode.value === 'user') {
    return keyword.value.trim() ? '暂无人员' : '请输入姓名或用户名搜索'
  }
  if (browseMode.value === 'role') return '请选择角色'
  return '请选择部门'
})

const showPickerPager = computed(
  () => canQueryPicker.value && pickerTotal.value > 0,
)

function deptFieldRootId() {
  const raw = props.recordValues?.[props.field.sourceDeptFieldKey]
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function rememberUserNames(users) {
  // debugger
  const next = { ...extraUserNames.value }
  for (const user of users || []) {
    if (!user?.id) continue
    next[user.id] = user.displayName
    next[String(user.id)] = user.displayName
  } 
  console.log('rememberUserNames000', next);
  
  extraUserNames.value = next
}

function usersFromResult(data) {
  if (Array.isArray(data)) return data
  return data?.items || []
}

function customScopeParams() {
  if (normalizeMemberScope(props.field.memberScope) !== 'custom') return {}
  const cfg = props.field.memberScopeConfig || {}
  const departmentIds = positiveIntIds(cfg.departmentIds)
  const roleIds = positiveIntIds(cfg.roleIds)
  const userIds = positiveIntIds(cfg.userIds)
  return {
    memberScope: 'custom',
    scopeDepartmentIds: departmentIds.length ? departmentIds.join(',') : undefined,
    scopeRoleIds: roleIds.length ? roleIds.join(',') : undefined,
    scopeUserIds: userIds.length ? userIds.join(',') : undefined,
  }
}

function browseQueryParams() {
  if (browseMode.value === 'dept') {
    return { departmentId: selectedDeptId.value }
  }
  if (browseMode.value === 'role') {
    return { roleId: selectedRoleId.value }
  }
  // displayName 是人名  username 是用户名
  const params = { keyword: keyword.value.trim() }
  if (normalizeMemberScope(props.field.memberScope) === 'dept_field') {
    params.departmentId = deptFieldRootId()
  }
  return params
}

async function loadVisibleUsers() {
  if (!canQueryPicker.value) {
    visibleUsers.value = []
    pickerTotal.value = 0
    return
  }
  // debugger
  const seq = ++userQuerySeq
  visibleUsers.value = []
  pickerTotal.value = 0
  const data = await listOrgUsersApi({
    page: pickerPage.value,
    pageSize: PICKER_PAGE_SIZE,
    ...browseQueryParams(),
    ...customScopeParams(),
  })
  if (seq !== userQuerySeq) return
  visibleUsers.value = usersFromResult(data)
  pickerTotal.value = data?.total || 0
  rememberUserNames(visibleUsers.value)
}

function onKeywordChange() {
  pickerPage.value = 1
  loadVisibleUsers()
}

function onPickerPageChange(page) {
  pickerPage.value = page
  loadVisibleUsers()
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

function onOpenPicker() {
  console.log('--onOpenPicker');
  
  if (props.disabled || props.preview) return
  pickerVisible.value = true
}

function closePicker() {
  pickerVisible.value = false
}

function onPickUser(user) {
  console.log('--onPickUser', user);
  
  if (multiple.value) {
    onToggleUser(user.id)
    return
  }
  draftIds.value = [user.id]
}

function onBrowseDept() {
  browseMode.value = 'dept'
  pickerPage.value = 1
  loadVisibleUsers()
}

function onBrowseRole() {
  browseMode.value = 'role'
  pickerPage.value = 1
  loadVisibleUsers()
}

function onBrowseUser() {
  browseMode.value = 'user'
  pickerPage.value = 1
  loadVisibleUsers()
}

function onDeptNodeClick(node) {
  selectedDeptId.value = node.id
  pickerPage.value = 1
  loadVisibleUsers()
}

function onSelectRole(role) {
  selectedRoleId.value = role.id
  pickerPage.value = 1
  loadVisibleUsers()
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
  const [deptRows, roleRows] = await Promise.all([
    listOrgDepartmentsApi(),
    showRoles.value ? listOrgRolesApi() : Promise.resolve([]),
  ])
  departments.value = deptRows || []
  roles.value = roleRows || []
}

async function hydrateDraft() {
  const ids = selectedIds.value
  if (!ids.length) {
    draftIds.value = []
    return
  }
  const named = usersFromResult(await listOrgUsersApi({ ids: ids.join(',') }))
  rememberUserNames(named)
  extraUserNames.value = dropMissingMemberNames(
    extraUserNames.value,
    ids,
    named.map((user) => user.id),
  )
  const scope = normalizeMemberScope(props.field.memberScope)
  if (scope === 'dept_field' && !deptFieldRootId()) {
    draftIds.value = []
    return
  }
  if (scope === 'all') {
    draftIds.value = pickerDraftIds(ids, named)
    return
  }
  const scoped = usersFromResult(
    await listOrgUsersApi({
      ids: ids.join(','),
      ...(scope === 'dept_field' ? { departmentId: deptFieldRootId() } : {}),
      ...customScopeParams(),
    }),
  )
  draftIds.value = pickerDraftIds(
    ids,
    named,
    new Set(scoped.map((user) => user.id)),
  )
}

async function onPickerOpen() {
  keyword.value = ''
  browseMode.value = 'dept'
  selectedDeptId.value = null
  selectedRoleId.value = null
  pickerPage.value = 1
  pickerTotal.value = 0
  visibleUsers.value = []
  await loadOrg()
  await hydrateDraft()
}

async function pruneByDeptField() {
  if (normalizeMemberScope(props.field.memberScope) !== 'dept_field') return
  const ids = selectedIds.value
  if (!ids.length) return
  const rootId = deptFieldRootId()
  if (!rootId) {
    const next = pruneMembersOutOfScope(props.field.type, props.modelValue, new Set())
    const current = multiple.value ? selectedIds.value : selectedIds.value[0]
    if (JSON.stringify(next ?? null) === JSON.stringify(current ?? null)) return
    emit('update:modelValue', next)
    return
  }
  const scoped = usersFromResult(
    await listOrgUsersApi({ ids: ids.join(','), departmentId: rootId }),
  )
  const allowed = new Set(scoped.map((user) => user.id))
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
}

onMounted(() => {
  if (normalizeMemberScope(props.field.memberScope) === 'dept_field') {
    pruneByDeptField()
  }
})

watch(
  () => props.recordValues?.[props.field.sourceDeptFieldKey],
  () => {
    pruneByDeptField()
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
  max-height: 500px;
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
  width: 220px;
  overflow: auto;
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 8px;
}

.member-picker-user-filter {
  display: flex;
  flex-direction: column;
}

.member-picker-result {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.member-picker-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-picker-pager {
  display: flex;
  flex: none;
  justify-content: flex-end;
  padding: 4px 8px 8px;
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
