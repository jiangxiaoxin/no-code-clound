import { computed, ref, unref, watch } from 'vue'
import { useUserStore } from '../../stores/user'

export const CREATED_AT_KEY = '__createdAt'
export const DEFAULT_COL_WIDTH = 100

export function normalizeColWidth(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < DEFAULT_COL_WIDTH) {
    return DEFAULT_COL_WIDTH
  }
  return Math.round(n)
}

export function useColumnPrefs({ appId, formId, tableFields, schemaLoading }) {
  const userStore = useUserStore()
  const columnPrefs = ref([])

  const visibleColumns = computed(() =>
    columnPrefs.value.filter((col) => col.visible),
  )

  function columnStorageKey() {
    const userId = userStore.user?.id
    const currentAppId = unref(appId)
    const currentFormId = unref(formId)
    if (!userId || !currentAppId || !currentFormId) {
      return ''
    }
    return `form-list-columns:${userId}:${currentAppId}:${currentFormId}`
  }

  function loadStoredColumnPrefs() {
    const key = columnStorageKey()
    if (!key) {
      return []
    }
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]')
      if (!Array.isArray(raw)) {
        return []
      }
      return raw
        .filter((item) => item && typeof item.key === 'string')
        .map((item) => ({
          key: item.key,
          visible: item.visible !== false,
          fixed: item.fixed === 'left' || item.fixed === 'right' ? item.fixed : '',
          minWidth: normalizeColWidth(item.minWidth),
        }))
    } catch {
      return []
    }
  }

  function saveColumnPrefs() {
    const key = columnStorageKey()
    if (!key || unref(schemaLoading) || !columnPrefs.value.length) {
      return
    }
    localStorage.setItem(
      key,
      JSON.stringify(
        columnPrefs.value.map((col) => ({
          key: col.key,
          visible: col.visible !== false,
          fixed: col.fixed === 'left' || col.fixed === 'right' ? col.fixed : '',
          minWidth: normalizeColWidth(col.minWidth),
        })),
      ),
    )
  }

  function defaultColumnPrefs() {
    return [
      ...unref(tableFields).map((field) => ({
        key: field.key,
        title: field.title || '未命名',
        visible: true,
        fixed: '',
        minWidth: DEFAULT_COL_WIDTH,
      })),
      {
        key: CREATED_AT_KEY,
        title: '创建时间',
        visible: true,
        fixed: '',
        minWidth: DEFAULT_COL_WIDTH,
      },
    ]
  }

  function syncColumnPrefs() {
    if (unref(schemaLoading)) {
      return
    }
    const defaults = defaultColumnPrefs()
    const stored = columnPrefs.value.length
      ? columnPrefs.value
      : loadStoredColumnPrefs()
    if (!stored.length) {
      columnPrefs.value = defaults
      return
    }
    const defaultMap = new Map(defaults.map((col) => [col.key, col]))
    const kept = stored.filter((col) => defaultMap.has(col.key))
    const keptKeys = new Set(kept.map((col) => col.key))
    const next = kept.map((col) => ({
      ...defaultMap.get(col.key),
      visible: col.visible !== false,
      fixed: col.fixed === 'left' || col.fixed === 'right' ? col.fixed : '',
      minWidth: normalizeColWidth(col.minWidth),
    }))
    defaults.forEach((col, index) => {
      if (keptKeys.has(col.key)) {
        return
      }
      next.splice(index, 0, col)
    })
    columnPrefs.value = next
  }

  watch(tableFields, syncColumnPrefs, { immediate: true })

  watch(
    () => unref(schemaLoading),
    (loading) => {
      if (!loading) {
        syncColumnPrefs()
      }
    },
  )

  watch(
    () => userStore.user?.id,
    (id) => {
      if (!id || unref(schemaLoading) || !unref(formId)) {
        return
      }
      const stored = loadStoredColumnPrefs()
      if (stored.length) {
        columnPrefs.value = stored
      }
      syncColumnPrefs()
    },
  )

  watch(
    columnPrefs,
    () => {
      saveColumnPrefs()
    },
    { deep: true },
  )

  return {
    columnPrefs,
    visibleColumns,
  }
}
