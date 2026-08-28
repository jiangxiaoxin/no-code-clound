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

export function imageUrlsOf(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item)
  }
  if (typeof value === 'string' && value) return [value]
  return []
}
