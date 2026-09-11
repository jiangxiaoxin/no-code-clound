import { dayjs } from '../../utils/timeValue.js'

export const PROCESS_TIMEOUT_UNITS = ['minute', 'hour', 'day']
export const PROCESS_TIMEOUT_MODES = ['absolute', 'duration']
export const ABSOLUTE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

export function emptyProcessTimeout() {
  return {
    enabled: false,
    mode: 'duration',
    absoluteAt: '',
    duration: 1,
    durationUnit: 'hour',
  }
}

export function normalizeProcessTimeout(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const mode = PROCESS_TIMEOUT_MODES.includes(input.mode)
    ? input.mode
    : 'duration'
  const duration = Number(input.duration)
  const durationUnit = PROCESS_TIMEOUT_UNITS.includes(input.durationUnit)
    ? input.durationUnit
    : 'hour'
  return {
    enabled: Boolean(input.enabled),
    mode,
    absoluteAt: typeof input.absoluteAt === 'string' ? input.absoluteAt : '',
    duration: Number.isInteger(duration) && duration > 0 ? duration : 1,
    durationUnit,
  }
}

export function processTimeoutErrors(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  if (!input.enabled) return []
  const mode = PROCESS_TIMEOUT_MODES.includes(input.mode)
    ? input.mode
    : 'duration'
  if (mode === 'absolute') {
    const parsed = dayjs(input.absoluteAt, ABSOLUTE_FORMAT, true)
    if (!parsed.isValid()) {
      return ['开始节点已开启流程超时，请填写截止时间（年月日时分秒）']
    }
    return []
  }
  const duration = Number(input.duration)
  if (!Number.isInteger(duration) || duration < 1) {
    return ['开始节点已开启流程超时，请填写有效时长']
  }
  if (!PROCESS_TIMEOUT_UNITS.includes(input.durationUnit)) {
    return ['开始节点已开启流程超时，请选择时长单位']
  }
  return []
}

export function parseAbsoluteAt(value) {
  if (typeof value !== 'string' || !value) return null
  const parsed = dayjs(value, ABSOLUTE_FORMAT, true)
  return parsed.isValid() ? parsed.toDate() : null
}
