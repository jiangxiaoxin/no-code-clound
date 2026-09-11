import { FormField } from '../form-record/form-record.types';
import { WorkflowGraph } from './workflow.types';
import {
  allowResubmitAfterTerminated,
  matchEdgeCondition,
  nextStay,
  prepareStartPersistInput,
  previousApproveNodeKey,
  processTimeoutErrors,
  resolvePreviousApproveNodeKey,
  resolveProcessDueAt,
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
      endNodeKey: 'end',
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

  it('visited 只有当前节点时，从本轮已通过待办找上一审批节点', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
        { key: 'n1', type: 'approve', title: '审批', x: 0, y: 1 },
        { key: 'n2', type: 'approve', title: '审批', x: 0, y: 2 },
      ],
      edges: [
        { key: 'e1', from: 'start', to: 'n1' },
        { key: 'e2', from: 'n1', to: 'n2' },
      ],
    };
    expect(
      resolvePreviousApproveNodeKey(graph, ['n2'], 'n2', [
        { nodeKey: 'n1', round: 1, status: 'done', action: 'approve' },
        { nodeKey: 'n2', round: 1, status: 'pending', action: null },
      ], 1),
    ).toBe('n1');
  });

  it('通过部门审批时带上挂着的抄送，主路仍去人事备案', () => {
    const stay = nextStay(ccHang, 'n1', { field_leave_type: '事假' });
    expect(stay.kind).toBe('approve');
    if (stay.kind !== 'approve') return;
    expect(stay.nodeKey).toBe('n2');
    expect(stay.ccNodeKeys).toEqual(['cc1']);
  });

  it('开始节点缺省允许流程终止后再交，关掉才禁止', () => {
    expect(allowResubmitAfterTerminated(undefined)).toBe(true);
    expect(allowResubmitAfterTerminated({ nodes: [], edges: [] })).toBe(true);
    expect(
      allowResubmitAfterTerminated({
        nodes: [{ key: 'start', type: 'start', title: '开始', x: 0, y: 0 }],
        edges: [],
      }),
    ).toBe(true);
    expect(
      allowResubmitAfterTerminated({
        nodes: [
          {
            key: 'start',
            type: 'start',
            title: '开始',
            x: 0,
            y: 0,
            allowResubmitAfterTerminated: false,
          },
        ],
        edges: [],
      }),
    ).toBe(false);
  });

  it('prepareStartPersistInput 未配置时保留全部字段', () => {
    const fields: FormField[] = [
      { key: 'field_reason', type: 'textarea', title: '事由' },
    ];
    const graph: WorkflowGraph = {
      nodes: [{ key: 'start', type: 'start', title: '开始', x: 0, y: 0 }],
      edges: [],
    };
    expect(
      prepareStartPersistInput({ field_reason: '事假' }, fields, graph),
    ).toEqual({ data: { field_reason: '事假' }, requiredKeys: 'all' });
  });

  it('prepareStartPersistInput 只落库可编辑字段', () => {
    const fields: FormField[] = [
      { key: 'field_reason', type: 'textarea', title: '事由' },
      { key: 'field_days', type: 'number', title: '天数' },
    ];
    const graph: WorkflowGraph = {
      nodes: [
        {
          key: 'start',
          type: 'start',
          title: '开始',
          x: 0,
          y: 0,
          fieldAccess: { field_reason: 'editable', field_days: 'readonly' },
        },
      ],
      edges: [],
    };
    expect(
      prepareStartPersistInput(
        { field_reason: '事假', field_days: 3 },
        fields,
        graph,
      ),
    ).toEqual({
      data: { field_reason: '事假' },
      requiredKeys: ['field_reason'],
    });
  });

  it('prepareStartPersistInput 不把只读、不可见字段的客户端值写入补丁', () => {
    const fields: FormField[] = [
      { key: 'field_reason', type: 'textarea', title: '事由' },
      { key: 'field_when', type: 'datetime', title: '申请时间' },
      { key: 'field_note', type: 'input', title: '内部备注' },
    ];
    const graph: WorkflowGraph = {
      nodes: [
        {
          key: 'start',
          type: 'start',
          title: '开始',
          x: 0,
          y: 0,
          fieldAccess: {
            field_reason: 'editable',
            field_when: 'readonly',
            field_note: 'hidden',
          },
        },
      ],
      edges: [],
    };
    expect(
      prepareStartPersistInput(
        {
          field_reason: '事假',
          field_when: '2026-09-08T10:00:00.000Z',
          field_note: '不该写入',
        },
        fields,
        graph,
      ),
    ).toEqual({
      data: { field_reason: '事假' },
      requiredKeys: ['field_reason'],
    });
  });

  it('prepareStartPersistInput 只读字段没有旧值时不采纳请求体', () => {
    // 首次创建、发布后新加的字段都没有旧值可兜底，
    // 此时只读字段不能采纳请求体里的值，否则旧草稿能偷改只读字段
    const fields: FormField[] = [
      { key: 'field_reason', type: 'textarea', title: '事由' },
      { key: 'field_days', type: 'number', title: '天数' },
    ];
    const graph: WorkflowGraph = {
      nodes: [
        {
          key: 'start',
          type: 'start',
          title: '开始',
          x: 0,
          y: 0,
          fieldAccess: { field_reason: 'editable', field_days: 'readonly' },
        },
      ],
      edges: [],
    };
    expect(
      prepareStartPersistInput(
        { field_reason: '事假', field_days: 3 },
        fields,
        graph,
      ),
    ).toEqual({ data: { field_reason: '事假' }, requiredKeys: ['field_reason'] });
  });
});

function dateRangeGraph(): WorkflowGraph {
  return {
    nodes: [
      { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
      { key: 'br1', type: 'branch', title: '按开始日期', x: 0, y: 1 },
      {
        key: 'n1',
        type: 'approve',
        title: '部门审批',
        x: 0,
        y: 2,
        approver: { userIds: [1], roleIds: [], memberFieldKeys: [] },
        signMode: 'any',
        commentRequiredOnApprove: false,
        fieldAccess: {},
      },
      {
        key: 'n2',
        type: 'approve',
        title: '人事备案',
        x: 0,
        y: 3,
        approver: { userIds: [2], roleIds: [], memberFieldKeys: [] },
        signMode: 'any',
        commentRequiredOnApprove: false,
        fieldAccess: {},
      },
      { key: 'end', type: 'end', title: '结束', x: 0, y: 4 },
    ],
    edges: [
      { key: 'e1', from: 'start', to: 'br1' },
      {
        key: 'e2',
        from: 'br1',
        to: 'n1',
        title: '本月',
        sort: 1,
        when: {
          logic: 'all',
          items: [
            {
              key: 'field_start',
              op: 'between',
              value: ['2026-09-01', '2026-09-30'],
            },
          ],
        },
      },
      { key: 'e3', from: 'br1', to: 'n2', sort: 2, isDefault: true },
      { key: 'e4', from: 'n1', to: 'end' },
      { key: 'e5', from: 'n2', to: 'end' },
    ],
  };
}

describe('workflow.graph 分支条件', () => {
  it('日期选择范围命中时走条件连线，不要落到其他情况', () => {
    expect(
      nextStay(dateRangeGraph(), 'start', { field_start: '2026-09-10' }),
    ).toMatchObject({ kind: 'approve', nodeKey: 'n1' });
  });

  it('日期选择范围两端也算命中', () => {
    expect(
      nextStay(dateRangeGraph(), 'start', { field_start: '2026-09-01' }),
    ).toMatchObject({ kind: 'approve', nodeKey: 'n1' });
    expect(
      nextStay(dateRangeGraph(), 'start', { field_start: '2026-09-30' }),
    ).toMatchObject({ kind: 'approve', nodeKey: 'n1' });
  });

  it('日期不在选择范围内走其他情况', () => {
    expect(
      nextStay(dateRangeGraph(), 'start', { field_start: '2026-08-31' }),
    ).toMatchObject({ kind: 'approve', nodeKey: 'n2' });
  });

  it('日期时间选择范围按入库的 Date 判断', () => {
    const when = {
      logic: 'all' as const,
      items: [
        {
          key: 'field_at',
          op: 'between',
          value: ['2026-09-01 00:00:00', '2026-09-30 23:59:59'],
        },
      ],
    };
    expect(
      matchEdgeCondition(when, { field_at: new Date(2026, 8, 10, 12, 0, 0) }),
    ).toBe(true);
    expect(
      matchEdgeCondition(when, { field_at: new Date(2026, 7, 31, 23, 59, 59) }),
    ).toBe(false);
  });

  it('开始日期等于结束日期按另一列的值比，不要拿字段 key 当字面量', () => {
    const when = {
      logic: 'all' as const,
      items: [
        {
          key: 'field_start',
          op: 'eq',
          value: 'field_end',
          valueType: 'field',
        },
      ],
    };
    expect(
      matchEdgeCondition(when, {
        field_start: '2026-09-10',
        field_end: '2026-09-10',
      }),
    ).toBe(true);
    expect(
      matchEdgeCondition(when, {
        field_start: '2026-09-10',
        field_end: '2026-09-11',
      }),
    ).toBe(false);
  });

  it('未开启流程超时时不限制办理时间', () => {
    expect(processTimeoutErrors(undefined)).toEqual([]);
    expect(resolveProcessDueAt(leaveGraph, new Date('2026-09-11T02:00:00'))).toBeNull();
  });

  it('有效时长按提交时间往后加', () => {
    const graph: WorkflowGraph = {
      ...leaveGraph,
      nodes: [
        {
          ...leaveGraph.nodes[0],
          type: 'start',
          processTimeout: {
            enabled: true,
            mode: 'duration',
            duration: 2,
            durationUnit: 'hour',
          },
        },
        ...leaveGraph.nodes.slice(1),
      ],
    };
    const started = new Date(2026, 8, 11, 10, 0, 0);
    expect(resolveProcessDueAt(graph, started)).toEqual(
      new Date(2026, 8, 11, 12, 0, 0),
    );
  });

  it('开启超时但没填截止时间不能启用', () => {
    const graph: WorkflowGraph = {
      ...leaveGraph,
      nodes: [
        {
          ...leaveGraph.nodes[0],
          type: 'start',
          processTimeout: { enabled: true, mode: 'absolute', absoluteAt: '' },
        },
        ...leaveGraph.nodes.slice(1),
      ],
    };
    expect(
      validatePublishedGraph(graph, fields).some((item) =>
        item.includes('截止时间'),
      ),
    ).toBe(true);
  });
});
