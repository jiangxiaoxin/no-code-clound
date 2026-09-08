import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppAccessService } from '../access/app-access.service';
import { AppForm } from '../app-form.entity';
import { FormRecordPersistService } from '../form-record/form-record.persist';
import { AddSignTaskDto } from './dto/add-sign-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { ReturnTaskDto } from './dto/return-task.dto';
import { TransferTaskDto } from './dto/transfer-task.dto';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTask } from './workflow-task.entity';
import { allowResubmitAfterTerminated } from './workflow.graph';
import { InstanceStatus } from './workflow.types';

const EDITABLE: InstanceStatus[] = ['draft', 'rejected', 'error'];

@Injectable()
export class WorkflowInstanceService {
  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowTask)
    private readonly taskRepo: Repository<WorkflowTask>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    private readonly persist: FormRecordPersistService,
    private readonly engine: WorkflowEngine,
    private readonly access: AppAccessService,
    private readonly definition: WorkflowDefinitionService,
  ) {}

  async saveDraft(
    instanceId: number,
    actorId: number,
    data: Record<string, unknown>,
  ) {
    const instance = await this.requireInitiator(instanceId, actorId, EDITABLE);
    await this.assertTerminatedEditable(instance);
    const form = await this.requireForm(instance.formId);
    await this.persist.persist({
      form,
      actorId,
      recordId: instance.recordId,
      data,
      requiredKeys: 'all',
    });
    await this.engine.ensureDraft({
      form,
      recordId: instance.recordId,
      actorId,
    });
  }

  async submit(
    instanceId: number,
    actorId: number,
    data: Record<string, unknown>,
  ) {
    const instance = await this.requireInitiator(instanceId, actorId, EDITABLE);
    await this.assertTerminatedEditable(instance);
    const form = await this.requireForm(instance.formId);
    await this.persist.persist({
      form,
      actorId,
      recordId: instance.recordId,
      data,
      requiredKeys: 'all',
    });
    const updated = await this.engine.submit({
      form,
      recordId: instance.recordId,
      actorId,
    });
    return {
      nextNodeTitle: updated.graph.nodes.find(
        (node) => node.key === updated.currentNodeKey,
      )?.title,
    };
  }

  async cancel(instanceId: number, actorId: number) {
    await this.requireInitiator(instanceId, actorId, ['running', 'error']);
    await this.engine.cancel({ instanceId, actorId });
  }

  async retry(instanceId: number, actorId: number) {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
    });
    if (!instance) throw new NotFoundException('单据不存在');
    if (instance.initiatorId === actorId) {
      await this.engine.retry({ instanceId });
      return;
    }
    const access = await this.access.getAccess(actorId, instance.appId);
    if (!access.canConfigure) throw new NotFoundException('单据不存在');
    await this.engine.retry({ instanceId });
  }

  async complete(taskId: number, actorId: number, dto: CompleteTaskDto) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('待办不存在');
    const instance = await this.instanceRepo.findOne({
      where: { id: task.instanceId },
    });
    if (!instance) throw new NotFoundException('单据不存在');
    const node = instance.graph.nodes.find((item) => item.key === task.nodeKey);
    if (task.nodeKey === 'start' || !node || node.type !== 'approve') {
      throw new NotFoundException('审批节点不存在');
    }
    const comment = String(dto.comment || '').trim();
    if (dto.action === 'reject' && node.commentRequiredOnReject !== false && !comment) {
      throw new BadRequestException('请填写驳回意见');
    }
    if (dto.action === 'approve' && node.commentRequiredOnApprove && !comment) {
      throw new BadRequestException('请填写审批意见');
    }
    const dataPatch: Record<string, unknown> = {};
    const incoming = dto.data || {};
    for (const [key, access] of Object.entries(node.fieldAccess || {})) {
      if (access === 'editable' && key in incoming) {
        dataPatch[key] = incoming[key];
      }
    }
    return this.engine.completeTask({
      taskId,
      actorId,
      action: dto.action,
      comment,
      dataPatch,
    });
  }

  async transfer(taskId: number, actorId: number, dto: TransferTaskDto) {
    await this.engine.transfer({
      taskId,
      actorId,
      assigneeId: dto.assigneeId,
      comment: dto.comment || '',
    });
  }

  async addSign(taskId: number, actorId: number, dto: AddSignTaskDto) {
    await this.engine.addSign({
      taskId,
      actorId,
      assigneeIds: dto.assigneeIds || [],
      comment: dto.comment || '',
    });
  }

  async returnPrevious(taskId: number, actorId: number, dto: ReturnTaskDto) {
    await this.engine.returnTo({
      taskId,
      actorId,
      target: 'previous',
      comment: dto.comment,
    });
  }

  async returnStart(taskId: number, actorId: number, dto: ReturnTaskDto) {
    await this.engine.returnTo({
      taskId,
      actorId,
      target: 'start',
      comment: dto.comment,
    });
  }

  async resubmit(
    taskId: number,
    actorId: number,
    data: Record<string, unknown>,
  ) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('待办不存在');
    if (task.nodeKey !== 'start') {
      throw new BadRequestException('不是发起人待办');
    }
    const instance = await this.instanceRepo.findOne({
      where: { id: task.instanceId },
    });
    if (!instance || instance.initiatorId !== actorId) {
      throw new NotFoundException('单据不存在');
    }
    const form = await this.requireForm(instance.formId);
    await this.persist.persist({
      form,
      actorId,
      recordId: instance.recordId,
      data,
      requiredKeys: 'all',
    });
    return this.engine.resubmitStart({ taskId, actorId });
  }

  private async requireInitiator(
    instanceId: number,
    actorId: number,
    allowed: InstanceStatus[],
  ) {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
    });
    if (!instance || instance.initiatorId !== actorId) {
      throw new NotFoundException('单据不存在');
    }
    if (!allowed.includes(instance.status)) {
      throw new BadRequestException('当前状态不能修改');
    }
    return instance;
  }

  private async assertTerminatedEditable(instance: WorkflowInstance) {
    if (instance.status !== 'rejected' && instance.status !== 'approved') {
      return;
    }
    const runtime = await this.definition.getRuntime(instance.formId);
    if (!allowResubmitAfterTerminated(runtime.graph)) {
      throw new BadRequestException('流程终止后不能修改');
    }
  }

  private async requireForm(formId: number) {
    const form = await this.formRepo.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('表单不存在');
    return form;
  }
}
