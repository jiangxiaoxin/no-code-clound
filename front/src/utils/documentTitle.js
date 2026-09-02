import { onUnmounted, watch } from 'vue'

export const DEFAULT_DOCUMENT_TITLE = '简简单单搞个低代码'

export function setDocumentTitle(name) {
  const text = typeof name === 'string' ? name.trim() : ''
  document.title = text || DEFAULT_DOCUMENT_TITLE
}

export function useDocumentTitle(source) {
  watch(source, (name) => setDocumentTitle(name), { immediate: true })
  onUnmounted(() => {
    setDocumentTitle('')
  })
}
