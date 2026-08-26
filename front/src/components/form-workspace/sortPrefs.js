import { computed, ref, unref, watch } from 'vue'
import { useUserStore } from '../../stores/user'

export const CREATED_AT_SORT_KEY = 'createdAt'
export const UPDATED_AT_SORT_KEY = 'updatedAt'
export const CREATED_BY_SORT_KEY = 'createdBy'

const SYSTEM_SORT_OPTIONS = [
  { key: CREATED_AT_SORT_KEY, title: '创建时间' },
  { key: UPDATED_AT_SORT_KEY, title: '更新时间' },
  { key: CREATED_BY_SORT_KEY, title: '创建人' },
]

export function useSortPrefs({ appId, formId, tableFields, schemaLoading }) {
  const userStore = useUserStore()
  const sortRules = ref([])

  const sortOptions = computed(() => [
    ...unref(tableFields).map((field) => ({
      key: field.key,
      title: field.title || '未命名字段',
    })),
    ...SYSTEM_SORT_OPTIONS,
  ])

  function storageKey() {
    const userId = userStore.user?.id
    const currentAppId = unref(appId)
    const currentFormId = unref(formId)
    if (!userId || !currentAppId || !currentFormId) return ''
    return `form-list-sort:${userId}:${currentAppId}:${currentFormId}`
  }

  function normalizeRules(value) {
    if (!Array.isArray(value)) return []
    const validKeys = new Set(sortOptions.value.map((item) => item.key))
    const seen = new Set()
    return value
      .filter((item) => item && validKeys.has(item.key))
      .filter((item) => {
        if (seen.has(item.key)) return false
        seen.add(item.key)
        return true
      })
      .map((item) => ({ key: item.key, order: item.order === 'asc' ? 'asc' : 'desc' }))
  }

  function loadSortRules() {
    const key = storageKey()
    if (!key) return []
    try {
      return normalizeRules(JSON.parse(localStorage.getItem(key) || '[]'))
    } catch {
      return []
    }
  }

  function saveSortRules(rules = sortRules.value) {
    const key = storageKey()
    if (!key || unref(schemaLoading)) return
    localStorage.setItem(key, JSON.stringify(normalizeRules(rules)))
  }

  function syncSortRules() {
    if (unref(schemaLoading)) return
    sortRules.value = loadSortRules()
  }

  watch(
    [() => unref(appId), () => unref(formId), () => userStore.user?.id, tableFields, () => unref(schemaLoading)],
    syncSortRules,
    { immediate: true },
  )

  return { sortRules, sortOptions, saveSortRules }
}
