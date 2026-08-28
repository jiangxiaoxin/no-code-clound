export const DEFAULT_FILE_MAX_COUNT = 3
export const DEFAULT_FILE_MAX_SIZE_MB = 10
export const DEFAULT_FILE_FORMATS = ['word', 'excel', 'pdf']

export const FILE_FORMAT_OPTIONS = [
  { value: 'pdf', label: 'pdf' },
  { value: 'word', label: 'word' },
  { value: 'excel', label: 'excel' },
  { value: 'ppt', label: 'ppt' },
  { value: 'txt', label: 'txt' },
  { value: 'zip', label: 'zip' },
]

const FILE_FORMAT_SET = new Set(FILE_FORMAT_OPTIONS.map((item) => item.value))

const FILE_FORMAT_META = {
  pdf: {
    exts: ['.pdf'],
    mimes: ['application/pdf'],
  },
  word: {
    exts: ['.doc', '.docx'],
    mimes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  excel: {
    exts: ['.xls', '.xlsx'],
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  ppt: {
    exts: ['.ppt', '.pptx'],
    mimes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  txt: {
    exts: ['.txt'],
    mimes: ['text/plain'],
  },
  zip: {
    exts: ['.zip'],
    mimes: ['application/zip', 'application/x-zip-compressed'],
  },
}

export function defaultFileFormats() {
  return [...DEFAULT_FILE_FORMATS]
}

export function fileMaxCount(field) {
  const n = Number(field?.maxCount)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_FILE_MAX_COUNT
}

export function fileMaxSizeMB(field) {
  const n = Number(field?.maxSizeMB)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FILE_MAX_SIZE_MB
}

export function fileMaxSizeBytes(field) {
  return fileMaxSizeMB(field) * 1024 * 1024
}

export function fileAcceptFormats(field) {
  const list = Array.isArray(field?.acceptFormats)
    ? field.acceptFormats.filter((item) => FILE_FORMAT_SET.has(item))
    : []
  return list.length ? list : defaultFileFormats()
}

export function fileAcceptAttr(field) {
  const parts = []
  for (const format of fileAcceptFormats(field)) {
    const meta = FILE_FORMAT_META[format]
    if (!meta) continue
    parts.push(...meta.exts, ...meta.mimes)
  }
  return parts.join(',')
}

export function fileFormatLabels(field) {
  const allowed = new Set(fileAcceptFormats(field))
  return FILE_FORMAT_OPTIONS.filter((item) => allowed.has(item.value))
    .map((item) => item.label)
    .join('、')
}

export function fileDownloadable(field) {
  return field?.downloadable !== false
}

function fileExt(name) {
  const base = String(name || '').split(/[\\/]/).pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return ''
  return base.slice(dot).toLowerCase()
}

function basename(path) {
  const cleaned = String(path || '').split(/[?#]/)[0]
  return cleaned.split(/[\\/]/).filter(Boolean).pop() || ''
}

function formatOfExt(ext) {
  for (const [format, meta] of Object.entries(FILE_FORMAT_META)) {
    if (meta.exts.includes(ext)) return format
  }
  return ''
}

export function isAllowedFile(field, file) {
  const ext = fileExt(file?.name)
  if (!ext) return false
  const format = formatOfExt(ext)
  if (!format || !fileAcceptFormats(field).includes(format)) return false
  const mime = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : ''
  if (!mime || mime === 'application/octet-stream') return true
  return FILE_FORMAT_META[format].mimes.includes(mime)
}

function itemFromUrl(url, name) {
  const nextUrl = typeof url === 'string' ? url.trim() : ''
  if (!nextUrl) return null
  const nextName =
    typeof name === 'string' && name.trim() ? name.trim() : basename(nextUrl)
  return { url: nextUrl, name: nextName || basename(nextUrl) }
}

export function fileItemsOf(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return itemFromUrl(item)
        if (item && typeof item === 'object') return itemFromUrl(item.url, item.name)
        return null
      })
      .filter(Boolean)
  }
  if (typeof value === 'string' && value) {
    const item = itemFromUrl(value)
    return item ? [item] : []
  }
  return []
}

export async function downloadFile(item) {
  const url = typeof item === 'string' ? item : item?.url
  if (!url) throw new Error('下载失败')
  const response = await fetch(url)
  if (!response.ok) throw new Error('下载失败')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download =
    (typeof item === 'object' && item?.name) || basename(url) || 'file'
  link.click()
  URL.revokeObjectURL(objectUrl)
}
