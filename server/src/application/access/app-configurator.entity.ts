import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_configurator')
@Index('uk_app_configurator_appId_userId', ['appId', 'userId'], {
  unique: true,
})
@Index('IDX_app_configurator_appId', ['appId'])
@Index('IDX_app_configurator_userId', ['userId'])
export class AppConfigurator {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  appId: number;

  @Column({ type: 'int' })
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
