import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AppAccessScopeType = 'user' | 'department' | 'role';

@Entity('app_access_scope')
@Index('uk_app_access_scope_appId_type_targetId', ['appId', 'type', 'targetId'], {
  unique: true,
})
@Index('IDX_app_access_scope_appId', ['appId'])
@Index('IDX_app_access_scope_type_targetId', ['type', 'targetId'])
export class AppAccessScope {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  appId: number;

  @Column({ type: 'varchar', length: 16 })
  type: AppAccessScopeType;

  @Column({ type: 'int' })
  targetId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
