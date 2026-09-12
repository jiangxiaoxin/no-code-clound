import { FORMULA_FUNCTIONS } from '../form-fill/formula/evaluator.js'
import { formulaRefToken } from './formulaField.js'

const FUNCTION_NAMES = new Set(FORMULA_FUNCTIONS.map((fn) => fn.name.toUpperCase()))

// 高亮切分用：标识符、数字，其余按单字符走
const PLAIN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[\s\S]/g

function pushText(out, kind, text) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === 'text' && last.kind === kind) {
    last.text += text
    return
  }
  out.push({ type: 'text', kind, text })
}

function splitPlainText(text, out) {
  PLAIN_RE.lastIndex = 0
  let match = PLAIN_RE.exec(text)
  while (match) {
    const piece = match[0]
    let kind = 'plain'
    if (/^[A-Za-z_]/.test(piece)) {
      kind = FUNCTION_NAMES.has(piece.toUpperCase()) ? 'fn' : 'plain'
    } else if (/^\d/.test(piece)) {
      kind = 'num'
    }
    pushText(out, kind, piece)
    match = PLAIN_RE.exec(text)
  }
}

// 把公式切成一段一段：普通文本（带高亮类型）或一颗字段引用 token。
// token 认路径（存库的 key）也认标题（人手打进去的），认不出的引用按普通文本留着，不吞掉。
export function buildFormulaSegments(expr, labels = {}) {
  const byPath = labels.byPath instanceof Map ? labels.byPath : new Map()
  const byLabel = labels.byLabel instanceof Map ? labels.byLabel : new Map()
  const src = String(expr || '')
  const out = []
  let plain = ''
  const flush = () => {
    if (!plain) return
    splitPlainText(plain, out)
    plain = ''
  }
  let index = 0
  while (index < src.length) {
    const ch = src[index]
    if (ch === '$' && (src[index + 1] === "'" || src[index + 1] === '"')) {
      const quote = src[index + 1]
      const end = src.indexOf(quote, index + 2)
      if (end === -1) {
        plain += src.slice(index)
        break
      }
      const inner = src.slice(index + 2, end)
      const path = byPath.has(inner) ? inner : byLabel.get(inner.trim())
      if (path) {
        flush()
        out.push({
          type: 'token',
          path,
          label: byPath.get(path) || inner,
          // 这段引用在原文里占几个字符（$'…'），重画后长度会变成字段 key，光标换算要用
          sourceLength: end + 1 - index,
        })
      } else {
        plain += src.slice(index, end + 1)
      }
      index = end + 1
      continue
    }
    if (ch === "'" || ch === '"') {
      flush()
      const end = src.indexOf(ch, index + 1)
      const stop = end === -1 ? src.length : end + 1
      pushText(out, 'str', src.slice(index, stop))
      index = stop
      continue
    }
    plain += ch
    index += 1
  }
  flush()
  return out
}

export function segmentExpression(segment) {
  if (segment.type !== 'token') return segment.text
  return formulaRefToken(segment.path) || "$'" + segment.path + "'"
}

export function segmentsToExpression(segments) {
  return (segments || []).map(segmentExpression).join('')
}

// 复制到剪贴板用：字段写成 $'字段标题'，人能读，粘回编辑器也能认回同一颗标签
export function segmentsToDisplayExpression(segments) {
  return (segments || [])
    .map((segment) =>
      segment.type === 'token'
        ? formulaRefToken(segment.label) || segmentExpression(segment)
        : segment.text,
    )
    .join('')
}

// 重画之后 $'字段标题' 会变成 $'字段key'（长度变了），把光标换算到新文本的偏移上
export function remapSourceOffset(offset, segments) {
  let source = 0
  let canonical = 0
  for (const segment of segments || []) {
    const oldLength = segment.type === 'token' ? segment.sourceLength : segment.text.length
    const newLength = segmentExpression(segment).length
    if (offset <= source + oldLength) {
      if (segment.type !== 'token') return canonical + (offset - source)
      return offset <= source ? canonical : canonical + newLength
    }
    source += oldLength
    canonical += newLength
  }
  return canonical
}

// 结构没变就不用重画 DOM，避免打字时光标乱跳
export function segmentsSignature(segments) {
  return (segments || [])
    .map((segment) => (segment.type === 'token' ? 'token' : segment.kind))
    .join('|')
}
