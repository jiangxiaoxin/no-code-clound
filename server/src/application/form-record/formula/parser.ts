import { findFunctionDef } from './functions';

export const FORMULA_MAX_LENGTH = 2000;

export type FormulaErrorCode =
  | 'syntax'
  | 'unknown-function'
  | 'arity'
  | 'unknown-field'
  | 'type'
  | 'aggregate'
  | 'limit';

export type FormulaError = {
  code: FormulaErrorCode;
  message: string;
  line: number;
  column: number;
};

type Pos = { line: number; column: number };

export type FormulaAst =
  | (Pos & { kind: 'num'; value: number })
  | (Pos & { kind: 'str'; value: string })
  | (Pos & { kind: 'bool'; value: boolean })
  | (Pos & { kind: 'ref'; path: string[] })
  | (Pos & { kind: 'call'; name: string; args: FormulaAst[] })
  | (Pos & { kind: 'binary'; op: string; left: FormulaAst; right: FormulaAst })
  | (Pos & { kind: 'unary'; op: string; operand: FormulaAst });

type Token =
  | (Pos & { type: 'num'; value: number })
  | (Pos & { type: 'str'; value: string })
  | (Pos & { type: 'ref'; path: string[] })
  | (Pos & { type: 'ident'; value: string })
  | (Pos & { type: 'op'; value: string })
  | (Pos & { type: 'lparen' })
  | (Pos & { type: 'rparen' })
  | (Pos & { type: 'comma' })
  | (Pos & { type: 'eof' });

type TokenizeResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; error: FormulaError };

type ParseResult =
  | { ok: true; ast: FormulaAst }
  | { ok: false; error: FormulaError };

const COMPARE_OPS = ['==', '!=', '>=', '<=', '>', '<'];
const CMP_IN_ADD = ['+', '-'];
const CMP_IN_MUL = ['*', '/', '%'];

function err(
  code: FormulaErrorCode,
  message: string,
  line: number,
  column: number,
): FormulaError {
  return { code, message, line, column };
}

class Tokenizer {
  private i = 0;
  private line = 1;
  private column = 1;

  constructor(private readonly src: string) {}

  private peek(): string {
    return this.src[this.i] ?? '';
  }

  private advance(): string {
    const ch = this.src[this.i] ?? '';
    this.i += 1;
    if (ch === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return ch;
  }

  run(): TokenizeResult {
    const tokens: Token[] = [];
    for (;;) {
      const ch = this.peek();
      if (ch === '') {
        tokens.push({ type: 'eof', line: this.line, column: this.column });
        return { ok: true, tokens };
      }
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
        continue;
      }
      const line = this.line;
      const column = this.column;
      if (ch >= '0' && ch <= '9') {
        let text = '';
        while (this.peek() >= '0' && this.peek() <= '9') {
          text += this.advance();
        }
        if (this.peek() === '.') {
          const next = this.src[this.i + 1] ?? '';
          if (next >= '0' && next <= '9') {
            text += this.advance();
            while (this.peek() >= '0' && this.peek() <= '9') {
              text += this.advance();
            }
          }
        }
        tokens.push({ type: 'num', value: Number(text), line, column });
        continue;
      }
      if (ch === "'" || ch === '"') {
        const quote = this.advance();
        let text = '';
        while (this.peek() !== '' && this.peek() !== quote) {
          text += this.advance();
        }
        if (this.peek() === '') {
          return { ok: false, error: err('syntax', '字符串未闭合', line, column) };
        }
        this.advance();
        tokens.push({ type: 'str', value: text, line, column });
        continue;
      }
      if (ch === '$') {
        const next = this.src[this.i + 1] ?? '';
        if (next !== "'" && next !== '"') {
          return {
            ok: false,
            error: err('syntax', "字段引用需写作 $'字段key'", line, column),
          };
        }
        this.advance();
        const quote = this.advance();
        let key = '';
        while (this.peek() !== '' && this.peek() !== quote) {
          key += this.advance();
        }
        if (this.peek() === '') {
          return { ok: false, error: err('syntax', '字段引用未闭合', line, column) };
        }
        this.advance();
        const path = key.split('.').map((part) => part.trim());
        if (path.some((part) => part === '')) {
          return { ok: false, error: err('syntax', '字段引用不能为空', line, column) };
        }
        tokens.push({ type: 'ref', path, line, column });
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let text = '';
        while (this.peek() !== '' && /[A-Za-z0-9_]/.test(this.peek())) {
          text += this.advance();
        }
        tokens.push({ type: 'ident', value: text, line, column });
        continue;
      }
      const two = ch + (this.src[this.i + 1] ?? '');
      if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
        this.advance();
        this.advance();
        tokens.push({ type: 'op', value: two, line, column });
        continue;
      }
      if ('+-*/%><'.includes(ch)) {
        this.advance();
        tokens.push({ type: 'op', value: ch, line, column });
        continue;
      }
      if (ch === '(') {
        this.advance();
        tokens.push({ type: 'lparen', line, column });
        continue;
      }
      if (ch === ')') {
        this.advance();
        tokens.push({ type: 'rparen', line, column });
        continue;
      }
      if (ch === ',') {
        this.advance();
        tokens.push({ type: 'comma', line, column });
        continue;
      }
      return {
        ok: false,
        error: err('syntax', `公式里不能使用字符「${ch}」`, line, column),
      };
    }
  }
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  parse(): ParseResult {
    const expr = this.parseExpr();
    if (!expr.ok) return expr;
    const eof = this.peek();
    if (eof.type !== 'eof') {
      return {
        ok: false,
        error: err('syntax', '公式末尾有多余内容', eof.line, eof.column),
      };
    }
    return expr;
  }

  private parseExpr(): ParseResult {
    return this.parseCmp();
  }

  private parseCmp(): ParseResult {
    const left = this.parseAdd();
    if (!left.ok) return left;
    const token = this.peek();
    if (token.type === 'op' && COMPARE_OPS.includes(token.value)) {
      this.pos += 1;
      const right = this.parseAdd();
      if (!right.ok) return right;
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
      };
    }
    return left;
  }

  private parseAdd(): ParseResult {
    let left = this.parseMul();
    if (!left.ok) return left;
    for (;;) {
      const token = this.peek();
      if (token.type === 'op' && CMP_IN_ADD.includes(token.value)) {
        this.pos += 1;
        const right = this.parseMul();
        if (!right.ok) return right;
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
        };
        continue;
      }
      return left;
    }
  }

  private parseMul(): ParseResult {
    let left = this.parseUnary();
    if (!left.ok) return left;
    for (;;) {
      const token = this.peek();
      if (token.type === 'op' && CMP_IN_MUL.includes(token.value)) {
        this.pos += 1;
        const right = this.parseUnary();
        if (!right.ok) return right;
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
        };
        continue;
      }
      return left;
    }
  }

  private parseUnary(): ParseResult {
    const token = this.peek();
    if (token.type === 'op' && token.value === '-') {
      this.pos += 1;
      const operand = this.parseUnary();
      if (!operand.ok) return operand;
      return {
        ok: true,
        ast: {
          kind: 'unary',
          op: '-',
          operand: operand.ast,
          line: token.line,
          column: token.column,
        },
      };
    }
    return this.parsePrim();
  }

  private parsePrim(): ParseResult {
    const token = this.peek();
    switch (token.type) {
      case 'num':
        this.pos += 1;
        return { ok: true, ast: { kind: 'num', value: token.value, line: token.line, column: token.column } };
      case 'str':
        this.pos += 1;
        return { ok: true, ast: { kind: 'str', value: token.value, line: token.line, column: token.column } };
      case 'ref':
        this.pos += 1;
        return { ok: true, ast: { kind: 'ref', path: token.path, line: token.line, column: token.column } };
      case 'ident': {
        this.pos += 1;
        const next = this.peek();
        if (next.type === 'lparen') {
          return this.parseCall(token);
        }
        const upper = token.value.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE') {
          return {
            ok: true,
            ast: { kind: 'bool', value: upper === 'TRUE', line: token.line, column: token.column },
          };
        }
        return {
          ok: false,
          error: err('unknown-function', `公式不支持函数 ${token.value}`, token.line, token.column),
        };
      }
      case 'lparen': {
        this.pos += 1;
        const inner = this.parseExpr();
        if (!inner.ok) return inner;
        const close = this.peek();
        if (close.type !== 'rparen') {
          return { ok: false, error: err('syntax', '括号不匹配', close.line, close.column) };
        }
        this.pos += 1;
        return inner;
      }
      default:
        return {
          ok: false,
          error: err('syntax', '公式不完整或有无法识别的内容', token.line, token.column),
        };
    }
  }

  private parseCall(nameToken: Extract<Token, { type: 'ident' }>): ParseResult {
    const name = nameToken.value.toUpperCase();
    const def = findFunctionDef(name);
    if (!def) {
      return {
        ok: false,
        error: err('unknown-function', `公式不支持函数 ${name}`, nameToken.line, nameToken.column),
      };
    }
    this.pos += 1;
    const args: FormulaAst[] = [];
    if (this.peek().type === 'rparen') {
      this.pos += 1;
    } else {
      for (;;) {
        const arg = this.parseExpr();
        if (!arg.ok) return arg;
        args.push(arg.ast);
        const token = this.peek();
        if (token.type === 'comma') {
          this.pos += 1;
          continue;
        }
        if (token.type === 'rparen') {
          this.pos += 1;
          break;
        }
        return {
          ok: false,
          error: err('syntax', '函数参数应为英文逗号或右括号', token.line, token.column),
        };
      }
    }
    if (args.length < def.minArgs || args.length > def.maxArgs) {
      return {
        ok: false,
        error: err('arity', `函数 ${name} 参数个数不正确`, nameToken.line, nameToken.column),
      };
    }
    return {
      ok: true,
      ast: { kind: 'call', name, args, line: nameToken.line, column: nameToken.column },
    };
  }
}

function collectRefs(node: FormulaAst, out: string[]): void {
  switch (node.kind) {
    case 'ref': {
      const id = node.path.join('.');
      if (!out.includes(id)) out.push(id);
      return;
    }
    case 'call':
      for (const arg of node.args) collectRefs(arg, out);
      return;
    case 'binary':
      collectRefs(node.left, out);
      collectRefs(node.right, out);
      return;
    case 'unary':
      collectRefs(node.operand, out);
      return;
    default:
      return;
  }
}

export function parseFormula(
  expr: string,
):
  | { ok: true; ast: FormulaAst; refs: string[] }
  | { ok: false; error: FormulaError } {
  if (typeof expr !== 'string' || expr.trim() === '') {
    return { ok: false, error: err('syntax', '公式不能为空', 1, 1) };
  }
  if (expr.length > FORMULA_MAX_LENGTH) {
    return {
      ok: false,
      error: err('limit', `公式最长 ${FORMULA_MAX_LENGTH} 字符`, 1, 1),
    };
  }
  const tokenized = new Tokenizer(expr).run();
  if (!tokenized.ok) return tokenized;
  const parsed = new Parser(tokenized.tokens).parse();
  if (!parsed.ok) return parsed;
  const refs: string[] = [];
  collectRefs(parsed.ast, refs);
  return { ok: true, ast: parsed.ast, refs };
}
