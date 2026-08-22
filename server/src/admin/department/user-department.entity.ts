import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('user_department')
@Index('uk_user_department', ['userId', 'departmentId'], { unique: true })
@Index('IDX_user_department_userId', ['userId'])
@Index('IDX_user_department_departmentId', ['departmentId'])
export class UserDepartment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  departmentId: number;

  @CreateDateColumn()
  createdAt: Date;
}
