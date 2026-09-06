import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_form')
@Index('IDX_app_form_applicationId', ['applicationId'])
@Index('IDX_app_form_groupId', ['groupId'])
export class AppForm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  applicationId: number;

  @Column({ type: 'int', nullable: true })
  groupId: number | null;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'json', nullable: true })
  fields: Record<string, unknown>[] | null;

  @Column({ type: 'varchar', length: 16, default: 'normal' })
  formKind: 'normal' | 'workflow';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
