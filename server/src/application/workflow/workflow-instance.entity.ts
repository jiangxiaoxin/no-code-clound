import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  InstanceNote,
  InstanceStatus,
  RetryPatch,
  RetryStep,
  WorkflowGraph,
} from './workflow.types';

@Entity('workflow_instance')
@Index('uk_workflow_instance_formId_recordId', ['formId', 'recordId'], {
  unique: true,
})
@Index('IDX_workflow_instance_initiatorId', ['initiatorId'])
@Index('IDX_workflow_instance_appId_status', ['appId', 'status'])
export class WorkflowInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  appId: number;

  @Column({ type: 'int' })
  formId: number;

  @Column({ type: 'varchar', length: 24 })
  recordId: string;

  @Column({ type: 'int' })
  definitionVersion: number;

  @Column({ type: 'json' })
  graph: WorkflowGraph;

  @Column({ type: 'int' })
  initiatorId: number;

  @Column({ type: 'varchar', length: 16 })
  status: InstanceStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  currentNodeKey: string | null;

  @Column({ type: 'json', nullable: true })
  visitedNodeKeys: string[] | null;

  @Column({ type: 'boolean', default: false })
  hasApproved: boolean;

  @Column({ type: 'int', default: 1 })
  round: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorReason: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  retryStep: RetryStep;

  // 通过时审批人填的内容，写回失败后靠它重试补写，成功即清空
  @Column({ type: 'json', nullable: true })
  retryPatch: RetryPatch | null;

  @Column({ type: 'int', nullable: true })
  retryActorId: number | null;

  @Column({ type: 'json', nullable: true })
  notes: InstanceNote[] | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  endedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
