import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormSerialSeq } from './form-serial-seq.entity';

@Injectable()
export class FormSerialSeqService {
  constructor(
    @InjectRepository(FormSerialSeq)
    private readonly repo: Repository<FormSerialSeq>,
  ) {}

  async takeNext(
    formId: number,
    fieldKey: string,
    periodKey: string,
    start: number,
  ): Promise<number> {
    const safeStart = Number.isInteger(start) && start >= 0 ? start : 1;
    return this.repo.manager.transaction(async (em) => {
      let row = await em.findOne(FormSerialSeq, {
        where: { formId, fieldKey, periodKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        try {
          const created = em.create(FormSerialSeq, {
            formId,
            fieldKey,
            periodKey,
            nextValue: safeStart + 1,
          });
          await em.save(created);
          return safeStart;
        } catch {
          row = await em.findOne(FormSerialSeq, {
            where: { formId, fieldKey, periodKey },
            lock: { mode: 'pessimistic_write' },
          });
          if (!row) {
            throw new Error('流水号计数失败');
          }
        }
      }
      const issued = Math.max(row.nextValue, safeStart);
      row.nextValue = issued + 1;
      await em.save(row);
      return issued;
    });
  }
}
