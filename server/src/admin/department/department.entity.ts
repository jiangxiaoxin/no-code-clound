import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('department')
@Index('uk_department_parent_name', ['parentId', 'name'], { unique: true })
@Index('IDX_department_parentId', ['parentId'])
@Index('IDX_department_status', ['status'])
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'disabled';

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
