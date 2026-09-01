export const RECORD_ACTION_KEYS = [
  'create',
  'edit',
  'delete',
  'import',
  'export',
  'downloadTemplate',
]

const RECORD_ACTION_DEFAULTS = {
  create: true,
  edit: true,
  delete: true,
  import: false,
  export: false,
  downloadTemplate: false,
}

export function normalizeRecordActions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const next = {}
  for (const key of RECORD_ACTION_KEYS) {
    next[key] = typeof src[key] === 'boolean' ? src[key] : RECORD_ACTION_DEFAULTS[key]
  }
  return next
}

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024
