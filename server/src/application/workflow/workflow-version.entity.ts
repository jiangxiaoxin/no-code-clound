import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { WorkflowGraph } from './workflow.types';

@Entity('workflow_version')
@Index('uk_workflow_version_formId_version', ['formId', 'version'], {
  unique: true,
})
@Index('IDX_workflow_version_formId', ['formId'])
export class WorkflowVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  appId: number;

  @Column({ type: 'int' })
  formId: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'json' })
  graph: WorkflowGraph;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
