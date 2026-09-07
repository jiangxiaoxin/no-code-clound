import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TaskAction, TaskStatus } from './workflow.types';

@Entity('workflow_task')
@Index(
  'uk_workflow_task_instanceId_nodeKey_assigneeId_round',
  ['instanceId', 'nodeKey', 'assigneeId', 'round'],
  { unique: true },
)
@Index('IDX_workflow_task_assigneeId_status', ['assigneeId', 'status'])
@Index('IDX_workflow_task_instanceId', ['instanceId'])
export class WorkflowTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  instanceId: number;

  @Column({ type: 'varchar', length: 64 })
  nodeKey: string;

  @Column({ type: 'int' })
  round: number;

  @Column({ type: 'int' })
  assigneeId: number;

  @Column({ type: 'varchar', length: 16 })
  status: TaskStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  action: TaskAction | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  finishedAt: Date | null;
}
