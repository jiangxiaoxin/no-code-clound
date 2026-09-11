import { BadRequestException } from '@nestjs/common';
import { flattenFields } from './form-record/flatten-fields';
import { FieldFormula, FormField } from './form-record/form-record.types';
import { inferType, StaticType } from './form-record/formula/evaluator';
import {
  AGGREGATE_FUNCTION_NAMES,
  FORMULA_FIELD_TYPES,
} from './form-record/formula/functions';
import {
  FORMULA_MAX_LENGTH,
  FormulaAst,
  parseFormula,
} from './form-record/formula/parser';

export const REF_SOURCE_TYPES = [
  ...FORMULA_FIELD_TYPES,
  'radio',
  'select',
  'select-multiple',
  'checkbox',
  'member',
  'dept',
  'serialNumber',
];

const DATE_LIKE_FIELD_TYPES = ['date', 'time', 'datetime'];

type RefContext = {
  mainFields: Map<string, FormField>;
  subformChildren: Map<string, Map<string, FormField>>;
  subKey?: string;
};

type RefNode = Extract<FormulaAst, { kind: 'ref' }>;

type FormulaNode = {
  id: string;
  kind: 'main' | 'row';
  subKey?: string;
  refs: string[];
};

function formulaBadRequest(message: string): never {
  throw new BadRequestException(message);
}

function staticTypeOfField(field: FormField | undefined): StaticType {
  if (!field) return 'unknown';
  switch (field.type) {
    case 'number':
      return 'number';
    case 'input':
    case 'textarea':
    case 'radio':
    case 'select':
    case 'select-multiple':
    case 'checkbox':
    case 'serialNumber':
      return 'string';
    case 'date':
    case 'time':
    case 'datetime':
      return 'date';
    default:
      return 'unknown';
  }
}

function assertBasicFormula(field: FormField): FieldFormula {
  if (!FORMULA_FIELD_TYPES.includes(field.type)) {
    formulaBadRequest('该字段不支持公式');
  }
  if (field.required || field.unique || field.uniqueInRows) {
    formulaBadRequest('公式字段不支持必填和不允许重复值');
  }
  const formula = field.formula as FieldFormula | undefined;
  if (
    !formula ||
    typeof formula.expr !== 'string' ||
    formula.expr.trim() === ''
  ) {
    formulaBadRequest('请填写公式');
  }
  if (formula.expr.length > FORMULA_MAX_LENGTH) {
    formulaBadRequest(`公式最长 ${FORMULA_MAX_LENGTH} 字符`);
  }
  return formula;
}

function parseOrThrow(expr: string) {
  const parsed = parseFormula(expr);
  if (!parsed.ok) {
    const { error } = parsed;
    if (error.code === 'syntax') {
      formulaBadRequest(
        `公式语法错误：第 ${error.line} 行第 ${error.column} 列附近（${error.message}）`,
      );
    }
    formulaBadRequest(error.message);
  }
  return parsed;
}

function refToken(ref: RefNode): string {
  return `$'${ref.path.join('.')}'`;
}

function walkRefNodes(
  node: FormulaAst,
  inAggregate: boolean,
  cb: (ref: RefNode, inAggregate: boolean) => void,
): void {
  switch (node.kind) {
    case 'ref':
      cb(node, inAggregate);
      return;
    case 'call': {
      const aggregate = AGGREGATE_FUNCTION_NAMES.includes(node.name);
      for (const arg of node.args) {
        walkRefNodes(arg, inAggregate || aggregate, cb);
      }
      return;
    }
    case 'binary':
      walkRefNodes(node.left, inAggregate, cb);
      walkRefNodes(node.right, inAggregate, cb);
      return;
    case 'unary':
      walkRefNodes(node.operand, inAggregate, cb);
      return;
    default:
      return;
  }
}

function validateMainRefs(ast: FormulaAst, ctx: RefContext): void {
  walkRefNodes(ast, false, (ref, inAggregate) => {
    if (inAggregate) {
      if (ref.path.length !== 2) {
        formulaBadRequest('聚合函数参数请选择子表单数字字段');
      }
      const column = ctx.subformChildren.get(ref.path[0])?.get(ref.path[1]);
      if (!column || column.type !== 'number') {
        formulaBadRequest('聚合函数参数请选择子表单数字字段');
      }
      return;
    }
    if (ref.path.length !== 1) {
      formulaBadRequest(`公式引用了不存在的字段 ${refToken(ref)}`);
    }
    const target = ctx.mainFields.get(ref.path[0]);
    if (!target || !REF_SOURCE_TYPES.includes(target.type)) {
      formulaBadRequest(`公式引用了不存在的字段 ${refToken(ref)}`);
    }
  });
}

function validateRowRefs(ast: FormulaAst, ctx: RefContext): void {
  const children = ctx.subformChildren.get(ctx.subKey as string) ?? new Map();
  walkRefNodes(ast, false, (ref) => {
    if (ref.path.length !== 1) {
      formulaBadRequest(`公式引用了不存在的字段 ${refToken(ref)}`);
    }
    const child = children.get(ref.path[0]);
    if (child) {
      if (!REF_SOURCE_TYPES.includes(child.type)) {
        formulaBadRequest(`公式引用了不存在的字段 ${refToken(ref)}`);
      }
      return;
    }
    const main = ctx.mainFields.get(ref.path[0]);
    if (!main || !REF_SOURCE_TYPES.includes(main.type)) {
      formulaBadRequest(`公式引用了不存在的字段 ${refToken(ref)}`);
    }
  });
}

function typeOfPath(path: string[], ctx: RefContext): StaticType {
  if (path.length === 1) {
    if (ctx.subKey) {
      const child = ctx.subformChildren.get(ctx.subKey)?.get(path[0]);
      if (child) return staticTypeOfField(child);
    }
    return staticTypeOfField(ctx.mainFields.get(path[0]));
  }
  if (path.length === 2) {
    return staticTypeOfField(
      ctx.subformChildren.get(path[0])?.get(path[1]),
    );
  }
  return 'unknown';
}

function assertRootType(field: FormField, type: StaticType): void {
  if (field.type === 'number' && type !== 'number' && type !== 'unknown') {
    formulaBadRequest('公式结果类型与字段不匹配');
  }
  if (
    DATE_LIKE_FIELD_TYPES.includes(field.type) &&
    !['date', 'number', 'unknown'].includes(type)
  ) {
    formulaBadRequest('公式结果类型与字段不匹配');
  }
}

function assertFormulaField(field: FormField, ctx: RefContext): string[] {
  const formula = assertBasicFormula(field);
  const parsed = parseOrThrow(formula.expr);
  if (ctx.subKey) {
    validateRowRefs(parsed.ast, ctx);
  } else {
    validateMainRefs(parsed.ast, ctx);
  }
  const inferred = inferType(parsed.ast, (path) => typeOfPath(path, ctx));
  if (!inferred.ok) formulaBadRequest(inferred.error.message);
  assertRootType(field, inferred.type);
  formula.refs = parsed.refs;
  return parsed.refs;
}

function depNodeId(
  ref: string,
  node: FormulaNode,
  byId: Map<string, FormulaNode>,
): string | null {
  const path = ref.split('.');
  if (node.kind === 'main') {
    if (path.length === 1) {
      return byId.has(path[0]) ? path[0] : null;
    }
    if (path.length === 2) {
      const id = `${path[0]}.${path[1]}`;
      return byId.has(id) ? id : null;
    }
    return null;
  }
  if (path.length !== 1) return null;
  const own = `${node.subKey}.${path[0]}`;
  if (byId.has(own)) return own;
  return byId.has(path[0]) ? path[0] : null;
}

function assertNoCycles(nodes: FormulaNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string): void => {
    const current = state.get(id) ?? 0;
    if (current === 1) formulaBadRequest('公式存在循环引用');
    if (current === 2) return;
    state.set(id, 1);
    for (const ref of byId.get(id)?.refs || []) {
      const dep = depNodeId(ref, byId.get(id) as FormulaNode, byId);
      if (dep) visit(dep);
    }
    state.set(id, 2);
  };
  for (const node of nodes) visit(node.id);
}

export function assertFormulaSchemas(fields: FormField[]): void {
  const flat = flattenFields(fields);
  const mainFields = new Map(flat.map((field) => [field.key, field]));
  const subformChildren = new Map<string, Map<string, FormField>>();
  for (const field of flat) {
    if (field.type === 'subform') {
      subformChildren.set(
        field.key,
        new Map((field.fields || []).map((child) => [child.key, child])),
      );
    }
  }

  const formulaNodes: FormulaNode[] = [];
  for (const field of flat) {
    if (field.type === 'subform') {
      for (const child of field.fields || []) {
        if (!child.formula) continue;
        const refs = assertFormulaField(child, {
          mainFields,
          subformChildren,
          subKey: field.key,
        });
        formulaNodes.push({
          id: `${field.key}.${child.key}`,
          kind: 'row',
          subKey: field.key,
          refs,
        });
      }
      continue;
    }
    if (!field.formula) continue;
    const refs = assertFormulaField(field, { mainFields, subformChildren });
    formulaNodes.push({ id: field.key, kind: 'main', refs });
  }

  assertNoCycles(formulaNodes);
}
