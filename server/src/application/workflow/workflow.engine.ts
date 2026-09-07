import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../user/user.entity';
import { AppForm } from '../app-form.entity';
import { FormRecordPersistService } from '../form-record/form-record.persist';
import { FormRecordStore } from '../form-record/form-record.store';
import { WorkflowApproverService } from './workflow.approver';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTask } from './workflow-task.entity';
import { nextStay } from './workflow.graph';
import {
  InstanceNote,
  RetryPatch,
  RetryStep,
  TaskAction,
  WorkflowGraph,
  WorkflowNode,
} from './workflow.types';

@Injectable()
export class WorkflowEngine {
  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowTask)
    private readonly taskRepo: Repository<WorkflowTask>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly persist: FormRecordPersistService,
    private readonly approver: WorkflowApproverService,
    private readonly definition: WorkflowDefinitionService,
    private readonly store: FormRecordStore,
  ) {}

  async ensureDraft(input: {
    form: AppForm;
    recordId: string;
    actorId: number;
  }): Promise<WorkflowInstance> {
    const existing = await this.instanceRepo.findOne({
      where: { formId: input.form.id, recordId: input.recordId },
    });
    if (existing) {
      if (existing.status === 'draft') {
        existing.updatedAt = new Date();
        return this.instanceRepo.save(existing);
      }
      return existing;
    }
    const runtime = await this.requirePublished(input.form.id);
    const created = await this.instanceRepo.save(
      this.instanceRepo.create({
        appId: input.form.applicationId,
        formId: input.form.id,
        recordId: input.recordId,
        definitionVersion: runtime.version,
        graph: runtime.graph,
        initiatorId: input.actorId,
        status: 'draft',
        currentNodeKey: null,
        visitedNodeKeys: [],
        hasApproved: false,
        round: 0,
        notes: [],
      }),
    );
    await this.store.setWorkflowMeta(input.form.id, input.recordId, {
      workflowStatus: 'draft',
      workflowInstanceId: created.id,
    });
    return created;
  }

  async submit(input: {
    form: AppForm;
    recordId: string;
    actorId: number;
  }): Promise<WorkflowInstance> {
    let instance = await this.instanceRepo.findOne({
      where: { formId: input.form.id, recordId: input.recordId },
    });
    if (!instance) {
      const runtime = await this.requirePublished(input.form.id);
      instance = await this.instanceRepo.save(
        this.instanceRepo.create({
          appId: input.form.applicationId,
          formId: input.form.id,
          recordId: input.recordId,
          definitionVersion: runtime.version,
          graph: runtime.graph,
          initiatorId: input.actorId,
          status: 'draft',
          currentNodeKey: null,
          visitedNodeKeys: [],
          hasApproved: false,
          round: 0,
          notes: [],
        }),
      );
    }
    const nextRound = instance.round + 1;
    const started = await this.instanceRepo.update(
      { id: instance.id, status: In(['draft', 'rejected', 'error']) },
      {
        status: 'running',
        round: nextRound,
        hasApproved: false,
        visitedNodeKeys: [],
        currentNodeKey: null,
        errorReason: null,
        retryStep: null,
        startedAt: new Date(),
        endedAt: null,
      },
    );
    if (!started.affected) {
      throw new ConflictException('当前状态不能提交');
    }
    instance.status = 'running';
    instance.round = nextRound;
    instance.hasApproved = false;
    instance.visitedNodeKeys = [];
    instance.currentNodeKey = null;
    instance.errorReason = null;
    instance.retryStep = null;
    return this.advance(instance, 'start');
  }

  async resubmitApproved(input: {
    form: AppForm;
    recordId: string;
    actorId: number;
  }): Promise<WorkflowInstance> {
    const instance = await this.instanceRepo.findOne({
      where: { formId: input.form.id, recordId: input.recordId },
    });
    if (!instance) {
      throw new BadRequestException('这条数据没有审批记录，不能重新提交');
    }
    const runtime = await this.requirePublished(input.form.id);
    const nextRound = instance.round + 1;
    const started = await this.instanceRepo.update(
      { id: instance.id, status: 'approved' },
      {
        status: 'running',
        graph: runtime.graph,
        definitionVersion: runtime.version,
        round: nextRound,
        hasApproved: false,
        visitedNodeKeys: [],
        currentNodeKey: null,
        errorReason: null,
        retryStep: null,
        startedAt: new Date(),
        endedAt: null,
      },
    );
    if (!started.affected) {
      throw new ConflictException('当前状态不能提交');
    }
    instance.status = 'running';
    instance.graph = runtime.graph;
    instance.definitionVersion = runtime.version;
    instance.round = nextRound;
    instance.hasApproved = false;
    instance.visitedNodeKeys = [];
    instance.currentNodeKey = null;
    return this.advance(instance, 'start');
  }

  async completeTask(input: {
    taskId: number;
    actorId: number;
    action: TaskAction;
    comment: string;
    dataPatch: RetryPatch;
  }): Promise<{ waitingOthers: boolean; nextNodeTitle?: string }> {
    const task = await this.taskRepo.findOne({ where: { id: input.taskId } });
    if (!task) throw new NotFoundException('待办不存在');
    const done = await this.taskRepo.update(
      { id: task.id, status: 'pending', assigneeId: input.actorId },
      {
        status: 'done',
        action: input.action,
        comment: input.comment,
        finishedAt: new Date(),
      },
    );
    if (!done.affected) throw new ConflictException('这条待办已处理');
    const instance = await this.requireInstance(task.instanceId);
    const node = findApproveNode(instance.graph, task.nodeKey);
    if (input.action === 'reject') {
      // 带 status 条件：发起人同时撤回时，只允许一边成功
      const rejected = await this.instanceRepo.update(
        { id: instance.id, status: 'running' },
        {
          status: 'rejected',
          currentNodeKey: null,
          endedAt: new Date(),
          retryStep: null,
        },
      );
      if (!rejected.affected) {
        throw new ConflictException('单据状态已变化，请刷新后再看');
      }
      await this.cancelPending(
        instance.id,
        task.nodeKey,
        node.signMode === 'all' ? '会签节点已驳回' : '或签其他人已驳回',
      );
      await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
        workflowStatus: 'rejected',
        workflowInstanceId: instance.id,
      });
      return { waitingOthers: false };
    }
    const claimed = await this.instanceRepo.update(
      { id: instance.id, status: 'running' },
      {
        retryStep: 'mongo',
        hasApproved: true,
        retryPatch: input.dataPatch,
        retryActorId: input.actorId,
      },
    );
    if (!claimed.affected) {
      throw new ConflictException('单据状态已变化，请刷新后再看');
    }
    await this.writeBack(instance, node, input.dataPatch, input.actorId);
    await this.instanceRepo.update(
      { id: instance.id },
      { retryStep: 'advance', retryPatch: null, retryActorId: null },
    );
    if (node.signMode === 'all') {
      const pending = await this.taskRepo.count({
        where: {
          instanceId: instance.id,
          nodeKey: task.nodeKey,
          round: instance.round,
          status: 'pending',
        },
      });
      if (pending > 0) {
        await this.instanceRepo.update({ id: instance.id }, { retryStep: null });
        return { waitingOthers: true };
      }
    } else {
      await this.cancelPending(instance.id, task.nodeKey, '或签其他人已通过');
    }
    const advanced = await this.advance(instance, task.nodeKey);
    return {
      waitingOthers: false,
      nextNodeTitle: titleOf(advanced.graph, advanced.currentNodeKey),
    };
  }

  async cancel(input: { instanceId: number; actorId: number }): Promise<void> {
    const cancelled = await this.instanceRepo.update(
      {
        id: input.instanceId,
        initiatorId: input.actorId,
        status: In(['running', 'error']),
        hasApproved: false,
      },
      {
        status: 'draft',
        currentNodeKey: null,
        retryStep: null,
        errorReason: null,
      },
    );
    if (!cancelled.affected) {
      throw new ConflictException('审批人已开始处理，不能撤回');
    }
    const instance = await this.requireInstance(input.instanceId);
    await this.taskRepo.update(
      { instanceId: instance.id, status: 'pending' },
      { status: 'cancelled', cancelReason: '发起人撤回' },
    );
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
      workflowStatus: 'draft',
      workflowInstanceId: instance.id,
    });
  }

  async retry(input: { instanceId: number }): Promise<void> {
    const instance = await this.requireInstance(input.instanceId);
    if (instance.status !== 'error') return;
    if (instance.retryStep === 'mongo') {
      const node = instance.currentNodeKey
        ? findApproveNode(instance.graph, instance.currentNodeKey)
        : null;
      if (node) {
        await this.writeBack(
          instance,
          node,
          instance.retryPatch ?? {},
          instance.retryActorId ?? instance.initiatorId,
        );
      }
      await this.instanceRepo.update(
        { id: instance.id, status: 'error' },
        { retryStep: 'advance', retryPatch: null, retryActorId: null },
      );
      await this.advance(instance, instance.currentNodeKey ?? 'start');
      return;
    }
    if (instance.retryStep === 'advance') {
      await this.advance(instance, instance.currentNodeKey ?? 'start');
      return;
    }
    // 待办没派出去（没人可派、审批人全停用、插待办失败）：重新解析当前节点，不能往下走
    const stuckNode = instance.currentNodeKey
      ? nodeOf(instance.graph, instance.currentNodeKey)
      : null;
    if (instance.retryStep === 'dispatch' && stuckNode?.type === 'approve') {
      await this.cancelDisabledPending(instance);
      await this.instanceRepo.update(
        { id: instance.id, status: 'error' },
        { status: 'running', errorReason: null, retryStep: null },
      );
      instance.status = 'running';
      const record = await this.store.findById(
        instance.formId,
        instance.recordId,
      );
      await this.dispatchApprove(
        instance,
        stuckNode.key,
        instance.visitedNodeKeys ?? [],
        record?.data ?? {},
      );
      return;
    }
    await this.advance(instance, instance.currentNodeKey ?? 'start');
  }

  async onRecordDeleted(formId: number, recordId: string): Promise<void> {
    const instance = await this.instanceRepo.findOne({
      where: { formId, recordId },
    });
    if (!instance || instance.status !== 'draft') return;
    await this.taskRepo.delete({ instanceId: instance.id });
    await this.instanceRepo.delete({ id: instance.id });
  }

  private async advance(
    instance: WorkflowInstance,
    fromNodeKey: string,
  ): Promise<WorkflowInstance> {
    const record = await this.store.findById(instance.formId, instance.recordId);
    const stay = nextStay(instance.graph, fromNodeKey, record?.data ?? {});
    if (stay.kind === 'error') {
      await this.markError(instance, stay.reason, stay.visited);
      return { ...instance, status: 'error', errorReason: stay.reason };
    }
    if (stay.kind === 'end') {
      const notes = stay.passedApprove
        ? instance.notes
        : appendNote(instance.notes, '未经过审批即结束');
      // 和推进到下一个审批节点一样要抢占：别人已驳回或发起人已撤回时不能改成已通过
      const ended = await this.instanceRepo.update(
        this.claimWhere(instance, fromNodeKey),
        {
          status: 'approved',
          currentNodeKey: null,
          endedAt: new Date(),
          visitedNodeKeys: stay.visited,
          retryStep: null,
          errorReason: null,
          notes,
        },
      );
      if (!ended.affected) return instance;
      await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
        workflowStatus: 'approved',
        workflowInstanceId: instance.id,
      });
      return {
        ...instance,
        status: 'approved',
        currentNodeKey: null,
        visitedNodeKeys: stay.visited,
        notes,
      };
    }
    const claimed = await this.instanceRepo.update(
      this.claimWhere(instance, fromNodeKey),
      {
        currentNodeKey: stay.nodeKey,
        visitedNodeKeys: stay.visited,
        status: 'running',
        retryStep: null,
        errorReason: null,
      },
    );
    if (!claimed.affected) {
      return instance;
    }
    instance.currentNodeKey = stay.nodeKey;
    instance.visitedNodeKeys = stay.visited;
    instance.status = 'running';
    return this.dispatchApprove(
      instance,
      stay.nodeKey,
      stay.visited,
      record?.data ?? {},
    );
  }

  // 解析审批人并派待办。派不出去一律进异常并记 retryStep='dispatch'，
  // 这样点【重试】会重新解析这个节点，而不是往下走把它跳过。
  private async dispatchApprove(
    instance: WorkflowInstance,
    nodeKey: string,
    visited: string[],
    data: Record<string, unknown>,
  ): Promise<WorkflowInstance> {
    const node = findApproveNode(instance.graph, nodeKey);
    const resolved = await this.approver.resolve({
      nodeTitle: node.title,
      approver: node.approver,
      initiatorId: instance.initiatorId,
      recordData: data,
    });
    if (!resolved.userIds.length) {
      const reason =
        resolved.emptyReason || `节点「${node.title}」没有可用的审批人`;
      await this.markError(instance, reason, visited, 'dispatch');
      return { ...instance, status: 'error', errorReason: reason };
    }
    try {
      await this.dispatchTasks(instance, nodeKey, resolved.userIds);
    } catch {
      const reason = `节点「${node.title}」派发待办失败，请重试`;
      await this.markError(instance, reason, visited, 'dispatch');
      return { ...instance, status: 'error', errorReason: reason };
    }
    let notes = instance.notes;
    if (resolved.unrestrictedByMissingDept) {
      notes = appendNote(
        notes,
        '发起人没有所属部门，本节点按角色全公司派发',
      );
      await this.instanceRepo.update({ id: instance.id }, { notes });
      instance.notes = notes;
    }
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
      workflowStatus: 'running',
      workflowInstanceId: instance.id,
    });
    return instance;
  }

  // 同一轮里给同一个人派两次会撞唯一约束，所以先把取消过的那条改回待处理，
  // 只插还没有的人。已经处理过的保持原样，重试不会让他再批一遍。
  private async dispatchTasks(
    instance: WorkflowInstance,
    nodeKey: string,
    userIds: number[],
  ) {
    const existing = await this.taskRepo.find({
      where: { instanceId: instance.id, nodeKey, round: instance.round },
    });
    const byAssignee = new Map(existing.map((row) => [row.assigneeId, row]));
    const toRevive = userIds.filter(
      (id) => byAssignee.get(id)?.status === 'cancelled',
    );
    const toInsert = userIds.filter((id) => !byAssignee.has(id));
    if (toRevive.length) {
      await this.taskRepo.update(
        {
          instanceId: instance.id,
          nodeKey,
          round: instance.round,
          assigneeId: In(toRevive),
        },
        {
          status: 'pending',
          action: null,
          comment: null,
          cancelReason: null,
          finishedAt: null,
        },
      );
    }
    if (toInsert.length) {
      await this.taskRepo.insert(
        toInsert.map((assigneeId) => ({
          instanceId: instance.id,
          nodeKey,
          round: instance.round,
          assigneeId,
          status: 'pending' as const,
        })),
      );
    }
  }

  private claimWhere(instance: WorkflowInstance, fromNodeKey: string) {
    return fromNodeKey === 'start'
      ? { id: instance.id, status: In(['running', 'error']) }
      : { id: instance.id, currentNodeKey: fromNodeKey, status: In(['running', 'error']) };
  }

  private async writeBack(
    instance: WorkflowInstance,
    node: Extract<WorkflowNode, { type: 'approve' }>,
    dataPatch: Record<string, unknown>,
    actorId: number,
  ) {
    const form =
      (await this.formRepo.findOne({ where: { id: instance.formId } })) ??
      ({ id: instance.formId } as AppForm);
    const requiredKeys = Object.entries(node.fieldAccess || {})
      .filter(([, access]) => access === 'editable')
      .map(([key]) => key);
    const data: Record<string, unknown> = {};
    for (const key of requiredKeys) {
      if (key in dataPatch) data[key] = dataPatch[key];
    }
    try {
      if (requiredKeys.length && Object.keys(data).length) {
        await this.persist.persist({
          form,
          actorId,
          recordId: instance.recordId,
          data,
          requiredKeys,
          skipSerial: true,
        });
      } else if (requiredKeys.length) {
        await this.persist.persist({
          form,
          actorId,
          recordId: instance.recordId,
          data: dataPatch,
          requiredKeys,
          skipSerial: true,
        });
      }
      await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
        workflowStatus: instance.status === 'error' ? 'running' : instance.status,
        workflowInstanceId: instance.id,
      });
    } catch (err) {
      await this.instanceRepo.update(
        { id: instance.id },
        {
          status: 'error',
          retryStep: 'mongo',
          errorReason: err instanceof Error ? err.message : '写回表单失败',
        },
      );
      throw err;
    }
  }

  private async cancelPending(
    instanceId: number,
    nodeKey: string,
    cancelReason: string,
  ) {
    await this.taskRepo.update(
      { instanceId, nodeKey, status: 'pending' },
      { status: 'cancelled', cancelReason },
    );
  }

  private async cancelDisabledPending(instance: WorkflowInstance) {
    const pending = await this.taskRepo.find({
      where: {
        instanceId: instance.id,
        nodeKey: instance.currentNodeKey ?? undefined,
        status: 'pending',
      },
    });
    if (!pending.length) return;
    const users = await this.userRepo.find({
      where: { id: In(pending.map((row) => row.assigneeId)) },
    });
    const disabled = new Set(
      users.filter((user) => user.status !== 'active').map((user) => user.id),
    );
    for (const task of pending) {
      if (!disabled.has(task.assigneeId)) continue;
      await this.taskRepo.update(
        { id: task.id, status: 'pending' },
        { status: 'cancelled', cancelReason: '审批人已停用' },
      );
    }
  }

  private async markError(
    instance: WorkflowInstance,
    reason: string,
    visited: string[],
    retryStep: RetryStep = null,
  ) {
    await this.instanceRepo.update(
      { id: instance.id },
      {
        status: 'error',
        errorReason: reason,
        visitedNodeKeys: visited,
        retryStep,
      },
    );
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
      workflowStatus: 'error',
      workflowInstanceId: instance.id,
    });
  }

  // 派出去之后审批人才被停用：这条单没人能批，转成异常，发起人和配置者才看得到【重试】。
  // 打开单据详情时顺带检查，本期没有定时任务。
  async markStuckByDisabledApprovers(
    instance: WorkflowInstance,
    tasks: WorkflowTask[],
    disabledIds: Set<number>,
  ): Promise<void> {
    if (instance.status !== 'running' || !instance.currentNodeKey) return;
    const pending = tasks.filter(
      (row) =>
        row.nodeKey === instance.currentNodeKey &&
        row.round === instance.round &&
        row.status === 'pending',
    );
    if (!pending.length) return;
    if (!pending.every((row) => disabledIds.has(row.assigneeId))) return;
    const reason = '审批人已停用，请重试重新派发审批人';
    const marked = await this.instanceRepo.update(
      { id: instance.id, status: 'running' },
      { status: 'error', errorReason: reason, retryStep: 'dispatch' },
    );
    if (!marked.affected) return;
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
      workflowStatus: 'error',
      workflowInstanceId: instance.id,
    });
    instance.status = 'error';
    instance.errorReason = reason;
    instance.retryStep = 'dispatch';
  }

  private async requireInstance(id: number) {
    const instance = await this.instanceRepo.findOne({ where: { id } });
    if (!instance) throw new NotFoundException('单据不存在');
    return instance;
  }

  private async requirePublished(formId: number) {
    const runtime = await this.definition.getRuntime(formId);
    if (!runtime.published || !runtime.graph) {
      throw new BadRequestException(
        '这张表单还没有配置流程，发布流程之后才能使用',
      );
    }
    return runtime;
  }
}

function findApproveNode(
  graph: WorkflowGraph,
  key: string,
): Extract<WorkflowNode, { type: 'approve' }> {
  const node = graph.nodes.find((item) => item.key === key);
  if (!node || node.type !== 'approve') {
    throw new NotFoundException('审批节点不存在');
  }
  return node;
}

function nodeOf(graph: WorkflowGraph, key: string): WorkflowNode | undefined {
  return graph.nodes.find((item) => item.key === key);
}

function titleOf(graph: WorkflowGraph, key: string | null): string | undefined {
  if (!key) return undefined;
  return graph.nodes.find((node) => node.key === key)?.title;
}

function appendNote(
  notes: InstanceNote[] | null | undefined,
  text: string,
): InstanceNote[] {
  return [...(notes || []), { at: new Date().toISOString(), text }];
}
