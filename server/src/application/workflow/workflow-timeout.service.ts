import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInstance } from './workflow-instance.entity';

const SWEEP_LIMIT = 100;

@Injectable()
export class WorkflowTimeoutService {
  private readonly logger = new Logger(WorkflowTimeoutService.name);

  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    private readonly engine: WorkflowEngine,
  ) {}

  async expireInstance(instanceId: number): Promise<boolean> {
    return this.engine.expireIfOverdue(instanceId);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepOverdue(): Promise<void> {
    const rows = await this.instanceRepo.find({
      where: {
        status: 'running',
        dueAt: LessThanOrEqual(new Date()),
      },
      select: { id: true },
      take: SWEEP_LIMIT,
      order: { dueAt: 'ASC' },
    });
    for (const row of rows) {
      try {
        await this.engine.expireIfOverdue(row.id);
      } catch (err) {
        this.logger.error(
          `过期流程 ${row.id} 自动驳回失败`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
