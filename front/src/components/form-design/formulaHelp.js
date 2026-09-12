import { FORMULA_FUNCTIONS, parseDateLikeToMs } from '../form-fill/formula/evaluator.js'

export const FORMULA_CATEGORY_LABELS = {
  math: '数学',
  logic: '逻辑',
  text: '文本',
  date: '日期',
  aggregate: '聚合',
}

// 函数帮助里「参数 / 返回值 / 使用示例」这些要人写的内容。
// 示例里的 values 是给 formulaHelp.spec.js 跑断言用的样例数据，界面上不显示。
const HELP_DETAILS = {
  ROUND: {
    returns: '数字',
    params: ['要处理的数字，可以是字段、算式或直接写数字', '保留几位小数，写 0 表示取整'],
    examples: [
      {
        expr: "ROUND($'单价' * 1.13, 2)",
        note: '含税单价保留两位小数',
        values: { 单价: 2.5 },
        expect: 2.83,
        expectText: '2.83',
      },
      { expr: 'ROUND(2.5, 0)', note: '四舍五入到整数', expect: 3, expectText: '3' },
    ],
  },
  ABS: {
    returns: '数字（不会是负数）',
    params: ['任意数字'],
    examples: [
      {
        expr: "ABS($'单价' - $'成本')",
        note: '算两个数的差，不管谁大谁小都是正数',
        values: { 单价: 2.5, 成本: 2 },
        expect: 0.5,
        expectText: '0.5',
      },
      { expr: 'ABS(-3)', note: '负数的绝对值', expect: 3, expectText: '3' },
    ],
  },
  IF: {
    returns: '和「结果1」「结果2」同类型',
    params: ['要判断的条件（比较、逻辑表达式，或真假值）', '条件成立时返回的值', '条件不成立时返回的值'],
    tips: ['两个结果最好同类型（都写数字或都写文本），类型不一致保存表单时会报错。'],
    examples: [
      {
        expr: "IF($'单价' > 1, '偏贵', '正常')",
        note: '单价大于 1 显示「偏贵」，否则显示「正常」',
        values: { 单价: 2.5 },
        expect: '偏贵',
        expectText: '偏贵',
      },
      {
        expr: "IF(ISEMPTY($'备注'), '未填', '已填')",
        note: '备注空着就显示「未填」',
        values: { 备注: '急' },
        expect: '已填',
        expectText: '已填',
      },
    ],
  },
  AND: {
    returns: '真 / 假',
    params: ['第一个条件', '可以接着写更多条件，全都成立才返回真'],
    tips: ['一般不用单独用，套在 IF 的条件里：IF(AND(...), 成立时, 不成立时)。'],
    examples: [
      {
        expr: "IF(AND($'单价' > 0, $'数量' > 0), '正常', '检查')",
        note: '两个条件都满足才算正常',
        values: { 单价: 2.5, 数量: 3 },
        expect: '正常',
        expectText: '正常',
      },
    ],
  },
  OR: {
    returns: '真 / 假',
    params: ['第一个条件', '可以接着写更多条件，任一成立就返回真'],
    examples: [
      {
        expr: "IF(OR($'状态' == '已发货', $'状态' == '已完成'), '结束', '进行中')",
        note: '两个状态命中任意一个就算结束',
        values: { 状态: '已发货' },
        expect: '结束',
        expectText: '结束',
      },
    ],
  },
  NOT: {
    returns: '真 / 假',
    params: ['要取反的条件或真假值'],
    examples: [
      {
        expr: "IF(NOT(ISEMPTY($'备注')), '有备注', '无备注')",
        note: '把「是空的」反过来判断',
        values: { 备注: '急' },
        expect: '有备注',
        expectText: '有备注',
      },
    ],
  },
  CONCATENATE: {
    returns: '文本',
    params: ['要拼接的第一段内容，文本、数字、字段都行', '可以接着写更多段，按顺序拼起来'],
    examples: [
      {
        expr: "CONCATENATE('订单-', $'商品名称')",
        note: '给商品名称加个前缀',
        values: { 商品名称: '螺丝' },
        expect: '订单-螺丝',
        expectText: '订单-螺丝',
      },
      {
        expr: "CONCATENATE($'商品名称', ' ×', TEXT($'数量', '0'))",
        note: '文本和数字拼接时，数字先用 TEXT 定型，避免出现一长串小数',
        values: { 商品名称: '螺丝', 数量: 3 },
        expect: '螺丝 ×3',
        expectText: '螺丝 ×3',
      },
    ],
  },
  LEFT: {
    returns: '文本',
    params: ['原文本', '从左边取几个字符（中文一个字算一个）'],
    examples: [
      {
        expr: "LEFT($'订单号', 4)",
        note: '取订单号前 4 位当年份',
        values: { 订单号: '20260911-001' },
        expect: '2026',
        expectText: '2026',
      },
    ],
  },
  RIGHT: {
    returns: '文本',
    params: ['原文本', '从右边取几个字符'],
    examples: [
      {
        expr: "RIGHT($'订单号', 3)",
        note: '取订单号后 3 位当流水',
        values: { 订单号: '20260911-001' },
        expect: '001',
        expectText: '001',
      },
    ],
  },
  MID: {
    returns: '文本',
    params: ['原文本', '从第几个字符开始取（从 1 数起）', '一共取几个字符'],
    tips: ['起始位置从 1 开始，不是从 0。'],
    examples: [
      {
        expr: "MID($'订单号', 5, 4)",
        note: '从第 5 位开始取 4 位，取出月日',
        values: { 订单号: '20260911-001' },
        expect: '0911',
        expectText: '0911',
      },
    ],
  },
  LEN: {
    returns: '数字',
    params: ['原文本'],
    examples: [
      {
        expr: "LEN($'商品名称')",
        note: '数一数字符个数，中文一个字算一个',
        values: { 商品名称: '螺丝' },
        expect: 2,
        expectText: '2',
      },
    ],
  },
  TEXT: {
    returns: '文本',
    params: [
      '要转成文本的数字或日期',
      '格式：数字写 0.00（两位小数）、0（取整）这类；日期写 YYYY-MM-DD、YYYY年MM月DD日 这类',
    ],
    tips: ['格式里带 YYYY / MM / DD / HH / mm / ss 就按日期处理，否则按数字处理。'],
    examples: [
      {
        expr: "TEXT($'单价', '0.00')",
        note: '数字保留两位小数再当文本用',
        values: { 单价: 2.5 },
        expect: '2.50',
        expectText: '2.50',
      },
      {
        expr: "TEXT($'下单日期', 'YYYY年MM月DD日')",
        note: '日期转成指定写法的文本',
        values: { 下单日期: '2026-09-11' },
        expect: '2026年09月11日',
        expectText: '2026年09月11日',
      },
    ],
  },
  VALUE: {
    returns: '数字（转不了得空）',
    params: ['数字文本'],
    examples: [
      {
        expr: "VALUE($'数量文本') * 2",
        note: '文本形式的数字要先 VALUE 转成数字才能算',
        values: { 数量文本: '3' },
        expect: 6,
        expectText: '6',
      },
    ],
  },
  ISEMPTY: {
    returns: '真 / 假',
    params: ['要判断的值，字段或算式都行'],
    examples: [
      {
        expr: "IF(ISEMPTY($'备注'), '未填', '已填')",
        note: '常用来给空值兜底',
        values: { 备注: '急' },
        expect: '已填',
        expectText: '已填',
      },
    ],
  },
  SUM: {
    returns: '数字（全空得空）',
    params: ['子表单数字列（如 明细.金额），也可以是普通数字', '可以接着写更多列或数字'],
    tips: ['聚合函数只能在主表公式里对子表数字列整列求和，行内公式里不能这么用。'],
    examples: [
      {
        expr: "SUM($'明细.金额')",
        note: '把明细每一行的金额加起来',
        values: { 明细: [{ 金额: 7.5 }, { 金额: 10 }] },
        expect: 17.5,
        expectText: '17.5',
      },
      {
        expr: "SUM($'明细.数量', 1)",
        note: '整列求和之后再加一个固定数',
        values: { 明细: [{ 数量: 3 }, { 数量: 4 }] },
        expect: 8,
        expectText: '8',
      },
    ],
  },
  AVERAGE: {
    returns: '数字（全空得空）',
    params: ['子表单数字列（如 明细.金额），也可以是普通数字', '可以接着写更多列或数字'],
    tips: ['聚合函数只能在主表公式里对子表数字列整列求值，行内公式里不能这么用。'],
    examples: [
      {
        expr: "AVERAGE($'明细.金额')",
        note: '求明细金额的平均值，空值跳过',
        values: { 明细: [{ 金额: 7.5 }, { 金额: 10 }] },
        expect: 8.75,
        expectText: '8.75',
      },
    ],
  },
  MAX: {
    returns: '数字',
    params: ['子表单数字列（如 明细.金额），也可以是普通数字', '可以接着写更多列或数字'],
    tips: ['聚合函数只能在主表公式里对子表数字列整列求值，行内公式里不能这么用。'],
    examples: [
      {
        expr: "MAX($'明细.金额')",
        note: '取明细金额里最大的一笔',
        values: { 明细: [{ 金额: 7.5 }, { 金额: 10 }] },
        expect: 10,
        expectText: '10',
      },
    ],
  },
  MIN: {
    returns: '数字',
    params: ['子表单数字列（如 明细.金额），也可以是普通数字', '可以接着写更多列或数字'],
    tips: ['聚合函数只能在主表公式里对子表数字列整列求值，行内公式里不能这么用。'],
    examples: [
      {
        expr: "MIN($'明细.金额')",
        note: '取明细金额里最小的一笔',
        values: { 明细: [{ 金额: 7.5 }, { 金额: 10 }] },
        expect: 7.5,
        expectText: '7.5',
      },
    ],
  },
  TODAY: {
    returns: '时间戳（配在日期字段上直接显示成日期）',
    params: [],
    examples: [
      {
        expr: 'TODAY()',
        note: '保存时自动填今天。和别的日期一起用时，比如 DATEDELTA(TODAY(), 7) 就是一周后',
      },
    ],
  },
  NOW: {
    returns: '时间戳（配在日期时间字段上直接显示成时间）',
    params: [],
    examples: [
      {
        expr: 'NOW()',
        note: '保存时自动填当前时间，每次保存都会刷新成那一刻',
      },
    ],
  },
  DATEDIF: {
    returns: '数字（单位不同含义不同：Y 年、M 月、D 天）',
    params: ['开始日期', '结束日期', '单位，写 Y（年）、M（月）或 D（天）'],
    tips: ['不满整年整月的部分舍去，比如差 25 天写 M 得 0。'],
    examples: [
      {
        expr: "DATEDIF($'开始日期', $'结束日期', 'D')",
        note: '算两个日期差几天',
        values: { 开始日期: '2026-09-01', 结束日期: '2026-09-11' },
        expect: 10,
        expectText: '10',
      },
      {
        expr: "DATEDIF($'开始日期', $'结束日期', 'M')",
        note: '差不到一个月就得 0',
        values: { 开始日期: '2026-09-01', 结束日期: '2026-09-11' },
        expect: 0,
        expectText: '0',
      },
    ],
  },
  DATEDELTA: {
    returns: '时间戳（配在日期字段上直接显示成日期）',
    params: ['起始日期', '往后加几天，写负数就是往前推'],
    examples: [
      {
        expr: "DATEDELTA($'下单日期', 7)",
        note: '下单日期往后 7 天，配在日期字段上显示成 2026-09-18',
        values: { 下单日期: '2026-09-11' },
        expect: parseDateLikeToMs('2026-09-18'),
      },
      {
        expr: "DATEDELTA($'下单日期', -1)",
        note: '往前推一天',
        values: { 下单日期: '2026-09-11' },
        expect: parseDateLikeToMs('2026-09-10'),
      },
    ],
  },
}

// 从函数签名里抠出参数名：IF(条件, 结果1, 结果2) → ['条件', '结果1', '结果2']
export function parseParamNames(signature) {
  const text = String(signature || '')
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  if (open < 0 || close <= open) return []
  const inner = text.slice(open + 1, close).trim()
  if (!inner) return []
  return inner.split(',').map((part) => part.trim())
}

export function buildFormulaHelp() {
  return FORMULA_FUNCTIONS.map((def) => {
    const detail = HELP_DETAILS[def.name] || {}
    const parts = String(def.summary || '').split('：')
    const signature = parts[0] || def.name
    return {
      name: def.name,
      category: def.category,
      categoryLabel: FORMULA_CATEGORY_LABELS[def.category] || def.category,
      signature,
      paramNames: parseParamNames(signature),
      description: parts.slice(1).join('：'),
      returns: detail.returns || '',
      tips: detail.tips || [],
      params: detail.params || [],
      examples: detail.examples || [],
    }
  })
}
