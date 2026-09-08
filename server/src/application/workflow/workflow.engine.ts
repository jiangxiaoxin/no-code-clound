import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type QueryDeepPartialEntity } from 'typeorm';
import { User } from '../../user/user.entity';
import { AppForm } from '../app-form.entity';
import { FormRecordPersistService } from '../form-record/form-record.persist';
import { FormRecordStore } from '../form-record/form-record.store';
import { WorkflowApproverService, type ResolvedApprovers } from './workflow.approver';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTask } from './workflow-task.entity';
import { nextStay, resolvePreviousApproveNodeKey } from './workflow.graph';
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
    await this.cancelAllPending(instance.id, '发起人再次提交');
    instance.status = 'running';
    instance.round = nextRound;
    instance.hasApproved = false;
    instance.visitedNodeKeys = [];
    instance.currentNodeKey = null;
    instance.errorReason = null;
    instance.retryStep = null;
    await this.recordSubmit(instance, nextRound);
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
      } as QueryDeepPartialEntity<WorkflowInstance>,
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
    await this.recordSubmit(instance, nextRound);
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
        currentNodeKey: 'start',
        visitedNodeKeys: [],
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
        // 会签：写回不等于节点完成。还有人没批就回到审批中等他，不能直接推进
        if (node.signMode === 'all') {
          const pending = await this.taskRepo.count({
            where: {
              instanceId: instance.id,
              nodeKey: node.key,
              round: instance.round,
              status: 'pending',
            },
          });
          if (pending > 0) {
            await this.instanceRepo.update(
              { id: instance.id, status: 'error' },
              {
                status: 'running',
                errorReason: null,
                retryStep: null,
                retryPatch: null,
                retryActorId: null,
              },
            );
            return;
          }
        }
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
      const record = await this.store.findById(
        instance.formId,
        instance.recordId,
      );
      const data = record?.data ?? {};
      const resolved = await this.approver.resolve({
        nodeTitle: stuckNode.title,
        approver: stuckNode.approver,
        initiatorId: instance.initiatorId,
        recordData: data,
      });
      if (!resolved.userIds.length) {
        // 解析不到人：保持异常态并写清原因，不能翻回审批中变成没人有待办
        await this.instanceRepo.update(
          { id: instance.id, status: 'error' },
          {
            status: 'error',
            errorReason:
              resolved.emptyReason || `节点「${stuckNode.title}」没有可用的审批人`,
            retryStep: 'dispatch',
          },
        );
        return;
      }
      const existing = await this.taskRepo.find({
        where: {
          instanceId: instance.id,
          nodeKey: stuckNode.key,
          round: instance.round,
        },
      });
      // 这一轮重试必须真的派得出待办，否则翻回审批中会变成零待办死单
      const byAssignee = new Map(existing.map((row) => [row.assigneeId, row]));
      const willHavePending =
        existing.some((row) => row.status === 'pending') ||
        resolved.userIds.some((id) => {
          const row = byAssignee.get(id);
          return !row || row.status === 'cancelled';
        });
      if (!willHavePending) {
        await this.instanceRepo.update(
          { id: instance.id, status: 'error' },
          {
            status: 'error',
            errorReason: `节点「${stuckNode.title}」这一轮解析出的审批人都已通过，重试派不出新的待办；如果是会签节点，请先恢复被停用成员的账号再点【重试】`,
            retryStep: 'dispatch',
          },
        );
        return;
      }
      // 带状态条件翻转：发起人恰好撤回时这里落空，不能给已撤回的单派待办
      const resumed = await this.instanceRepo.update(
        { id: instance.id, status: 'error' },
        { status: 'running', errorReason: null, retryStep: null },
      );
      if (!resumed.affected) {
        return;
      }
      instance.status = 'running';
      await this.dispatchApprove(
        instance,
        stuckNode.key,
        instance.visitedNodeKeys ?? [],
        data,
        resolved,
        existing,
      );
      // 派发期间单据可能又被撤回：撤掉刚派的待办，Mongo 跟数据库实际状态对齐
      const after = await this.instanceRepo.findOne({
        where: { id: instance.id },
      });
      if (after && after.status === 'running') {
        return;
      }
      await this.taskRepo.update(
        {
          instanceId: instance.id,
          nodeKey: stuckNode.key,
          round: instance.round,
          status: 'pending',
        },
        { status: 'cancelled', cancelReason: '单据状态已变化，待办自动撤回' },
      );
      if (after) {
        await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
          workflowStatus: after.status,
          workflowInstanceId: instance.id,
        });
      }
      return;
    }
    await this.advance(instance, instance.currentNodeKey ?? 'start');
  }

  async onRecordDeleted(formId: number, recordId: string): Promise<void> {
    const instance = await this.instanceRepo.findOne({
      where: { formId, recordId },
    });
    if (!instance) return;
    // 草稿和异常单跟着数据一起删：异常单残留会让重试给已删数据派真待办，
    // 审批人一处理就报「记录不存在」再进异常，无限循环。已通过、已驳回保留实例看进度。
    if (instance.status !== 'draft' && instance.status !== 'error') return;
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
    await this.dispatchCarbonCopies(
      instance,
      stay.ccNodeKeys,
      record?.data ?? {},
    );
    if (stay.kind === 'end') {
      const notes = stay.passedApprove
        ? instance.notes
        : appendNote(instance.notes, '未经过审批即结束');
      const visitedNodeKeys = [
        ...new Set([
          ...(instance.visitedNodeKeys ?? []),
          ...stay.visited,
          stay.endNodeKey,
        ]),
      ];
      // 和推进到下一个审批节点一样要抢占：别人已驳回或发起人已撤回时不能改成已通过
      const ended = await this.instanceRepo.update(
        this.claimWhere(instance, fromNodeKey),
        {
          status: 'approved',
          currentNodeKey: stay.endNodeKey,
          endedAt: new Date(),
          visitedNodeKeys,
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
        currentNodeKey: stay.endNodeKey,
        visitedNodeKeys,
        notes,
      };
    }
    const claimed = await this.instanceRepo.update(
      this.claimWhere(instance, fromNodeKey),
      {
        currentNodeKey: stay.nodeKey,
        visitedNodeKeys: [
          ...new Set([
            ...(instance.visitedNodeKeys ?? []),
            ...stay.visited,
          ]),
        ],
        status: 'running',
        retryStep: null,
        errorReason: null,
      },
    );
    if (!claimed.affected) {
      return instance;
    }
    instance.currentNodeKey = stay.nodeKey;
    instance.visitedNodeKeys = [
      ...new Set([...(instance.visitedNodeKeys ?? []), ...stay.visited]),
    ];
    instance.status = 'running';
    return this.dispatchApprove(
      instance,
      stay.nodeKey,
      stay.visited,
      record?.data ?? {},
    );
  }

  private async dispatchCarbonCopies(
    instance: WorkflowInstance,
    ccNodeKeys: string[],
    data: Record<string, unknown>,
  ) {
    const unique = [...new Set(ccNodeKeys)];
    let notes = instance.notes;
    for (const nodeKey of unique) {
      const node = nodeOf(instance.graph, nodeKey);
      if (!node || node.type !== 'cc') continue;
      const resolved = await this.approver.resolve({
        nodeTitle: node.title,
        approver: node.approver || {
          userIds: [],
          roleIds: [],
          memberFieldKeys: [],
        },
        initiatorId: instance.initiatorId,
        recordData: data,
      });
      if (!resolved.userIds.length) {
        const text = `节点「${node.title || node.key}」没有可抄送的人`;
        if (!(notes || []).some((row) => row.text === text)) {
          notes = appendNote(notes, text);
        }
        continue;
      }
      const existing = await this.taskRepo.find({
        where: { instanceId: instance.id, nodeKey, round: instance.round },
      });
      const have = new Set(existing.map((row) => row.assigneeId));
      const toInsert = resolved.userIds.filter((id) => !have.has(id));
      if (toInsert.length) {
        await this.taskRepo.insert(
          toInsert.map((assigneeId) => ({
            instanceId: instance.id,
            nodeKey,
            round: instance.round,
            assigneeId,
            status: 'done' as const,
            action: 'cc' as const,
            comment: null,
            finishedAt: new Date(),
          })),
        );
      }
    }
    if (notes !== instance.notes) {
      await this.instanceRepo.update({ id: instance.id }, { notes });
      instance.notes = notes;
    }
  }

  // 解析审批人并派待办。派不出去一律进异常并记 retryStep='dispatch'，
  // 这样点【重试】会重新解析这个节点，而不是往下走把它跳过。
  private async dispatchApprove(
    instance: WorkflowInstance,
    nodeKey: string,
    visited: string[],
    data: Record<string, unknown>,
    preResolved?: ResolvedApprovers,
    existingTasks?: WorkflowTask[],
  ): Promise<WorkflowInstance> {
    const node = findApproveNode(instance.graph, nodeKey);
    const resolved =
      preResolved ??
      (await this.approver.resolve({
        nodeTitle: node.title,
        approver: node.approver,
        initiatorId: instance.initiatorId,
        recordData: data,
      }));
    if (!resolved.userIds.length) {
      const reason =
        resolved.emptyReason || `节点「${node.title}」没有可用的审批人`;
      await this.markError(instance, reason, visited, 'dispatch');
      return { ...instance, status: 'error', errorReason: reason };
    }
    try {
      await this.dispatchTasks(instance, nodeKey, resolved.userIds, existingTasks);
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
  private async recordSubmit(instance: WorkflowInstance, round: number) {
    await this.taskRepo.insert({
      instanceId: instance.id,
      nodeKey: 'start',
      round,
      assigneeId: instance.initiatorId,
      status: 'done',
      action: 'submit',
      finishedAt: new Date(),
    });
  }

  private async dispatchTasks(
    instance: WorkflowInstance,
    nodeKey: string,
    userIds: number[],
    existingTasks?: WorkflowTask[],
  ) {
    const existing =
      existingTasks ??
      (await this.taskRepo.find({
        where: { instanceId: instance.id, nodeKey, round: instance.round },
      }));
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
    dataPatch: RetryPatch,
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
      // 写库失败的这单把补丁槽位占回来：并发下槽位可能已被别人的推进清掉或覆盖，
      // 不占回来重试就补写不出他改的内容
      await this.instanceRepo.update(
        { id: instance.id, status: In(['running', 'error']) },
        {
          status: 'error',
          retryStep: 'mongo',
          retryPatch: dataPatch,
          retryActorId: actorId,
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

  async transfer(input: {
    taskId: number;
    actorId: number;
    assigneeId: number;
    comment: string;
  }): Promise<void> {
    if (input.assigneeId === input.actorId) {
      throw new BadRequestException('不能转交给自己');
    }
    const { task, instance, node } = await this.requirePendingApprove(
      input.taskId,
      input.actorId,
    );
    if (!node.allowTransfer) {
      throw new BadRequestException('该节点未开启转交');
    }
    const users = await this.userRepo.find({
      where: { id: In([input.assigneeId]) },
    });
    const user = users[0];
    if (!user) throw new NotFoundException('人员不存在');
    if (user.status !== 'active') {
      throw new BadRequestException('账号已停用');
    }
    const existing = await this.taskRepo.find({
      where: {
        instanceId: instance.id,
        nodeKey: task.nodeKey,
        round: instance.round,
        assigneeId: input.assigneeId,
      },
    });
    if (existing.some((row) => row.status === 'pending')) {
      throw new BadRequestException('该用户已有待办');
    }
    const done = await this.taskRepo.update(
      { id: task.id, status: 'pending', assigneeId: input.actorId },
      {
        status: 'done',
        action: 'transfer',
        comment: input.comment || null,
        finishedAt: new Date(),
      },
    );
    if (!done.affected) throw new ConflictException('这条待办已处理');
    await this.dispatchTasks(instance, task.nodeKey, [input.assigneeId]);
  }

  async addSign(input: {
    taskId: number;
    actorId: number;
    assigneeIds: number[];
    comment: string;
  }): Promise<void> {
    const { task, instance, node } = await this.requirePendingApprove(
      input.taskId,
      input.actorId,
    );
    if (!node.allowAddSign) {
      throw new BadRequestException('该节点未开启加签');
    }
    const unique = [
      ...new Set(
        (input.assigneeIds || []).filter(
          (id) => Number.isInteger(id) && id > 0 && id !== input.actorId,
        ),
      ),
    ];
    if (!unique.length) throw new BadRequestException('请选择加签人员');
    const users = await this.userRepo.find({
      where: { id: In(unique), status: 'active' },
    });
    const activeIds = users.map((row) => row.id);
    if (!activeIds.length) throw new BadRequestException('请选择加签人员');
    const existing = await this.taskRepo.find({
      where: {
        instanceId: instance.id,
        nodeKey: task.nodeKey,
        round: instance.round,
      },
    });
    const pendingIds = new Set(
      existing
        .filter((row) => row.status === 'pending')
        .map((row) => row.assigneeId),
    );
    const toDispatch = activeIds.filter((id) => !pendingIds.has(id));
    if (!toDispatch.length) {
      throw new BadRequestException('所选人员已有待办');
    }
    const still = await this.taskRepo.findOne({
      where: { id: task.id, status: 'pending', assigneeId: input.actorId },
    });
    if (!still) throw new ConflictException('这条待办已处理');
    await this.dispatchTasks(instance, task.nodeKey, toDispatch);
    const names = toDispatch.join('、');
    const extra = input.comment?.trim() ? `：${input.comment.trim()}` : '';
    const notes = appendNote(instance.notes, `${input.actorId} 加签 ${names}${extra}`);
    await this.instanceRepo.update({ id: instance.id }, { notes });
  }

  async returnTo(input: {
    taskId: number;
    actorId: number;
    target: 'previous' | 'start';
    comment: string;
  }): Promise<void> {
    const comment = String(input.comment || '').trim();
    if (!comment) throw new BadRequestException('请填写退回意见');
    const { task, instance } = await this.requirePendingApprove(
      input.taskId,
      input.actorId,
    );
    const roundTasks = await this.taskRepo.find({
      where: { instanceId: instance.id },
      order: { createdAt: 'ASC' },
    });
    const prevKey =
      input.target === 'previous'
        ? resolvePreviousApproveNodeKey(
            instance.graph,
            instance.visitedNodeKeys,
            task.nodeKey,
            roundTasks,
            task.round,
          )
        : null;
    if (input.target === 'previous' && !prevKey) {
      throw new BadRequestException('没有上一审批节点');
    }
    const done = await this.taskRepo.update(
      { id: task.id, status: 'pending', assigneeId: input.actorId },
      {
        status: 'done',
        action: input.target === 'previous' ? 'returnPrevious' : 'returnStart',
        comment,
        finishedAt: new Date(),
      },
    );
    if (!done.affected) throw new ConflictException('这条待办已处理');
    const prevTitle =
      prevKey && nodeOf(instance.graph, prevKey)?.title
        ? nodeOf(instance.graph, prevKey)!.title
        : '';
    const cancelReason =
      input.target === 'previous'
        ? `退回至「${prevTitle}」`
        : '退回至发起人';
    await this.taskRepo.update(
      { instanceId: instance.id, status: 'pending' },
      { status: 'cancelled', cancelReason },
    );
    const nextRound = instance.round + 1;
    if (input.target === 'previous' && prevKey) {
      const prevNode = findApproveNode(instance.graph, prevKey);
      const visited = truncateVisited(instance.visitedNodeKeys, prevKey);
      const previousRound = instance.round;
      const approved = await this.taskRepo.find({
        where: {
          instanceId: instance.id,
          nodeKey: prevKey,
          round: previousRound,
          status: 'done',
          action: 'approve',
        },
      });
      const candidateIds = [...new Set(approved.map((row) => row.assigneeId))];
      const active = candidateIds.length
        ? (
            await this.userRepo.find({
              where: { id: In(candidateIds), status: 'active' },
            })
          ).map((row) => row.id)
        : [];
      if (!active.length) {
        await this.instanceRepo.update(
          { id: instance.id, status: 'running' },
          {
            status: 'error',
            currentNodeKey: prevKey,
            visitedNodeKeys: visited,
            round: nextRound,
            retryStep: 'dispatch',
            errorReason: `退回后节点「${prevNode.title}」没有可用的审批人`,
          },
        );
        await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
          workflowStatus: 'error',
          workflowInstanceId: instance.id,
        });
        return;
      }
      const claimed = await this.instanceRepo.update(
        { id: instance.id, status: 'running' },
        {
          currentNodeKey: prevKey,
          visitedNodeKeys: visited,
          round: nextRound,
          retryStep: null,
          errorReason: null,
        },
      );
      if (!claimed.affected) {
        throw new ConflictException('单据状态已变化，请刷新后再看');
      }
      instance.round = nextRound;
      instance.currentNodeKey = prevKey;
      await this.dispatchTasks(instance, prevKey, active);
      await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
        workflowStatus: 'running',
        workflowInstanceId: instance.id,
      });
      return;
    }
    const claimed = await this.instanceRepo.update(
      { id: instance.id, status: 'running' },
      {
        currentNodeKey: 'start',
        visitedNodeKeys: ['start'],
        round: nextRound,
        retryStep: null,
        errorReason: null,
      },
    );
    if (!claimed.affected) {
      throw new ConflictException('单据状态已变化，请刷新后再看');
    }
    await this.taskRepo.insert({
      instanceId: instance.id,
      nodeKey: 'start',
      round: nextRound,
      assigneeId: instance.initiatorId,
      status: 'pending',
    });
    await this.store.setWorkflowMeta(instance.formId, instance.recordId, {
      workflowStatus: 'running',
      workflowInstanceId: instance.id,
    });
  }

  async resubmitStart(input: { taskId: number; actorId: number }): Promise<{
    nextNodeTitle?: string;
  }> {
    const task = await this.taskRepo.findOne({ where: { id: input.taskId } });
    if (!task) throw new NotFoundException('待办不存在');
    if (task.nodeKey !== 'start') {
      throw new BadRequestException('不是发起人待办');
    }
    const instance = await this.requireInstance(task.instanceId);
    if (instance.status !== 'running') {
      throw new ConflictException('单据状态已变化，请刷新后再看');
    }
    if (instance.initiatorId !== input.actorId) {
      throw new NotFoundException('待办不存在');
    }
    const done = await this.taskRepo.update(
      { id: task.id, status: 'pending', assigneeId: input.actorId },
      {
        status: 'done',
        action: 'resubmit',
        finishedAt: new Date(),
      },
    );
    if (!done.affected) throw new ConflictException('这条待办已处理');
    const advanced = await this.advance(instance, 'start');
    return { nextNodeTitle: titleOf(advanced.graph, advanced.currentNodeKey) };
  }

  private async requirePendingApprove(taskId: number, actorId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('待办不存在');
    const instance = await this.requireInstance(task.instanceId);
    if (instance.status !== 'running') {
      throw new ConflictException('单据状态已变化，请刷新后再看');
    }
    const node = findApproveNode(instance.graph, task.nodeKey);
    if (task.status !== 'pending' || task.assigneeId !== actorId) {
      throw new ConflictException('这条待办已处理');
    }
    return { task, instance, node };
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

  private async requirePublished(formId: number): Promise<{
    hasBeenEnabled: boolean;
    enabled: boolean;
    graph: WorkflowGraph;
    version: number;
  }> {
    const runtime = await this.definition.getRuntime(formId);
    if (!runtime.hasBeenEnabled || !runtime.graph) {
      throw new BadRequestException(
        '这张表单还没有配置流程，启用流程之后才能使用',
      );
    }
    return { ...runtime, graph: runtime.graph };
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

function truncateVisited(
  visited: string[] | null | undefined,
  keepThrough: string,
): string[] {
  const keys = visited || [];
  const index = keys.lastIndexOf(keepThrough);
  return index >= 0 ? keys.slice(0, index + 1) : [keepThrough];
}
