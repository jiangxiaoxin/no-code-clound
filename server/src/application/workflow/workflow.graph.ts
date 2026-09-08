import { flattenFields } from '../form-record/flatten-fields';
import { FormField } from '../form-record/form-record.types';
import {
  WorkflowEdge,
  WorkflowEdgeCondition,
  WorkflowGraph,
  WorkflowNode,
} from './workflow.types';

export type NextStay =
  | { kind: 'approve'; nodeKey: string; visited: string[]; ccNodeKeys: string[] }
  | {
      kind: 'end';
      visited: string[];
      endNodeKey: string;
      passedApprove: boolean;
      ccNodeKeys: string[];
    }
  | { kind: 'error'; visited: string[]; reason: string; ccNodeKeys: string[] };

function nodeByKey(graph: WorkflowGraph, key: string): WorkflowNode | undefined {
  return graph.nodes.find((node) => node.key === key);
}

export function previousApproveNodeKey(
  graph: WorkflowGraph,
  visited: string[] | null | undefined,
  currentNodeKey: string,
): string | null {
  const keys = visited || [];
  const currentIndex = keys.lastIndexOf(currentNodeKey);
  const before = currentIndex >= 0 ? keys.slice(0, currentIndex) : keys;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const node = nodeByKey(graph, before[i]);
    if (node?.type === 'approve') return node.key;
  }
  return null;
}

function outgoing(graph: WorkflowGraph, from: string): WorkflowEdge[] {
  return graph.edges
    .filter((edge) => edge.from === from)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

function mainOutgoing(graph: WorkflowGraph, from: string): WorkflowEdge[] {
  return outgoing(graph, from).filter((edge) => {
    const to = nodeByKey(graph, edge.to);
    return to?.type !== 'cc';
  });
}

function ccOutgoingKeys(graph: WorkflowGraph, from: string): string[] {
  return outgoing(graph, from)
    .filter((edge) => nodeByKey(graph, edge.to)?.type === 'cc')
    .map((edge) => edge.to);
}

function fieldKeys(fields: FormField[] | null): Set<string> {
  return new Set(
    flattenFields(fields)
      .map((field) => field.key)
      .filter(Boolean),
  );
}

function memberFieldKeys(fields: FormField[] | null): Set<string> {
  return new Set(
    flattenFields(fields)
      .filter(
        (field) => field.type === 'member' || field.type === 'member-multiple',
      )
      .map((field) => field.key),
  );
}

function isEmptyValue(value: unknown): boolean {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',');
  return String(value);
}

function matchItem(
  item: { key: string; op: string; value?: unknown },
  data: Record<string, unknown>,
): boolean {
  if (item.value != null && typeof item.value === 'object' && !Array.isArray(item.value)) {
    const kind = (item.value as { kind?: string }).kind;
    if (kind === 'dynamic') return false;
  }
  const left = data[item.key];
  const op = item.op;
  if (op === 'empty') return isEmptyValue(left);
  if (op === 'nempty') return !isEmptyValue(left);
  if (op === 'eq') {
    if (Array.isArray(left)) return left.map(String).includes(asText(item.value));
    return asText(left) === asText(item.value);
  }
  if (op === 'ne') {
    if (Array.isArray(left)) return !left.map(String).includes(asText(item.value));
    return asText(left) !== asText(item.value);
  }
  if (op === 'contains') return asText(left).includes(asText(item.value));
  if (op === 'ncontains') return !asText(left).includes(asText(item.value));
  const ln = asNumber(left);
  const rn = asNumber(item.value);
  if (ln != null && rn != null) {
    if (op === 'gt') return ln > rn;
    if (op === 'gte') return ln >= rn;
    if (op === 'lt') return ln < rn;
    if (op === 'lte') return ln <= rn;
  }
  const ls = asText(left);
  const rs = asText(item.value);
  if (op === 'gt') return ls > rs;
  if (op === 'gte') return ls >= rs;
  if (op === 'lt') return ls < rs;
  if (op === 'lte') return ls <= rs;
  return false;
}

export function matchEdgeCondition(
  when: WorkflowEdgeCondition | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!when?.items?.length) return false;
  const hits = when.items.map((item) => matchItem(item, data));
  return when.logic === 'any' ? hits.some(Boolean) : hits.every(Boolean);
}

function pickBranchEdge(
  edges: WorkflowEdge[],
  data: Record<string, unknown>,
): WorkflowEdge | undefined {
  for (const edge of edges) {
    if (edge.isDefault) continue;
    if (matchEdgeCondition(edge.when, data)) return edge;
  }
  return edges.find((edge) => edge.isDefault);
}

function reachableFromStart(graph: WorkflowGraph): Set<string> {
  const start = graph.nodes.find((node) => node.type === 'start');
  const seen = new Set<string>();
  if (!start) return seen;
  const queue = [start.key];
  while (queue.length) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const edge of outgoing(graph, key)) {
      if (!seen.has(edge.to)) queue.push(edge.to);
    }
  }
  return seen;
}

function canReachEnd(graph: WorkflowGraph, from: string): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = nodeByKey(graph, key);
    if (node?.type === 'end') return true;
    for (const edge of outgoing(graph, key)) queue.push(edge.to);
  }
  return false;
}

function hasCycle(graph: WorkflowGraph): boolean {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const walk = (key: string): boolean => {
    if (done.has(key)) return false;
    if (visiting.has(key)) return true;
    visiting.add(key);
    for (const edge of outgoing(graph, key)) {
      if (walk(edge.to)) return true;
    }
    visiting.delete(key);
    done.add(key);
    return false;
  };
  return graph.nodes.some((node) => walk(node.key));
}

export function validatePublishedGraph(
  graph: WorkflowGraph,
  formFields: FormField[] | null,
): string[] {
  const errors: string[] = [];
  const nodes = graph.nodes ?? [];
  const starts = nodes.filter((node) => node.type === 'start');
  const ends = nodes.filter((node) => node.type === 'end');
  const approves = nodes.filter((node) => node.type === 'approve');
  if (starts.length !== 1) {
    errors.push('必须恰好有一个开始节点');
  } else if (mainOutgoing(graph, starts[0].key).length !== 1) {
    errors.push('开始必须有且仅有一条主出线');
  }
  if (!approves.length) errors.push('至少需要一个审批节点');
  if (!ends.length) errors.push('至少需要一个结束节点');

  for (const node of approves) {
    if (!node.title?.trim()) {
      errors.push('审批节点需要名称');
    }
    if (mainOutgoing(graph, node.key).length !== 1) {
      errors.push(`审批「${node.title || node.key}」必须有且仅有一条主出线`);
    }
    const rule = node.approver;
    const hasPeople =
      (rule?.userIds?.length ?? 0) > 0 ||
      (rule?.roleIds?.length ?? 0) > 0 ||
      (rule?.memberFieldKeys?.length ?? 0) > 0 ||
      Boolean(rule?.deptLeaderOfInitiator);
    if (!hasPeople) {
      errors.push(`节点「${node.title || node.key}」没有审批人`);
    }
    const members = memberFieldKeys(formFields);
    for (const key of rule?.memberFieldKeys ?? []) {
      if (!members.has(key)) {
        errors.push(
          `节点「${node.title || node.key}」选的人员字段已从表单删除`,
        );
      }
    }
  }

  for (const node of nodes.filter((item) => item.type === 'branch')) {
    const outs = mainOutgoing(graph, node.key);
    const defaults = outs.filter((edge) => edge.isDefault);
    if (outs.length < 2 || defaults.length !== 1) {
      errors.push(`分支「${node.title || node.key}」需要至少两条出线且恰好一条「其他情况」`);
    }
    for (const edge of outs) {
      if (!edge.isDefault && !edge.when?.items?.length) {
        errors.push(`分支「${node.title || node.key}」的连线没有条件`);
      }
    }
  }

  for (const node of nodes.filter((item) => item.type === 'cc')) {
    if (outgoing(graph, node.key).length) {
      errors.push('抄送不能有出线');
    }
    const members = memberFieldKeys(formFields);
    for (const key of node.approver?.memberFieldKeys ?? []) {
      if (!members.has(key)) {
        errors.push(
          `节点「${node.title || node.key}」选的人员字段已从表单删除`,
        );
      }
    }
  }

  for (const node of ends) {
    if (outgoing(graph, node.key).length) {
      errors.push('结束不能有出线');
    }
  }

  if (hasCycle(graph)) {
    errors.push('流程不能绕回已经走过的节点');
  }

  const reachable = reachableFromStart(graph);
  for (const node of nodes) {
    if (node.type === 'start') continue;
    if (!reachable.has(node.key)) {
      errors.push(`节点「${node.title || node.key}」从开始走不到`);
    }
  }
  for (const node of nodes) {
    if (node.type === 'end' || node.type === 'start' || node.type === 'cc') {
      continue;
    }
    if (reachable.has(node.key) && !canReachEnd(graph, node.key)) {
      errors.push(`节点「${node.title || node.key}」走不到结束`);
    }
  }

  const keys = fieldKeys(formFields);
  for (const edge of graph.edges ?? []) {
    for (const item of edge.when?.items ?? []) {
      if (item.key && !keys.has(item.key)) {
        const from = nodeByKey(graph, edge.from);
        errors.push(
          `分支「${from?.title || edge.from}」的连线用了已删除的字段`,
        );
      }
    }
  }
  return errors;
}

export function nextStay(
  graph: WorkflowGraph,
  fromNodeKey: string,
  data: Record<string, unknown>,
): NextStay {
  const from = nodeByKey(graph, fromNodeKey);
  if (!from) {
    return {
      kind: 'error',
      visited: [],
      reason: '流程图缺少当前节点',
      ccNodeKeys: [],
    };
  }
  const visited: string[] = [];
  const seen = new Set<string>([fromNodeKey]);
  const ccNodeKeys: string[] = [];
  let current = fromNodeKey;
  let passedApprove = from.type === 'approve';

  const collectCc = (fromKey: string) => {
    for (const key of ccOutgoingKeys(graph, fromKey)) {
      if (!ccNodeKeys.includes(key)) ccNodeKeys.push(key);
    }
  };

  for (;;) {
    const node = nodeByKey(graph, current);
    if (!node) {
      return {
        kind: 'error',
        visited,
        reason: '流程图缺少节点',
        ccNodeKeys: [],
      };
    }
    collectCc(current);
    const edges = mainOutgoing(graph, current);
    let edge: WorkflowEdge | undefined;
    if (node.type === 'branch') {
      edge = pickBranchEdge(edges, data);
    } else if (node.type === 'end') {
      return { kind: 'end', visited, endNodeKey: current, passedApprove, ccNodeKeys };
    } else {
      edge = edges[0];
    }
    if (!edge) {
      return {
        kind: 'error',
        visited,
        reason: `节点「${node.title || node.key}」没有可走的连线`,
        ccNodeKeys: [],
      };
    }
    if (seen.has(edge.to)) {
      return {
        kind: 'error',
        visited,
        reason: '流程不能绕回已经走过的节点',
        ccNodeKeys: [],
      };
    }
    seen.add(edge.to);
    const next = nodeByKey(graph, edge.to);
    if (!next) {
      return {
        kind: 'error',
        visited,
        reason: '连线指向了不存在的节点',
        ccNodeKeys: [],
      };
    }
    if (next.type === 'branch') {
      visited.push(next.key);
      current = next.key;
      continue;
    }
    if (next.type === 'approve') {
      visited.push(next.key);
      return { kind: 'approve', nodeKey: next.key, visited, ccNodeKeys };
    }
    if (next.type === 'end') {
      return { kind: 'end', visited, endNodeKey: next.key, passedApprove, ccNodeKeys };
    }
    current = next.key;
  }
}
