import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('user_role')
@Index('uk_user_role', ['userId', 'roleId'], { unique: true })
@Index('IDX_user_role_userId', ['userId'])
@Index('IDX_user_role_roleId', ['roleId'])
export class UserRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  roleId: number;

  @CreateDateColumn()
  createdAt: Date;
}
