<template>
  <div class="page">
    <div class="page-toolbar">
      <h2 class="page-title">配置权限</h2>
      <div class="toolbar-actions">
        <el-button v-if="isOwner" @click="openTransfer">移交所有者</el-button>
        <el-button type="primary" @click="openPicker">添加人员</el-button>
      </div>
    </div>
    <p class="page-hint">
      所有者始终能配置。要从他手里拿走配置权，请点【移交所有者】。
    </p>
    <div class="table-wrap">
      <el-table v-loading="loading" :data="items" border stripe height="100%">
        <el-table-column label="姓名" min-width="140">
          <template #default="{ row }">
            {{ row.displayName }}
            <el-tag v-if="row.isOwner" size="small" type="warning">所有者</el-tag>
            <el-tag
              v-if="row.status === 'disabled'"
              size="small"
              type="info"
            >
              已停用
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="账号" min-width="120" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              v-if="!row.isOwner"
              link
              type="danger"
              @click="onRemove(row)"
            >
              移除
            </el-button>
            <span v-else-if="row.status === 'disabled'" class="owner-hint">
              停用后请到管理后台移交
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="pickerVisible"
      title="添加可配置的人"
      width="840px"
      draggable
      destroy-on-close
      @closed="resetPicker"
    >
      <p class="page-hint">用部门或角色只是找人，确定后只会把人选进名单。</p>
      <FormMemberSelect
        :field="memberField"
        :model-value="pickedIds"
        @update:model-value="onPickIds"
      />
      <template #footer>
        <el-button @click="closePicker">取消</el-button>
        <el-button type="primary" :loading="adding" @click="onAdd">
          确定
        </el-button>
      </template>
    </el-dialog>

    <AppTransferDialog
      v-model="transferVisible"
      :current-user-id="currentUserId"
      :saving="transferring"
      @confirm="onTransfer"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormMemberSelect from '../../components/form-fill/FormMemberSelect.vue'
import AppTransferDialog from '../../components/app-backend/AppTransferDialog.vue'
import {
  addConfiguratorsApi,
  getAppApi,
  listConfiguratorsApi,
  removeConfiguratorApi,
  transferAppOwnerApi,
} from '../../api/apps'
import { useUserStore } from '../../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const appId = computed(() => Number(route.params.id))
const currentUserId = computed(() => Number(userStore.user?.id) || 0)
const loading = ref(false)
const adding = ref(false)
const transferring = ref(false)
const items = ref([])
const isOwner = ref(false)
const pickerVisible = ref(false)
const transferVisible = ref(false)
const pickedIds = ref([])
const memberField = {
  type: 'member-multiple',
  placeholder: '选择人员',
}

async function load() {
  loading.value = true
  try {
    const [list, app] = await Promise.all([
      listConfiguratorsApi(appId.value),
      getAppApi(appId.value),
    ])
    items.value = Array.isArray(list) ? list : []
    isOwner.value = Boolean(app?.isOwner)
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

function openPicker() {
  pickerVisible.value = true
}

function closePicker() {
  pickerVisible.value = false
}

function resetPicker() {
  pickedIds.value = []
}

function onPickIds(value) {
  pickedIds.value = Array.isArray(value) ? value : []
}

async function onAdd() {
  const userIds = (pickedIds.value || []).map(Number).filter((id) => id > 0)
  if (!userIds.length) {
    ElMessage.warning('请选择人员')
    return
  }
  adding.value = true
  try {
    const result = await addConfiguratorsApi(appId.value, userIds)
    const hints = result?.hints || []
    if (hints.length) {
      ElMessage.info(hints.join('；'))
    } else {
      ElMessage.success('已加入配置名单')
    }
    pickerVisible.value = false
    await load()
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    adding.value = false
  }
}

async function onRemove(row) {
  try {
    await ElMessageBox.confirm(
      '他不能再配置本应用；如果使用范围也没有覆盖他，他同时失去使用权，首页不再出现这个应用。',
      `移除「${row.displayName}」`,
      { type: 'warning', confirmButtonText: '移除' },
    )
  } catch {
    return
  }
  try {
    const result = await removeConfiguratorApi(appId.value, row.userId)
    ElMessage.success('已移除')
    if (result && result.canUse === false) {
      router.push('/')
      return
    }
    await load()
  } catch {
    // 错误已由 http 拦截器提示
  }
}

function openTransfer() {
  transferVisible.value = true
}

async function onTransfer(userId) {
  transferring.value = true
  try {
    await transferAppOwnerApi(appId.value, userId)
    ElMessage.success('已移交所有者')
    transferVisible.value = false
    router.push('/')
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    transferring.value = false
  }
}

onMounted(load)
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';

.toolbar-actions {
  display: flex;
  align-items: center;
}

.page-hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.owner-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
