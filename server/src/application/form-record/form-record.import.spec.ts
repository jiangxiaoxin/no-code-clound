import { importHeaders, parseImportRows } from './form-record.import';

const fields = [
  { key: 'name', type: 'input', title: '姓名', required: true },
  { key: 'age', type: 'number', title: '年龄' },
  { key: 'status', type: 'radio', title: '状态', dictCode: 'st' },
];

describe('form-record import', () => {
  it('uses field titles as headers', () => {
    expect(importHeaders(fields)).toEqual(['姓名', '年龄', '状态']);
  });

  it('keeps valid rows and drops incomplete or bad ones', () => {
    const rows = parseImportRows(
      ['姓名', '年龄', '状态'],
      [
        ['张三', 18, '启用'],
        ['', 20, '启用'],
        ['李四', 'abc', '启用'],
        ['王五', 21, '未知'],
        ['赵六', 22, '停用'],
        [],
      ],
      fields,
      {
        st: [
          { label: '启用', value: '1' },
          { label: '停用', value: '2' },
        ],
      },
    );
    expect(rows).toEqual([
      { name: '张三', age: 18, status: '1' },
      { name: '赵六', age: 22, status: '2' },
    ]);
  });
});
