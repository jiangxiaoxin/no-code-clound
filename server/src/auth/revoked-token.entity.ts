import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('revoked_token')
export class RevokedToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'datetime', precision: 6 })
  expiresAt: Date;
}
