import { FormField } from '../form-record/form-record.types';
import { WorkflowGraph } from './workflow.types';
import {
  nextStay,
  previousApproveNodeKey,
  validatePublishedGraph,
} from './workflow.graph';

const leaveGraph: WorkflowGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 240, y: 40 },
    { key: 'br1', type: 'branch', title: '按请假类型', x: 240, y: 140 },
    {
      key: 'n1',
      type: 'approve',
      title: '部门审批',
      x: 80,
      y: 280,
      approver: {
        userIds: [],
        roleIds: [2],
        memberFieldKeys: [],
        sameDeptAsInitiator: true,
      },
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: {
        field_leave_type: 'readonly',
        field_reason: 'editable',
      },
    },
    {
      key: 'n2',
      type: 'approve',
      title: '人事备案',
      x: 240,
      y: 420,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
      signMode: 'all',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    { key: 'end', type: 'end', title: '结束', x: 240, y: 540 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'br1' },
    {
      key: 'e2',
      from: 'br1',
      to: 'n1',
      title: '事假',
      sort: 1,
      isDefault: false,
      when: {
        logic: 'all',
        items: [{ key: 'field_leave_type', op: 'eq', value: '事假' }],
      },
    },
    {
      key: 'e3',
      from: 'br1',
      to: 'n2',
      title: '其他情况',
      sort: 2,
      isDefault: true,
    },
    { key: 'e4', from: 'n1', to: 'n2' },
    { key: 'e5', from: 'n2', to: 'end' },
  ],
};

const fields: FormField[] = [
  { key: 'field_leave_type', type: 'select', title: '请假类型' },
  { key: 'field_reason', type: 'textarea', title: '事由' },
];

const branchToEndGraph: WorkflowGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
    { key: 'br1', type: 'branch', title: '直达', x: 0, y: 1 },
    {
      key: 'n1',
      type: 'approve',
      title: '备审',
      x: 0,
      y: 2,
      approver: { userIds: [1], roleIds: [], memberFieldKeys: [] },
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    { key: 'end', type: 'end', title: '结束', x: 0, y: 3 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'br1' },
    {
      key: 'e2',
      from: 'br1',
      to: 'n1',
      sort: 1,
      when: { logic: 'all', items: [{ key: 'go', op: 'eq', value: 'yes' }] },
    },
    { key: 'e3', from: 'br1', to: 'end', sort: 2, isDefault: true },
    { key: 'e4', from: 'n1', to: 'end' },
  ],
};

const cycleGraph: WorkflowGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
    {
      key: 'n1',
      type: 'approve',
      title: '一审',
      x: 0,
      y: 1,
      approver: { userIds: [1], roleIds: [], memberFieldKeys: [] },
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: {},
    },
    { key: 'end', type: 'end', title: '结束', x: 0, y: 2 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'n1' },
    { key: 'e2', from: 'n1', to: 'n1' },
    { key: 'e3', from: 'n1', to: 'end' },
  ],
};

describe('workflow.graph', () => {
  it('事假走到部门审批', () => {
    const stay = nextStay(leaveGraph, 'start', { field_leave_type: '事假' });
    expect(stay).toMatchObject({ kind: 'approve', nodeKey: 'n1' });
    expect(stay.visited).toEqual(['br1', 'n1']);
  });

  it('病假跳过部门审批', () => {
    expect(nextStay(leaveGraph, 'start', { field_leave_type: '病假' })).toMatchObject({
      kind: 'approve',
      nodeKey: 'n2',
    });
  });

  it('只有分支直达结束时标记未经审批', () => {
    expect(nextStay(branchToEndGraph, 'start', {})).toMatchObject({
      kind: 'end',
      passedApprove: false,
    });
  });

  it('缺其他情况不能发布', () => {
    const brokenBranch: WorkflowGraph = {
      ...leaveGraph,
      edges: leaveGraph.edges.filter((edge) => edge.key !== 'e3'),
    };
    const errors = validatePublishedGraph(brokenBranch, fields);
    expect(errors.some((item) => item.includes('其他情况'))).toBe(true);
  });

  it('环不能发布', () => {
    expect(validatePublishedGraph(cycleGraph, fields).join('')).toContain(
      '不能绕回',
    );
  });

  it('请假单完整图可以发布', () => {
    expect(validatePublishedGraph(leaveGraph, fields)).toEqual([]);
  });
});

const ccHang: WorkflowGraph = {
  nodes: [
    ...leaveGraph.nodes,
    {
      key: 'cc1',
      type: 'cc',
      title: '抄送经理',
      x: 400,
      y: 280,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
      fieldAccess: { field_reason: 'hidden' },
    },
  ],
  edges: [
    ...leaveGraph.edges,
    { key: 'e_cc', from: 'n1', to: 'cc1' },
  ],
};

describe('workflow.graph 抄送', () => {
  it('审批多一条连到抄送的线仍能启用', () => {
    expect(validatePublishedGraph(ccHang, fields)).toEqual([]);
  });

  it('抄送可以不配人', () => {
    const graph = structuredClone(ccHang);
    const cc = graph.nodes.find((node) => node.key === 'cc1');
    if (cc && cc.type === 'cc') {
      cc.approver = { userIds: [], roleIds: [], memberFieldKeys: [] };
    }
    expect(validatePublishedGraph(graph, fields)).toEqual([]);
  });

  it('抄送有出线不能启用', () => {
    const graph = structuredClone(ccHang);
    graph.edges.push({ key: 'bad', from: 'cc1', to: 'end' });
    expect(validatePublishedGraph(graph, fields).join('')).toMatch(/抄送不能有出线/);
  });

  it('开始两条主出线不能启用', () => {
    const graph = structuredClone(leaveGraph);
    graph.edges.push({ key: 'extra', from: 'start', to: 'n2' });
    expect(validatePublishedGraph(graph, fields).join('')).toMatch(/主出线/);
  });

  it('按走过的审批节点倒着找上一站，不看图上别的岔路', () => {
    expect(
      previousApproveNodeKey(leaveGraph, ['start', 'br1', 'n1', 'n2'], 'n2'),
    ).toBe('n1');
    expect(
      previousApproveNodeKey(leaveGraph, ['start', 'br1', 'n1'], 'n1'),
    ).toBeNull();
  });

  it('通过部门审批时带上挂着的抄送，主路仍去人事备案', () => {
    const stay = nextStay(ccHang, 'n1', { field_leave_type: '事假' });
    expect(stay.kind).toBe('approve');
    if (stay.kind !== 'approve') return;
    expect(stay.nodeKey).toBe('n2');
    expect(stay.ccNodeKeys).toEqual(['cc1']);
  });
});
