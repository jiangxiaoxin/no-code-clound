export type FieldAccess = 'editable' | 'readonly' | 'hidden';

export type ApproverRule = {
  userIds: number[];
  roleIds: number[];
  memberFieldKeys: string[];
  sameDeptAsInitiator?: boolean;
  deptLeaderOfInitiator?: boolean;
};

export type WorkflowNodeBase = {
  key: string;
  title: string;
  x: number;
  y: number;
};

export type WorkflowNode =
  | (WorkflowNodeBase & { type: 'start' | 'end' | 'branch' })
  | (WorkflowNodeBase & {
      type: 'approve';
      approver: ApproverRule;
      signMode: 'any' | 'all';
      commentRequiredOnApprove: boolean;
      commentRequiredOnReject?: boolean;
      fieldAccess: Record<string, FieldAccess>;
      briefFieldKeys?: string[];
    })
  | (WorkflowNodeBase & {
      type: 'cc';
      approver: ApproverRule;
      fieldAccess: Record<string, FieldAccess>;
      briefFieldKeys?: string[];
    });

export type WorkflowEdgeCondition = {
  logic: 'all' | 'any';
  items: { key: string; op: string; value?: unknown }[];
};

export type WorkflowEdge = {
  key: string;
  from: string;
  to: string;
  title?: string;
  sort?: number;
  isDefault?: boolean;
  when?: WorkflowEdgeCondition;
};

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

export type InstanceStatus =
  | 'draft'
  | 'running'
  | 'approved'
  | 'rejected'
  | 'error';

// 异常停在哪一步：dispatch 表示待办还没派出去，重试要重新解析当前节点的审批人
export type RetryStep = 'dispatch' | 'mongo' | 'advance' | null;

// 审批人通过时填的内容，写回失败后留着给重试补写。
// 值用 any 而不是 unknown：TypeORM 的 update 不接受 unknown 值的 json 列。
export interface RetryPatch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export type TaskStatus = 'pending' | 'done' | 'cancelled';

export type TaskAction = 'approve' | 'reject' | 'cc';

export type InstanceNote = { at: string; text: string };
