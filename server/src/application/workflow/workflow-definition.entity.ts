import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkflowGraph } from './workflow.types';

@Entity('workflow_definition')
@Index('uk_workflow_definition_formId', ['formId'], { unique: true })
@Index('IDX_workflow_definition_appId', ['appId'])
export class WorkflowDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  appId: number;

  @Column({ type: 'int' })
  formId: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  enabled: boolean;

  @Column({ type: 'json', nullable: true })
  draftGraph: WorkflowGraph | null;

  @Column({ type: 'json', nullable: true })
  publishedGraph: WorkflowGraph | null;

  @Column({ type: 'int', default: 0 })
  publishedVersion: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
