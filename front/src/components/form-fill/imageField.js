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

export function imageDownloadName(url) {
  const path = String(url || '').split(/[?#]/)[0]
  const name = path.split('/').filter(Boolean).pop()
  return name || 'image'
}

export async function downloadImage(url) {
  if (!url) throw new Error('下载失败')
  const response = await fetch(url)
  if (!response.ok) throw new Error('下载失败')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = imageDownloadName(url)
  link.click()
  URL.revokeObjectURL(objectUrl)
}

export function imageCompressEnabled(field) {
  return field?.compress === true
}

const IMAGE_COMPRESS_MAX_EDGE = 1920
const IMAGE_COMPRESS_QUALITY = 0.8

function compressOutputType(type) {
  if (type === 'image/png' || type === 'image/webp' || type === 'image/jpeg') {
    return type
  }
  return 'image/jpeg'
}

function replaceImageExt(name, mime) {
  const ext =
    mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg'
  const base = String(name || 'image').replace(/\.[^.]+$/, '')
  return `${base}${ext}`
}

function fitMaxEdge(width, height, maxEdge) {
  const edge = Math.max(width, height)
  if (!(width > 0) || !(height > 0) || edge <= maxEdge) {
    return { width, height }
  }
  const ratio = maxEdge / edge
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('compress failed'))
      else resolve(blob)
    }, type, quality)
  })
}

export async function compressImageFile(file) {
  if (!file || file.type === 'image/gif') return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
    const size = fitMaxEdge(
      bitmap.width,
      bitmap.height,
      IMAGE_COMPRESS_MAX_EDGE,
    )
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const type = compressOutputType(file.type)
    const blob = await canvasToBlob(canvas, type, IMAGE_COMPRESS_QUALITY)
    if (blob.size >= file.size) return file
    return new File([blob], replaceImageExt(file.name, type), {
      type,
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    console.log('finally 清理');
    bitmap?.close?.()
  }
}
