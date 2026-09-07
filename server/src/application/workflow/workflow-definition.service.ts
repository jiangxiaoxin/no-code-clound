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
import { WorkflowVersion } from './workflow-version.entity';
import { validatePublishedGraph } from './workflow.graph';
import { WorkflowGraph, WorkflowNode } from './workflow.types';

export type WorkflowRuntime = {
  hasBeenEnabled: boolean;
  enabled: boolean;
  graph: WorkflowGraph | null;
  version: number;
};

function emptyStartGraph(): WorkflowGraph {
  return {
    nodes: [{ key: 'start', type: 'start', title: '开始', x: 240, y: 40 }],
    edges: [],
  };
}

function versionTitle(version: number) {
  return `流程版本 (V${version})`;
}

function sortVersions<T extends { enabled?: boolean; version: number }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.enabled) !== Boolean(b.enabled)) return a.enabled ? -1 : 1;
    return b.version - a.version;
  });
}

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly defRepo: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowVersion)
    private readonly versionRepo: Repository<WorkflowVersion>,
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
    const def = await this.ensureRow(appId, formId);
    let versions = await this.versionRepo.find({ where: { formId } });
    if (!versions.length) {
      const created = this.versionRepo.create({
        appId,
        formId,
        version: 1,
        graph: emptyStartGraph(),
        enabled: false,
      });
      const saved = await this.versionRepo.save(created);
      versions = [saved];
    }
    const sorted = sortVersions(versions);
    const enabled = sorted.find((row) => row.enabled);
    const runningCount = await this.instanceRepo.count({
      where: { formId, status: 'running' },
    });
    return {
      versions: sorted.map((row) => ({
        id: row.id,
        version: row.version,
        enabled: Boolean(row.enabled),
        title: versionTitle(row.version),
        graph: row.graph,
      })),
      viewingVersionId: enabled?.id ?? sorted[0].id,
      runningCount,
      hasBeenEnabled: Boolean(def.hasBeenEnabled),
    };
  }

  async saveVersion(
    userId: number,
    appId: number,
    formId: number,
    versionId: number,
    graph: WorkflowGraph,
  ) {
    await this.access.requireConfigure(userId, appId);
    await this.requireWorkflowForm(appId, formId);
    const row = await this.requireVersion(formId, versionId);
    if (row.enabled) {
      throw new BadRequestException('启用中的版本不能修改');
    }
    row.graph = graph;
    await this.versionRepo.save(row);
    return { ok: true };
  }

  async copyVersion(
    userId: number,
    appId: number,
    formId: number,
    fromVersionId: number,
  ) {
    await this.access.requireConfigure(userId, appId);
    await this.requireWorkflowForm(appId, formId);
    const from = await this.requireVersion(formId, fromVersionId);
    const rows = await this.versionRepo.find({ where: { formId } });
    const next = Math.max(0, ...rows.map((row) => row.version)) + 1;
    const created = this.versionRepo.create({
      appId,
      formId,
      version: next,
      graph: JSON.parse(JSON.stringify(from.graph)) as WorkflowGraph,
      enabled: false,
    });
    return this.versionRepo.save(created);
  }

  async enableVersion(
    userId: number,
    appId: number,
    formId: number,
    versionId: number,
  ) {
    await this.access.requireConfigure(userId, appId);
    const form = await this.requireWorkflowForm(appId, formId);
    const def = await this.ensureRow(appId, formId);
    const row = await this.requireVersion(formId, versionId);
    const fields = parseFormSchema(form.fields).fields;
    const errors = [
      ...validatePublishedGraph(row.graph, fields),
      ...(await this.validateApproverTargets(row.graph)),
    ];
    if (errors.length) {
      throw new BadRequestException(errors);
    }
    await this.versionRepo.update({ formId }, { enabled: false });
    row.enabled = true;
    await this.versionRepo.save(row);
    def.hasBeenEnabled = true;
    await this.defRepo.save(def);
    return { ok: true };
  }

  async deleteVersion(
    userId: number,
    appId: number,
    formId: number,
    versionId: number,
  ) {
    await this.access.requireConfigure(userId, appId);
    await this.requireWorkflowForm(appId, formId);
    const row = await this.requireVersion(formId, versionId);
    if (row.enabled) {
      throw new BadRequestException('启用中的版本不能删除');
    }
    await this.versionRepo.delete(row.id);
    return this.get(userId, appId, formId);
  }

  async getRuntime(formId: number): Promise<WorkflowRuntime> {
    const def = await this.defRepo.findOne({ where: { formId } });
    const enabled = await this.versionRepo.findOne({
      where: { formId, enabled: true },
    });
    if (enabled) {
      return {
        hasBeenEnabled: true,
        enabled: true,
        graph: enabled.graph,
        version: enabled.version,
      };
    }
    return {
      hasBeenEnabled: Boolean(def?.hasBeenEnabled),
      enabled: false,
      graph: null,
      version: 0,
    };
  }

  private async requireVersion(formId: number, versionId: number) {
    const row = await this.versionRepo.findOne({
      where: { id: versionId, formId },
    });
    if (!row) throw new NotFoundException('流程版本不存在');
    return row;
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
    const row = this.defRepo.create({
      appId,
      formId,
      hasBeenEnabled: false,
    });
    return this.defRepo.save(row);
  }

  private async validateApproverTargets(graph: WorkflowGraph): Promise<string[]> {
    const errors: string[] = [];
    const userIds = new Set<number>();
    const roleIds = new Set<number>();
    const targets = graph.nodes.filter(
      (
        node,
      ): node is Extract<WorkflowNode, { type: 'approve' | 'cc' }> =>
        node.type === 'approve' || node.type === 'cc',
    );
    for (const node of targets) {
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
    for (const node of targets) {
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
