export const RECORD_ACTION_KEYS = [
  'create',
  'delete',
  'import',
  'export',
  'downloadTemplate',
]

export function normalizeRecordActions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const next = {}
  for (const key of RECORD_ACTION_KEYS) {
    next[key] = src[key] !== false
  }
  return next
}

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024
