import { BadRequestException } from '@nestjs/common';
import {
  assertSerialSchema,
  formatSerialDate,
  periodKey,
  renderSerialValue,
} from './serial-number';

describe('serial-number', () => {
  const now = new Date('2026-08-31T08:22:05.123Z');

  it('formats calendar parts in Asia/Shanghai', () => {
    expect(formatSerialDate('YYYY', now)).toBe('2026');
    expect(formatSerialDate('YYYYMM', now)).toBe('202608');
    expect(formatSerialDate('YYYYMMDD', now)).toBe('20260831');
    expect(formatSerialDate('YYYYMMDDHHmmss', now)).toBe('20260831162205');
    expect(formatSerialDate('epochMs', now)).toBe(String(now.getTime()));
  });

  it('builds period keys', () => {
    expect(periodKey(false, undefined, now)).toBe('all');
    expect(periodKey(true, 'day', now)).toBe('2026-08-31');
    expect(periodKey(true, 'week', now)).toBe('2026-W36');
    expect(periodKey(true, 'month', now)).toBe('2026-08');
    expect(periodKey(true, 'quarter', now)).toBe('2026-Q3');
    expect(periodKey(true, 'year', now)).toBe('2026');
  });

  it('joins non-empty parts with trimmed separator', () => {
    const field = {
      key: 'sn',
      type: 'serialNumber',
      serialSeparator: '-',
      serialRule: [
        { kind: 'fixed', text: 'PO' },
        { kind: 'datetime', format: 'YYYYMMDD' },
        { kind: 'counter', start: 1, digits: 5 },
        { kind: 'field', fieldKey: 'name' },
      ],
    };
    expect(renderSerialValue(field, { name: '张三' }, now, 1)).toBe(
      'PO-20260831-00001-张三',
    );
    expect(renderSerialValue(field, { name: '' }, now, 1)).toBe(
      'PO-20260831-00001',
    );
  });

  it('empty separator concatenates', () => {
    const field = {
      key: 'sn',
      type: 'serialNumber',
      serialSeparator: '   ',
      serialRule: [
        { kind: 'datetime', format: 'YYYYMMDD' },
        { kind: 'counter', digits: 5 },
      ],
    };
    expect(renderSerialValue(field, {}, now, 1)).toBe('2026083100001');
  });

  it('counter overflow keeps full digits', () => {
    const field = {
      key: 'sn',
      type: 'serialNumber',
      serialSeparator: '',
      serialRule: [{ kind: 'counter', digits: 5 }],
    };
    expect(renderSerialValue(field, {}, now, 100000)).toBe('100000');
  });

  it('rejects two serial fields or two counters', () => {
    expect(() =>
      assertSerialSchema([
        {
          key: 'a',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'YYYY' }],
        },
        {
          key: 'b',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'YYYY' }],
        },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      assertSerialSchema([
        {
          key: 'a',
          type: 'serialNumber',
          serialRule: [
            { kind: 'counter', start: 1, digits: 5 },
            { kind: 'counter', start: 1, digits: 5 },
          ],
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('allows zero counters when there is another segment', () => {
    expect(() =>
      assertSerialSchema([
        {
          key: 'a',
          type: 'serialNumber',
          serialRule: [{ kind: 'datetime', format: 'epochMs' }],
        },
      ]),
    ).not.toThrow();
  });
});
