import { normalizeFormDataAccess } from './form-data-access';

describe('normalizeFormDataAccess', () => {
  it('缺省是不限制表、行看与自己相关', () => {
    expect(normalizeFormDataAccess(null)).toEqual({
      formViewers: [],
      rowScope: 'related',
    });
  });

  it('丢掉非法项并去重', () => {
    expect(
      normalizeFormDataAccess({
        rowScope: 'dept',
        formViewers: [
          { type: 'department', targetId: 3 },
          { type: 'department', targetId: 3 },
          { type: 'group', targetId: 1 },
          { type: 'user', targetId: -1 },
          { type: 'role', targetId: 9 },
        ],
      }),
    ).toEqual({
      formViewers: [
        { type: 'department', targetId: 3 },
        { type: 'role', targetId: 9 },
      ],
      rowScope: 'dept',
    });
  });

  it('无法识别的数据范围按与自己相关', () => {
    expect(normalizeFormDataAccess({ rowScope: 'custom' }).rowScope).toBe(
      'related',
    );
  });
});
