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
    await this.cancelAllPending(instance.id, '发起人再次提交');
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
    await this.cancelAllPending(instance.id, '发起人再次提交');
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
    dataPatch: Record<string, unknown>;
  }): Promise<{ waitingOthers: boolean; nextNodeTitle?: string }> {
    const task = await this.taskRepo.findOne({ where: { id: input.taskId } });
    if (!task) throw new NotFoundException('待办不存在');
    const instance = await this.requireInstance(task.instanceId);
    if (
      instance.status !== 'running' ||
      task.round !== instance.round ||
      instance.currentNodeKey !== task.nodeKey
    ) {
      throw new ConflictException('这条待办已处理');
    }
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
    const node = findApproveNode(instance.graph, task.nodeKey);
    if (input.action === 'reject') {
      await this.cancelPending(
        instance.id,
        task.nodeKey,
        node.signMode === 'all' ? '会签节点已驳回' : '或签其他人已驳回',
      );
      const rejected = await this.instanceRepo.update(
        {
          id: instance.id,
          status: 'running',
          currentNodeKey: task.nodeKey,
          round: instance.round,
        },
        {
          status: 'rejected',
          currentNodeKey: null,
          endedAt: new Date(),
          retryStep: null,
        },
      );
      if (!rejected.affected) throw new ConflictException('这条待办已处理');
      await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
        workflowStatus: 'rejected',
        workflowInstanceId: instance.id,
      });
      return { waitingOthers: false };
    }
    await this.instanceRepo.update(
      { id: instance.id },
      { retryStep: 'mongo', hasApproved: true },
    );
    await this.writeBack(instance, node, input.dataPatch, input.actorId);
    await this.instanceRepo.update({ id: instance.id }, { retryStep: 'advance' });
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
        await this.writeBack(instance, node, {}, instance.initiatorId);
      }
      await this.instanceRepo.update(
        { id: instance.id, status: 'error' },
        { retryStep: 'advance' },
      );
      await this.advance(instance, instance.currentNodeKey ?? 'start');
      return;
    }
    if (instance.retryStep === 'advance') {
      await this.advance(instance, instance.currentNodeKey ?? 'start');
      return;
    }
    if (instance.currentNodeKey) {
      await this.cancelDisabledPending(instance);
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
      await this.instanceRepo.update(
        { id: instance.id },
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
    const where =
      fromNodeKey === 'start'
        ? { id: instance.id }
        : { id: instance.id, currentNodeKey: fromNodeKey };
    const claimed = await this.instanceRepo.update(where, {
      currentNodeKey: stay.nodeKey,
      visitedNodeKeys: stay.visited,
      status: 'running',
      retryStep: null,
      errorReason: null,
    });
    if (fromNodeKey !== 'start' && !claimed.affected) {
      return instance;
    }
    instance.currentNodeKey = stay.nodeKey;
    instance.visitedNodeKeys = stay.visited;
    instance.status = 'running';
    const node = findApproveNode(instance.graph, stay.nodeKey);
    const resolved = await this.approver.resolve({
      nodeTitle: node.title,
      approver: node.approver,
      initiatorId: instance.initiatorId,
      recordData: record?.data ?? {},
    });
    if (!resolved.userIds.length) {
      await this.markError(
        instance,
        resolved.emptyReason || `节点「${node.title}」没有可用的审批人`,
        stay.visited,
      );
      return {
        ...instance,
        status: 'error',
        errorReason: resolved.emptyReason || `节点「${node.title}」没有可用的审批人`,
      };
    }
    await this.taskRepo.insert(
      resolved.userIds.map((assigneeId) => ({
        instanceId: instance.id,
        nodeKey: stay.nodeKey,
        round: instance.round,
        assigneeId,
        status: 'pending' as const,
      })),
    );
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

  private async cancelAllPending(instanceId: number, cancelReason: string) {
    await this.taskRepo.update(
      { instanceId, status: 'pending' },
      { status: 'cancelled', cancelReason },
    );
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
  ) {
    await this.instanceRepo.update(
      { id: instance.id },
      {
        status: 'error',
        errorReason: reason,
        visitedNodeKeys: visited,
        retryStep: null,
      },
    );
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
      workflowStatus: 'error',
      workflowInstanceId: instance.id,
    });
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
