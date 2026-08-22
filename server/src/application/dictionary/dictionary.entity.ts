import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dictionary')
@Index('uk_dictionary_app_code', ['applicationId', 'code'], { unique: true })
@Index('uk_dictionary_app_name', ['applicationId', 'name'], { unique: true })
@Index('IDX_dictionary_applicationId', ['applicationId'])
export class Dictionary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  applicationId: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'disabled';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
