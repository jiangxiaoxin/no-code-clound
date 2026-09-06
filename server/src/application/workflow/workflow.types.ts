export type FieldAccess = 'editable' | 'readonly' | 'hidden';

export type ApproverRule = {
  userIds: number[];
  roleIds: number[];
  memberFieldKeys: string[];
  sameDeptAsInitiator?: boolean;
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
      fieldAccess: Record<string, FieldAccess>;
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

export type TaskStatus = 'pending' | 'done' | 'cancelled';

export type TaskAction = 'approve' | 'reject';

export type InstanceNote = { at: string; text: string };
