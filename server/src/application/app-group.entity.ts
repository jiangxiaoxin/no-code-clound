import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_group')
@Index('IDX_app_group_applicationId', ['applicationId'])
export class AppGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  applicationId: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
