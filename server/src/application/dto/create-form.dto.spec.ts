import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFormDto } from './create-form.dto';

describe('CreateFormDto', () => {
  it('rejects invalid formKind', async () => {
    const dto = plainToInstance(CreateFormDto, {
      name: '请假单',
      formKind: 'foo',
    });
    const errors = await validate(dto);
    expect(errors.some((item) => item.property === 'formKind')).toBe(true);
  });

  it('accepts workflow formKind', async () => {
    const dto = plainToInstance(CreateFormDto, {
      name: '请假单',
      formKind: 'workflow',
    });
    const errors = await validate(dto);
    expect(errors.filter((item) => item.property === 'formKind')).toEqual([]);
  });
});
