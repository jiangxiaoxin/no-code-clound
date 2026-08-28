export const ADDRESS_FORMATS = [
  'province',
  'province-city',
  'province-city-district',
  'province-city-district-detail',
]

export const DEFAULT_ADDRESS_FORMAT = 'province-city-district-detail'
export const ADDRESS_DETAIL_MAX_LENGTH = 256

export const ADDRESS_FORMAT_OPTIONS = [
  { value: 'province', label: '省' },
  { value: 'province-city', label: '省-市' },
  { value: 'province-city-district', label: '省-市-区' },
  { value: 'province-city-district-detail', label: '省-市-区-详细地址' },
]

export const cascaderProps = {
  value: 'id',
  label: 'fullname',
  children: 'districts',
}

export function addressFormatOf(field) {
  const format = field?.addressFormat
  return ADDRESS_FORMATS.includes(format) ? format : DEFAULT_ADDRESS_FORMAT
}

export function addressHasDetail(field) {
  return addressFormatOf(field) === 'province-city-district-detail'
}

export function emptyAddress() {
  return { ids: [], labels: [] }
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? ''))
}

export function normalizeAddressValue(value) {
  // value=null，那typeof 是object
  // 希望这里的value 是对象，并且是 {ids: [], labels:[]} 结构
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyAddress()
  }
  const ids = asStringList(value.ids)
  const labels = asStringList(value.labels)
  const length = Math.min(ids.length, labels.length)
  const next = {
    ids: ids.slice(0, length),
    labels: labels.slice(0, length),
  }
  if (typeof value.detail === 'string') {
    const detail = value.detail.trim().slice(0, ADDRESS_DETAIL_MAX_LENGTH)
    if (detail) next.detail = detail
  }
  return next
}

export function isAddressEmpty(value) {
  return normalizeAddressValue(value).ids.length === 0
}

function childrenOf(node) {
  return Array.isArray(node?.districts) ? node.districts : []
}

function findChild(nodes, id) {
  return (nodes || []).find((item) => String(item?.id) === String(id))
}

export function labelsOfPath(tree, ids) {
  const labels = []
  let nodes = tree || []
  for (const id of ids || []) {
    const node = findChild(nodes, id)
    if (!node) break
    labels.push(node.fullname)
    nodes = childrenOf(node)
  }
  return labels
}

function formatDepthCap(format) {
  if (format === 'province') return 1
  if (format === 'province-city') return 2
  return Infinity
}

function walkPath(tree, ids, cap) {
  const nextIds = []
  const nextLabels = []
  let nodes = tree || []
  for (const id of ids) {
    if (nextIds.length >= cap) break
    const node = findChild(nodes, id)
    if (!node) break
    nextIds.push(String(node.id))
    nextLabels.push(node.fullname)
    nodes = childrenOf(node)
    if (!nodes.length) break
  }
  return { ids: nextIds, labels: nextLabels, nodes }
}

export function adaptAddressToFormat(value, format, tree) {
  const resolved = ADDRESS_FORMATS.includes(format) ? format : DEFAULT_ADDRESS_FORMAT
  const cap = formatDepthCap(resolved)
  const raw = normalizeAddressValue(value)
  const hasTree = Array.isArray(tree) && tree.length > 0
  let ids
  let labels
  if (hasTree) {
    const walked = walkPath(tree, raw.ids, cap)
    ids = walked.ids
    labels = walked.labels
  } else {
    const length = cap === Infinity ? raw.ids.length : Math.min(raw.ids.length, cap)
    ids = raw.ids.slice(0, length)
    labels = raw.labels.slice(0, length)
  }
  const next = { ids, labels }
  if (resolved === 'province-city-district-detail' && raw.detail) {
    next.detail = raw.detail
  }
  return next
}

function lastNodeIsLeaf(tree, ids) {
  if (!ids.length) return false
  let nodes = tree || []
  let node = null
  for (const id of ids) {
    node = findChild(nodes, id)
    if (!node) return false
    nodes = childrenOf(node)
  }
  return node ? childrenOf(node).length === 0 : false
}

export function isAddressComplete(value, format, tree) {
  const resolved = ADDRESS_FORMATS.includes(format) ? format : DEFAULT_ADDRESS_FORMAT
  const raw = normalizeAddressValue(value)
  if (!raw.ids.length) return false
  if (Array.isArray(tree) && tree.length) {
    const walked = walkPath(tree, raw.ids, Infinity)
    if (walked.ids.length !== raw.ids.length) return false
    if (!lastNodeIsLeaf(tree, walked.ids)) return false
  }
  if (resolved === 'province-city-district-detail' && !raw.detail) {
    return false
  }
  return true
}

export function isAddressValueReady(field, value) {
  const format = addressFormatOf(field)
  const raw = normalizeAddressValue(value)
  if (format === 'province' || format === 'province-city') {
    if (raw.ids.length < 1) return false
  } else if (raw.ids.length < 2) {
    return false
  }
  if (addressHasDetail(field) && !raw.detail) return false
  return true
}

export function addressDisplay(value) {
  const raw = normalizeAddressValue(value)
  if (!raw.ids.length) return ''
  const path = raw.labels.join(' / ')
  return raw.detail ? `${path} ${raw.detail}` : path
}

export function regionJsonForFormat(format) {
  const resolved = ADDRESS_FORMATS.includes(format) ? format : DEFAULT_ADDRESS_FORMAT
  if (resolved === 'province') return 'sheng.json'
  if (resolved === 'province-city') return 'sheng-shi.json'
  return 'sheng-shi-qu.json'
}
