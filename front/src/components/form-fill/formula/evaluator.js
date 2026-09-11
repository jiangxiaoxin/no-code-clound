// 与 server/src/application/form-record/formula/ 的实现保持语义一致：
// 两端读同一份 formula.fixtures.json，求值结果不一致会导致提交覆盖时值跳变。
// 日期解析必须用本地时区分量构造，不能用 Date.parse（YYYY-MM-DD 会按 UTC 解析）。

export const FORMULA_MAX_LENGTH = 2000

export const FORMULA_FIELD_TYPES = ['input', 'textarea', 'number', 'date', 'time', 'datetime']

export const AGGREGATE_FUNCTION_NAMES = ['SUM', 'AVERAGE', 'MAX', 'MIN']

const COMPARE_OPS = ['==', '!=', '>=', '<=', '>', '<']
const CMP_IN_ADD = ['+', '-']
const CMP_IN_MUL = ['*', '/', '%']
const DAY_MS = 86400000

export const FORMULA_FUNCTIONS = [
  { name: 'IF', category: 'logic', minArgs: 3, maxArgs: 3, params: ['boolean', 'any', 'any'], summary: 'IF(条件, 结果1, 结果2)：条件为真返回结果1，否则返回结果2' },
  { name: 'AND', category: 'logic', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'boolean', summary: 'AND(条件, ...)：所有条件为真才返回真' },
  { name: 'OR', category: 'logic', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'boolean', summary: 'OR(条件, ...)：任一条件为真就返回真' },
  { name: 'NOT', category: 'logic', minArgs: 1, maxArgs: 1, params: ['boolean'], summary: 'NOT(条件)：条件为假返回真' },
  { name: 'CONCATENATE', category: 'text', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'any', summary: 'CONCATENATE(文本, ...)：把多段文本连成一段' },
  { name: 'LEFT', category: 'text', minArgs: 2, maxArgs: 2, params: ['string', 'number'], summary: 'LEFT(文本, 数量)：从左边截取指定数量的字符' },
  { name: 'RIGHT', category: 'text', minArgs: 2, maxArgs: 2, params: ['string', 'number'], summary: 'RIGHT(文本, 数量)：从右边截取指定数量的字符' },
  { name: 'MID', category: 'text', minArgs: 3, maxArgs: 3, params: ['string', 'number', 'number'], summary: 'MID(文本, 第几位, 数量)：从指定位次开始截取' },
  { name: 'LEN', category: 'text', minArgs: 1, maxArgs: 1, params: ['string'], summary: 'LEN(文本)：返回字符个数' },
  { name: 'TEXT', category: 'text', minArgs: 2, maxArgs: 2, params: ['any', 'string'], summary: 'TEXT(值, 格式)：数字按 0.00 类格式，日期按 YYYY-MM-DD 类格式转成文本' },
  { name: 'VALUE', category: 'text', minArgs: 1, maxArgs: 1, params: ['string'], summary: 'VALUE(文本)：把数字文本转成数字，转不了得空' },
  { name: 'ISEMPTY', category: 'text', minArgs: 1, maxArgs: 1, params: ['any'], summary: 'ISEMPTY(值)：值为空、空文本或空数组时返回真' },
  { name: 'SUM', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'SUM(数字, ...)：对子表数字列或一组数字求和，空值跳过' },
  { name: 'AVERAGE', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'AVERAGE(数字, ...)：求平均值，空值跳过，全空得空' },
  { name: 'MAX', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'MAX(数字, ...)：取最大值' },
  { name: 'MIN', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'MIN(数字, ...)：取最小值' },
  { name: 'ROUND', category: 'math', minArgs: 2, maxArgs: 2, params: ['number', 'number'], summary: 'ROUND(数字, 位数)：按位数四舍五入' },
  { name: 'ABS', category: 'math', minArgs: 1, maxArgs: 1, params: ['number'], summary: 'ABS(数字)：返回绝对值' },
  { name: 'TODAY', category: 'date', minArgs: 0, maxArgs: 0, params: [], summary: 'TODAY()：返回今天零点的时间戳' },
  { name: 'NOW', category: 'date', minArgs: 0, maxArgs: 0, params: [], summary: 'NOW()：返回当前时间戳' },
  { name: 'DATEDIF', category: 'date', minArgs: 3, maxArgs: 3, params: ['date', 'date', 'string'], summary: 'DATEDIF(开始, 结束, 单位)：单位 Y/M/D，不足整年整月舍去' },
  { name: 'DATEDELTA', category: 'date', minArgs: 2, maxArgs: 2, params: ['date', 'number'], summary: 'DATEDELTA(日期, 天数)：按天加减日期，返回时间戳' },
]

const FUNCTION_MAP = new Map(FORMULA_FUNCTIONS.map((def) => [def.name, def]))

export function findFunctionDef(name) {
  return FUNCTION_MAP.get(name)
}

function err(code, message, line, column) {
  return { code, message, line, column }
}

class Tokenizer {
  constructor(src) {
    this.src = src
    this.i = 0
    this.line = 1
    this.column = 1
  }

  peek() {
    return this.src[this.i] ?? ''
  }

  advance() {
    const ch = this.src[this.i] ?? ''
    this.i += 1
    if (ch === '\n') {
      this.line += 1
      this.column = 1
    } else {
      this.column += 1
    }
    return ch
  }

  run() {
    const tokens = []
    for (;;) {
      const ch = this.peek()
      if (ch === '') {
        tokens.push({ type: 'eof', line: this.line, column: this.column })
        return { ok: true, tokens }
      }
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance()
        continue
      }
      const line = this.line
      const column = this.column
      if (ch >= '0' && ch <= '9') {
        let text = ''
        while (this.peek() >= '0' && this.peek() <= '9') {
          text += this.advance()
        }
        if (this.peek() === '.') {
          const next = this.src[this.i + 1] ?? ''
          if (next >= '0' && next <= '9') {
            text += this.advance()
            while (this.peek() >= '0' && this.peek() <= '9') {
              text += this.advance()
            }
          }
        }
        tokens.push({ type: 'num', value: Number(text), line, column })
        continue
      }
      if (ch === "'" || ch === '"') {
        const quote = this.advance()
        let text = ''
        while (this.peek() !== '' && this.peek() !== quote) {
          text += this.advance()
        }
        if (this.peek() === '') {
          return { ok: false, error: err('syntax', '字符串未闭合', line, column) }
        }
        this.advance()
        tokens.push({ type: 'str', value: text, line, column })
        continue
      }
      if (ch === '$') {
        const next = this.src[this.i + 1] ?? ''
        if (next !== "'" && next !== '"') {
          return {
            ok: false,
            error: err('syntax', "字段引用需写作 $'字段key'", line, column),
          }
        }
        this.advance()
        const quote = this.advance()
        let key = ''
        while (this.peek() !== '' && this.peek() !== quote) {
          key += this.advance()
        }
        if (this.peek() === '') {
          return { ok: false, error: err('syntax', '字段引用未闭合', line, column) }
        }
        this.advance()
        const path = key.split('.').map((part) => part.trim())
        if (path.some((part) => part === '')) {
          return { ok: false, error: err('syntax', '字段引用不能为空', line, column) }
        }
        tokens.push({ type: 'ref', path, line, column })
        continue
      }
      if (/[A-Za-z_]/.test(ch)) {
        let text = ''
        while (this.peek() !== '' && /[A-Za-z0-9_]/.test(this.peek())) {
          text += this.advance()
        }
        tokens.push({ type: 'ident', value: text, line, column })
        continue
      }
      const two = ch + (this.src[this.i + 1] ?? '')
      if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
        this.advance()
        this.advance()
        tokens.push({ type: 'op', value: two, line, column })
        continue
      }
      if ('+-*/%><'.includes(ch)) {
        this.advance()
        tokens.push({ type: 'op', value: ch, line, column })
        continue
      }
      if (ch === '(') {
        this.advance()
        tokens.push({ type: 'lparen', line, column })
        continue
      }
      if (ch === ')') {
        this.advance()
        tokens.push({ type: 'rparen', line, column })
        continue
      }
      if (ch === ',') {
        this.advance()
        tokens.push({ type: 'comma', line, column })
        continue
      }
      return {
        ok: false,
        error: err('syntax', `公式里不能使用字符「${ch}」`, line, column),
      }
    }
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  peek() {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]
  }

  parse() {
    const expr = this.parseExpr()
    if (!expr.ok) return expr
    const eof = this.peek()
    if (eof.type !== 'eof') {
      return {
        ok: false,
        error: err('syntax', '公式末尾有多余内容', eof.line, eof.column),
      }
    }
    return expr
  }

  parseExpr() {
    return this.parseCmp()
  }

  parseCmp() {
    const left = this.parseAdd()
    if (!left.ok) return left
    const token = this.peek()
    if (token.type === 'op' && COMPARE_OPS.includes(token.value)) {
      this.pos += 1
      const right = this.parseAdd()
      if (!right.ok) return right
      return {
        ok: true,
        ast: {
          kind: 'binary',
          op: token.value,
          left: left.ast,
          right: right.ast,
          line: token.line,
          column: token.column,
        },
      }
    }
    return left
  }

  parseAdd() {
    let left = this.parseMul()
    if (!left.ok) return left
    for (;;) {
      const token = this.peek()
      if (token.type === 'op' && CMP_IN_ADD.includes(token.value)) {
        this.pos += 1
        const right = this.parseMul()
        if (!right.ok) return right
        left = {
          ok: true,
          ast: {
            kind: 'binary',
            op: token.value,
            left: left.ast,
            right: right.ast,
            line: token.line,
            column: token.column,
          },
        }
        continue
      }
      return left
    }
  }

  parseMul() {
    let left = this.parseUnary()
    if (!left.ok) return left
    for (;;) {
      const token = this.peek()
      if (token.type === 'op' && CMP_IN_MUL.includes(token.value)) {
        this.pos += 1
        const right = this.parseUnary()
        if (!right.ok) return right
        left = {
          ok: true,
          ast: {
            kind: 'binary',
            op: token.value,
            left: left.ast,
            right: right.ast,
            line: token.line,
            column: token.column,
          },
        }
        continue
      }
      return left
    }
  }

  parseUnary() {
    const token = this.peek()
    if (token.type === 'op' && token.value === '-') {
      this.pos += 1
      const operand = this.parseUnary()
      if (!operand.ok) return operand
      return {
        ok: true,
        ast: {
          kind: 'unary',
          op: '-',
          operand: operand.ast,
          line: token.line,
          column: token.column,
        },
      }
    }
    return this.parsePrim()
  }

  parsePrim() {
    const token = this.peek()
    switch (token.type) {
      case 'num':
        this.pos += 1
        return { ok: true, ast: { kind: 'num', value: token.value, line: token.line, column: token.column } }
      case 'str':
        this.pos += 1
        return { ok: true, ast: { kind: 'str', value: token.value, line: token.line, column: token.column } }
      case 'ref':
        this.pos += 1
        return { ok: true, ast: { kind: 'ref', path: token.path, line: token.line, column: token.column } }
      case 'ident': {
        this.pos += 1
        const next = this.peek()
        if (next.type === 'lparen') {
          return this.parseCall(token)
        }
        const upper = token.value.toUpperCase()
        if (upper === 'TRUE' || upper === 'FALSE') {
          return {
            ok: true,
            ast: { kind: 'bool', value: upper === 'TRUE', line: token.line, column: token.column },
          }
        }
        return {
          ok: false,
          error: err('unknown-function', `公式不支持函数 ${token.value}`, token.line, token.column),
        }
      }
      case 'lparen': {
        this.pos += 1
        const inner = this.parseExpr()
        if (!inner.ok) return inner
        const close = this.peek()
        if (close.type !== 'rparen') {
          return { ok: false, error: err('syntax', '括号不匹配', close.line, close.column) }
        }
        this.pos += 1
        return inner
      }
      default:
        return {
          ok: false,
          error: err('syntax', '公式不完整或有无法识别的内容', token.line, token.column),
        }
    }
  }

  parseCall(nameToken) {
    const name = nameToken.value.toUpperCase()
    const def = findFunctionDef(name)
    if (!def) {
      return {
        ok: false,
        error: err('unknown-function', `公式不支持函数 ${name}`, nameToken.line, nameToken.column),
      }
    }
    this.pos += 1
    const args = []
    if (this.peek().type === 'rparen') {
      this.pos += 1
    } else {
      for (;;) {
        const arg = this.parseExpr()
        if (!arg.ok) return arg
        args.push(arg.ast)
        const token = this.peek()
        if (token.type === 'comma') {
          this.pos += 1
          continue
        }
        if (token.type === 'rparen') {
          this.pos += 1
          break
        }
        return {
          ok: false,
          error: err('syntax', '函数参数应为英文逗号或右括号', token.line, token.column),
        }
      }
    }
    if (args.length < def.minArgs || args.length > def.maxArgs) {
      return {
        ok: false,
        error: err('arity', `函数 ${name} 参数个数不正确`, nameToken.line, nameToken.column),
      }
    }
    return {
      ok: true,
      ast: { kind: 'call', name, args, line: nameToken.line, column: nameToken.column },
    }
  }
}

function collectRefs(node, out) {
  switch (node.kind) {
    case 'ref': {
      const id = node.path.join('.')
      if (!out.includes(id)) out.push(id)
      return
    }
    case 'call':
      for (const arg of node.args) collectRefs(arg, out)
      return
    case 'binary':
      collectRefs(node.left, out)
      collectRefs(node.right, out)
      return
    case 'unary':
      collectRefs(node.operand, out)
      return
    default:
      return
  }
}

export function parseFormula(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') {
    return { ok: false, error: err('syntax', '公式不能为空', 1, 1) }
  }
  if (expr.length > FORMULA_MAX_LENGTH) {
    return {
      ok: false,
      error: err('limit', `公式最长 ${FORMULA_MAX_LENGTH} 字符`, 1, 1),
    }
  }
  const tokenized = new Tokenizer(expr).run()
  if (!tokenized.ok) return tokenized
  const parsed = new Parser(tokenized.tokens).parse()
  if (!parsed.ok) return parsed
  const refs = []
  collectRefs(parsed.ast, refs)
  return { ok: true, ast: parsed.ast, refs }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function localMs(year, month, day, hour, minute, second) {
  const d = new Date(year, month - 1, day, hour, minute, second, 0)
  if (Number.isNaN(d.getTime())) return null
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute ||
    d.getSeconds() !== second
  ) {
    return null
  }
  return d.getTime()
}

export function parseDateLikeToMs(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime()
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (s === '') return null
  let m = /^(\d{4})$/.exec(s)
  if (m) return localMs(Number(m[1]), 1, 1, 0, 0, 0)
  m = /^(\d{4})-(\d{2})$/.exec(s)
  if (m) return localMs(Number(m[1]), Number(m[2]), 1, 0, 0, 0)
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return localMs(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0)
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (m) {
    return localMs(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] ?? 0),
    )
  }
  m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (m) {
    return localMs(1970, 1, 1, Number(m[1]), Number(m[2]), Number(m[3] ?? 0))
  }
  const parsed = new Date(s).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export function formatMs(ms, fmt) {
  const d = new Date(ms)
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => {
    switch (token) {
      case 'YYYY':
        return String(d.getFullYear())
      case 'MM':
        return pad2(d.getMonth() + 1)
      case 'DD':
        return pad2(d.getDate())
      case 'HH':
        return pad2(d.getHours())
      case 'mm':
        return pad2(d.getMinutes())
      case 'ss':
        return pad2(d.getSeconds())
      default:
        return token
    }
  })
}

export function startOfDayMs(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const s = value.trim()
    if (s === '') return undefined
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
    const ms = parseDateLikeToMs(s)
    return ms === null ? undefined : ms
  }
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

export function truthy(value) {
  if (value === undefined || value === null || value === false) return false
  if (value === '' || value === 0) return false
  if (typeof value === 'number' && Number.isNaN(value)) return false
  return true
}

export function strOf(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

function textArg(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

function countArg(value) {
  const n = toNumber(value)
  if (n === undefined) return undefined
  return Math.max(0, Math.floor(n))
}

function eqValues(a, b) {
  const aEmpty = a === undefined || a === null
  const bEmpty = b === undefined || b === null
  if (aEmpty && bEmpty) return true
  if (aEmpty || bEmpty) return false
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = toNumber(a)
    const y = toNumber(b)
    return x !== undefined && y !== undefined ? x === y : false
  }
  return String(a) === String(b)
}

function collectNumbers(args) {
  const out = []
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        const n = toNumber(item)
        if (n !== undefined) out.push(n)
      }
    } else {
      const n = toNumber(arg)
      if (n !== undefined) out.push(n)
    }
  }
  return out
}

function calendarDiff(startMs, endMs, unit) {
  if (endMs < startMs) return undefined
  const a = new Date(startMs)
  const b = new Date(endMs)
  if (unit === 'D') {
    return Math.floor((startOfDayMs(endMs) - startOfDayMs(startMs)) / DAY_MS)
  }
  if (unit === 'Y') {
    let years = b.getFullYear() - a.getFullYear()
    if (
      b.getMonth() < a.getMonth() ||
      (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())
    ) {
      years -= 1
    }
    return years
  }
  if (unit === 'M') {
    let months =
      (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    if (b.getDate() < a.getDate()) months -= 1
    return months
  }
  return undefined
}

export function invokeFunction(name, args, ctx) {
  switch (name) {
    case 'AND':
      return args.every((arg) => truthy(arg))
    case 'OR':
      return args.some((arg) => truthy(arg))
    case 'NOT':
      return !truthy(args[0])
    case 'CONCATENATE': {
      let out = ''
      for (const arg of args) {
        const s = strOf(arg)
        if (s === undefined) return undefined
        out += s
      }
      return out
    }
    case 'LEFT': {
      const s = textArg(args[0])
      if (s === undefined) return undefined
      const n = countArg(args[1])
      if (n === undefined) return undefined
      return s.slice(0, n)
    }
    case 'RIGHT': {
      const s = textArg(args[0])
      if (s === undefined) return undefined
      const n = countArg(args[1])
      if (n === undefined) return undefined
      return n === 0 ? '' : s.slice(-n)
    }
    case 'MID': {
      const s = textArg(args[0])
      if (s === undefined) return undefined
      const start = toNumber(args[1])
      const count = toNumber(args[2])
      if (start === undefined || count === undefined) return undefined
      const from = Math.floor(start)
      const len = Math.floor(count)
      if (from < 1 || len <= 0) return ''
      return s.slice(from - 1, from - 1 + len)
    }
    case 'LEN': {
      const s = textArg(args[0])
      return s === undefined ? undefined : s.length
    }
    case 'TEXT': {
      const fmt = args[1]
      if (typeof fmt !== 'string') return undefined
      if (/(YYYY|MM|DD|HH|mm|ss)/.test(fmt)) {
        const ms = parseDateLikeToMs(args[0])
        return ms === null ? undefined : formatMs(ms, fmt)
      }
      const n = toNumber(args[0])
      if (n === undefined) return undefined
      const decimals = /\.(\d+)/.exec(fmt)
      if (fmt === '0') return n.toFixed(0)
      if (decimals) return n.toFixed(Math.min(100, decimals[1].length))
      return String(n)
    }
    case 'VALUE':
      return toNumber(args[0])
    case 'ISEMPTY': {
      const v = args[0]
      return (
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0)
      )
    }
    case 'SUM': {
      const list = collectNumbers(args)
      if (!list.length) return undefined
      return list.reduce((sum, n) => sum + n, 0)
    }
    case 'AVERAGE': {
      const list = collectNumbers(args)
      if (!list.length) return undefined
      return list.reduce((sum, n) => sum + n, 0) / list.length
    }
    case 'MAX': {
      const list = collectNumbers(args)
      if (!list.length) return undefined
      return Math.max(...list)
    }
    case 'MIN': {
      const list = collectNumbers(args)
      if (!list.length) return undefined
      return Math.min(...list)
    }
    case 'ROUND': {
      const n = toNumber(args[0])
      const d = toNumber(args[1])
      if (n === undefined || d === undefined) return undefined
      const digits = Math.min(100, Math.max(0, Math.floor(d)))
      const factor = 10 ** digits
      return Math.round(n * factor) / factor
    }
    case 'ABS': {
      const n = toNumber(args[0])
      return n === undefined ? undefined : Math.abs(n)
    }
    case 'TODAY':
      return startOfDayMs(ctx.now.getTime())
    case 'NOW':
      return ctx.now.getTime()
    case 'DATEDIF': {
      const start = parseDateLikeToMs(args[0])
      const end = parseDateLikeToMs(args[1])
      if (start === null || end === null) return undefined
      const unit = typeof args[2] === 'string' ? args[2].trim().toUpperCase() : ''
      return calendarDiff(start, end, unit)
    }
    case 'DATEDELTA': {
      const ms = parseDateLikeToMs(args[0])
      const delta = toNumber(args[1])
      if (ms === null || delta === undefined) return undefined
      return ms + delta * DAY_MS
    }
    default:
      return undefined
  }
}

function evalNode(node, ctx) {
  switch (node.kind) {
    case 'num':
    case 'str':
    case 'bool':
      return node.value
    case 'ref':
      return ctx.resolve(node.path)
    case 'unary': {
      const n = toNumber(evalNode(node.operand, ctx))
      return n === undefined ? undefined : -n
    }
    case 'binary':
      return evalBinary(node, ctx)
    case 'call': {
      if (node.name === 'IF') {
        const cond = evalNode(node.args[0], ctx)
        return truthy(cond)
          ? evalNode(node.args[1], ctx)
          : evalNode(node.args[2], ctx)
      }
      const args = node.args.map((arg) => evalNode(arg, ctx))
      return invokeFunction(node.name, args, { now: ctx.now })
    }
    default:
      return undefined
  }
}

function evalBinary(node, ctx) {
  const a = evalNode(node.left, ctx)
  const b = evalNode(node.right, ctx)
  switch (node.op) {
    case '==':
      return eqValues(a, b)
    case '!=':
      return !eqValues(a, b)
    case '>':
    case '<':
    case '>=':
    case '<=': {
      const x = toNumber(a)
      const y = toNumber(b)
      if (x !== undefined && y !== undefined) {
        switch (node.op) {
          case '>':
            return x > y
          case '<':
            return x < y
          case '>=':
            return x >= y
          default:
            return x <= y
        }
      }
      if (typeof a === 'string' && typeof b === 'string') {
        switch (node.op) {
          case '>':
            return a > b
          case '<':
            return a < b
          case '>=':
            return a >= b
          default:
            return a <= b
        }
      }
      return undefined
    }
  }
  if (node.op === '+') {
    if (typeof a === 'string' || typeof b === 'string') {
      const sa = strOf(a)
      const sb = strOf(b)
      return sa === undefined || sb === undefined ? undefined : sa + sb
    }
  }
  const x = toNumber(a)
  const y = toNumber(b)
  if (x === undefined || y === undefined) return undefined
  switch (node.op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return x * y
    case '/':
      return y === 0 ? undefined : x / y
    case '%':
      return y === 0 ? undefined : x % y
    default:
      return undefined
  }
}

export function evaluateAst(ast, ctx) {
  try {
    return { ok: true, value: evalNode(ast, ctx) }
  } catch {
    return {
      ok: false,
      error: { code: 'type', message: '公式计算失败', line: 0, column: 0 },
    }
  }
}

const RETURN_TYPES = {
  AND: 'boolean',
  OR: 'boolean',
  NOT: 'boolean',
  CONCATENATE: 'string',
  LEFT: 'string',
  RIGHT: 'string',
  MID: 'string',
  TEXT: 'string',
  LEN: 'number',
  VALUE: 'number',
  ROUND: 'number',
  ABS: 'number',
  SUM: 'number',
  AVERAGE: 'number',
  MAX: 'number',
  MIN: 'number',
  DATEDIF: 'number',
  TODAY: 'date',
  NOW: 'date',
  DATEDELTA: 'date',
}

function paramMatches(formal, actual) {
  switch (formal) {
    case 'any':
      return true
    case 'number':
      return actual === 'number' || actual === 'date'
    case 'string':
      return actual === 'string' || actual === 'number' || actual === 'date'
    case 'boolean':
      return actual === 'boolean'
    case 'date':
      return actual === 'date' || actual === 'number' || actual === 'string'
    default:
      return false
  }
}

function inferNode(node, typeOf) {
  switch (node.kind) {
    case 'num':
      return { ok: true, type: 'number' }
    case 'str':
      return { ok: true, type: 'string' }
    case 'bool':
      return { ok: true, type: 'boolean' }
    case 'ref':
      return { ok: true, type: typeOf(node.path) }
    case 'unary': {
      const inner = inferNode(node.operand, typeOf)
      return inner.ok ? { ok: true, type: 'number' } : inner
    }
    case 'binary': {
      const left = inferNode(node.left, typeOf)
      if (!left.ok) return left
      const right = inferNode(node.right, typeOf)
      if (!right.ok) return right
      if (COMPARE_OPS.includes(node.op)) {
        return { ok: true, type: 'boolean' }
      }
      if (node.op === '+') {
        if (left.type === 'string' || right.type === 'string') {
          return { ok: true, type: 'string' }
        }
        if (left.type === 'unknown' || right.type === 'unknown') {
          return { ok: true, type: 'unknown' }
        }
      }
      return { ok: true, type: 'number' }
    }
    case 'call': {
      const def = findFunctionDef(node.name)
      if (!def) {
        return {
          ok: false,
          error: {
            code: 'unknown-function',
            message: `公式不支持函数 ${node.name}`,
            line: node.line,
            column: node.column,
          },
        }
      }
      const argTypes = []
      for (let i = 0; i < node.args.length; i++) {
        const arg = inferNode(node.args[i], typeOf)
        if (!arg.ok) return arg
        argTypes.push(arg.type)
        if (arg.type === 'unknown') continue
        const formal = i < def.params.length ? def.params[i] : def.variadic
        if (!formal || !paramMatches(formal, arg.type)) {
          return {
            ok: false,
            error: {
              code: 'type',
              message: `函数 ${node.name} 参数类型不正确`,
              line: node.line,
              column: node.column,
            },
          }
        }
      }
      if (node.name === 'IF') {
        const t1 = argTypes[1]
        const t2 = argTypes[2]
        return { ok: true, type: t1 === t2 ? t1 : 'unknown' }
      }
      return { ok: true, type: RETURN_TYPES[node.name] ?? 'unknown' }
    }
    default:
      return { ok: true, type: 'unknown' }
  }
}

export function inferType(ast, typeOf) {
  return inferNode(ast, typeOf)
}

export function normalizeFormulaValue(field, value) {
  if (value === undefined || value === null) return undefined
  switch (field.type) {
    case 'number':
      return toNumber(value)
    case 'input':
    case 'textarea': {
      const s = strOf(value)
      return s === undefined ? undefined : s
    }
    case 'date': {
      const ms = parseDateLikeToMs(value)
      return ms === null ? undefined : formatMs(ms, 'YYYY-MM-DD')
    }
    case 'time': {
      const ms = parseDateLikeToMs(value)
      if (ms === null) return undefined
      return formatMs(ms, field.format === 'HH:mm' ? 'HH:mm' : 'HH:mm:ss')
    }
    case 'datetime': {
      const ms = parseDateLikeToMs(value)
      return ms === null ? undefined : new Date(ms)
    }
    default:
      return undefined
  }
}
