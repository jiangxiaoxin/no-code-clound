import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../admin/role/role.entity';
import { User } from '../../user/user.entity';
import { AppAccessService } from '../access/app-access.service';
import { AppForm } from '../app-form.entity';
import { parseFormSchema } from '../form-schema';
import { WorkflowDefinition } from './workflow-definition.entity';
import { WorkflowInstance } from './workflow-instance.entity';
import { validatePublishedGraph } from './workflow.graph';
import { WorkflowGraph, WorkflowNode } from './workflow.types';

export type WorkflowRuntime = {
  published: boolean;
  enabled: boolean;
  graph: WorkflowGraph | null;
  version: number;
};

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly defRepo: Repository<WorkflowDefinition>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly access: AppAccessService,
  ) {}

  async get(userId: number, appId: number, formId: number) {
    await this.access.requireConfigure(userId, appId);
    await this.requireWorkflowForm(appId, formId);
    const def = await this.defRepo.findOne({ where: { formId } });
    const runningCount = await this.instanceRepo.count({
      where: { formId, status: 'running' },
    });
    if (!def) {
      return {
        draftGraph: null,
        publishedGraph: null,
        publishedVersion: 0,
        enabled: false,
        runningCount,
      };
    }
    return {
      draftGraph: def.draftGraph,
      publishedGraph: def.publishedGraph,
      publishedVersion: def.publishedVersion,
      enabled: Boolean(def.enabled),
      runningCount,
    };
  }

  async saveDraft(
    userId: number,
    appId: number,
    formId: number,
    draftGraph: WorkflowGraph,
  ) {
    await this.access.requireConfigure(userId, appId);
    await this.requireWorkflowForm(appId, formId);
    const def = await this.ensureRow(appId, formId);
    def.draftGraph = draftGraph;
    await this.defRepo.save(def);
    return { ok: true };
  }

  async publish(userId: number, appId: number, formId: number) {
    await this.access.requireConfigure(userId, appId);
    const form = await this.requireWorkflowForm(appId, formId);
    const def = await this.ensureRow(appId, formId);
    const graph = def.draftGraph;
    if (!graph) {
      throw new BadRequestException(['请先保存流程草稿']);
    }
    const fields = parseFormSchema(form.fields).fields;
    const errors = [
      ...validatePublishedGraph(graph, fields),
      ...(await this.validateApproverTargets(graph)),
    ];
    if (errors.length) {
      throw new BadRequestException(errors);
    }
    def.publishedGraph = graph;
    def.publishedVersion = (def.publishedVersion || 0) + 1;
    def.enabled = true;
    def.publishedAt = new Date();
    return this.defRepo.save(def);
  }

  async setEnabled(
    userId: number,
    appId: number,
    formId: number,
    enabled: boolean,
  ) {
    await this.access.requireConfigure(userId, appId);
    await this.requireWorkflowForm(appId, formId);
    const def = await this.defRepo.findOne({ where: { formId } });
    if (!def || def.publishedVersion === 0) {
      if (enabled) throw new BadRequestException('请先发布流程');
      return { enabled: false };
    }
    def.enabled = enabled;
    await this.defRepo.save(def);
    return { enabled: Boolean(def.enabled) };
  }

  async getRuntime(formId: number): Promise<WorkflowRuntime> {
    const def = await this.defRepo.findOne({ where: { formId } });
    if (!def || !def.publishedVersion || !def.publishedGraph) {
      return { published: false, enabled: false, graph: null, version: 0 };
    }
    return {
      published: true,
      enabled: Boolean(def.enabled),
      graph: def.publishedGraph,
      version: def.publishedVersion,
    };
  }

  private async requireWorkflowForm(appId: number, formId: number) {
    const form = await this.formRepo.findOne({
      where: { id: formId, applicationId: appId },
    });
    if (!form) throw new NotFoundException('表单不存在');
    if (form.formKind !== 'workflow') {
      throw new BadRequestException('只有流程表单能配置流程');
    }
    return form;
  }

  private async ensureRow(appId: number, formId: number) {
    const existing = await this.defRepo.findOne({ where: { formId } });
    if (existing) return existing;
    return this.defRepo.create({
      appId,
      formId,
      enabled: false,
      draftGraph: null,
      publishedGraph: null,
      publishedVersion: 0,
      publishedAt: null,
    });
  }

  private async validateApproverTargets(graph: WorkflowGraph): Promise<string[]> {
    const errors: string[] = [];
    const userIds = new Set<number>();
    const roleIds = new Set<number>();
    const approves = graph.nodes.filter(
      (node): node is Extract<WorkflowNode, { type: 'approve' }> =>
        node.type === 'approve',
    );
    for (const node of approves) {
      for (const id of node.approver?.userIds || []) userIds.add(id);
      for (const id of node.approver?.roleIds || []) roleIds.add(id);
    }
    const users = userIds.size
      ? await this.userRepo.find({ where: { id: In([...userIds]) } })
      : [];
    const roles = roleIds.size
      ? await this.roleRepo.find({ where: { id: In([...roleIds]) } })
      : [];
    const userMap = new Map(users.map((row) => [row.id, row]));
    const roleMap = new Map(roles.map((row) => [row.id, row]));
    for (const node of approves) {
      for (const id of node.approver?.userIds || []) {
        const user = userMap.get(id);
        if (!user || user.status !== 'active') {
          errors.push(`节点「${node.title}」指定的审批人已停用或已删除`);
        }
      }
      for (const id of node.approver?.roleIds || []) {
        const role = roleMap.get(id);
        if (!role || role.status !== 'active') {
          errors.push(`节点「${node.title}」指定的角色已停用或已删除`);
        }
      }
    }
    return errors;
  }
}
