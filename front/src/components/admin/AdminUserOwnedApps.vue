<template>
  <div v-if="visible" class="owned">
    <h3 class="owned-title">名下应用</h3>
    <p class="owned-hint">这个人已停用。把应用交给别人后，系统管理员仍打不开应用（除非交给自己）。</p>
    <el-table v-loading="loading" :data="apps" border size="small">
      <el-table-column prop="name" label="应用" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="openTransfer(row)">
            移交
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !apps.length" description="没有名下应用" />

    <el-dialog
      v-model="transferVisible"
      title="移交所有者"
      width="520px"
      draggable
      append-to-body
      destroy-on-close
      @closed="resetTransfer"
    >
      <p class="owned-hint">
        把「{{ currentApp?.name }}」交给启用中的人。可以交给自己。
      </p>
      <FormMemberSelect
        :field="memberField"
        :model-value="pickedId"
        @update:model-value="onPick"
      />
      <template #footer>
        <el-button @click="closeTransfer">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onConfirm">
          确定移交
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'
import { listOwnedAppsApi, transferOwnedAppApi } from '../../api/admin'

const props = defineProps({
  user: { type: Object, default: null },
  isSystemAdmin: { type: Boolean, default: false },
})

const loading = ref(false)
const saving = ref(false)
const apps = ref([])
const transferVisible = ref(false)
const currentApp = ref(null)
const pickedId = ref(undefined)
const memberField = {
  type: 'member',
  placeholder: '选择新的所有者',
}

const visible = computed(
  () => props.isSystemAdmin && props.user?.status === 'disabled' && props.user?.id,
)

async function load() {
  if (!visible.value) {
    apps.value = []
    return
  }
  loading.value = true
  try {
    apps.value = (await listOwnedAppsApi(props.user.id)) || []
  } catch {
    apps.value = []
  } finally {
    loading.value = false
  }
}

function openTransfer(row) {
  currentApp.value = row
  transferVisible.value = true
}

function closeTransfer() {
  transferVisible.value = false
}

function resetTransfer() {
  currentApp.value = null
  pickedId.value = undefined
}

function onPick(value) {
  pickedId.value = value
}

async function onConfirm() {
  const userId = Number(pickedId.value)
  if (!Number.isInteger(userId) || userId <= 0) {
    ElMessage.warning('请选择要交给的人')
    return
  }
  saving.value = true
  try {
    await transferOwnedAppApi(props.user.id, currentApp.value.id, userId)
    ElMessage.success('已移交')
    transferVisible.value = false
    await load()
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.user?.id, props.user?.status, props.isSystemAdmin],
  load,
  { immediate: true },
)
</script>

<style scoped lang="less">
.owned {
  margin-top: 16px;
}

.owned-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.owned-hint {
  margin: 0 0 8px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
