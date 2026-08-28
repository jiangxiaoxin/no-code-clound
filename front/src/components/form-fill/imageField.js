// 实际应用中，默认最多3张很合理了，没必要太大。如果需要大的值，可以自己手动修改
export const DEFAULT_IMAGE_MAX_COUNT = 3 
// 图片10M差不多
export const DEFAULT_IMAGE_MAX_SIZE_MB = 10

export function imageMaxCount(field) {
  const n = Number(field?.maxCount)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_IMAGE_MAX_COUNT
}

export function imageMaxSizeMB(field) {
  const n = Number(field?.maxSizeMB)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IMAGE_MAX_SIZE_MB
}

// 10M = 10 * 1024 * 1024
export function imageMaxSizeBytes(field) {
  return imageMaxSizeMB(field) * 1024 * 1024
}

export const IMAGE_FORMAT_OPTIONS = [
  { value: 'jpeg', label: 'jpg / jpeg' },
  { value: 'png', label: 'png' },
  { value: 'gif', label: 'gif' },
  { value: 'webp', label: 'webp' },
]

export const DEFAULT_IMAGE_FORMATS = ['jpeg', 'png']

const IMAGE_FORMAT_SET = new Set(IMAGE_FORMAT_OPTIONS.map((item) => item.value))

const IMAGE_MIME_TO_FORMAT = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function defaultImageFormats() {
  return [...DEFAULT_IMAGE_FORMATS]
}

export function imageAcceptFormats(field) {
  const list = Array.isArray(field?.acceptFormats)
    ? field.acceptFormats.filter((item) => IMAGE_FORMAT_SET.has(item))
    : []
  return list.length ? list : defaultImageFormats()
}

export function imageAcceptAttr(field) {
  const parts = []
  for (const format of imageAcceptFormats(field)) {
    if (format === 'jpeg') {
      parts.push('image/jpeg', '.jpg', '.jpeg')
    } else {
      parts.push(`image/${format}`, `.${format}`)
    }
  }
  return parts.join(',')
}

export function imageFormatLabels(field) {
  const allowed = new Set(imageAcceptFormats(field))
  return IMAGE_FORMAT_OPTIONS.filter((item) => allowed.has(item.value))
    .map((item) => item.label)
    .join('、')
}

export function isAllowedImageFile(field, file) {
  const format = IMAGE_MIME_TO_FORMAT[file?.type]
  return Boolean(format && imageAcceptFormats(field).includes(format))
}

export function imageUrlsOf(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item)
  }
  if (typeof value === 'string' && value) return [value]
  return []
}
