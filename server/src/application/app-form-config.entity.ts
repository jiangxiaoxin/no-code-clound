import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_form_config')
@Index('UQ_app_form_config_formId', ['formId'], { unique: true })
export class AppFormConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  formId: number;

  @Column({ type: 'json', nullable: true })
  config: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
