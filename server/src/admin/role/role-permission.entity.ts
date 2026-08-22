import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('role_permission')
@Index('uk_role_permission', ['roleId', 'permission'], { unique: true })
@Index('IDX_role_permission_roleId', ['roleId'])
@Index('IDX_role_permission_permission', ['permission'])
export class RolePermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  roleId: number;

  @Column({ type: 'varchar', length: 64 })
  permission: string;
}
