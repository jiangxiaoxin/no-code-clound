import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dictionary_item')
@Index('uk_dictionary_item_value', ['dictionaryId', 'value'], { unique: true })
@Index('IDX_dictionary_item_dictionaryId', ['dictionaryId'])
export class DictionaryItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  dictionaryId: number;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ type: 'varchar', length: 64 })
  value: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'disabled';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
