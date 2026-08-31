import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('form_serial_seq')
@Index('uk_form_serial_seq_bucket', ['formId', 'fieldKey', 'periodKey'], {
  unique: true,
})
export class FormSerialSeq {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  formId: number;

  @Column({ type: 'varchar', length: 64 })
  fieldKey: string;

  @Column({ type: 'varchar', length: 32 })
  periodKey: string;

  @Column({ type: 'int' })
  nextValue: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
