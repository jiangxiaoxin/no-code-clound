import { flattenFields } from './flatten-fields';

describe('flattenFields', () => {
  it('walks panes in order and skips the tabs field itself', () => {
    const fields = [
      { key: 'before', type: 'input' },
      {
        type: 'tabs',
        key: 'tabs_1',
        panes: [
          { id: 'p1', title: 'A', fields: [{ key: 'a', type: 'input' }] },
          { id: 'p2', title: 'B', fields: [{ key: 'b', type: 'number' }] },
        ],
      },
      { key: 'after', type: 'input' },
    ];
    expect(flattenFields(fields).map((item) => item.key)).toEqual([
      'before',
      'a',
      'b',
      'after',
    ]);
  });

  it('does not expand subform.fields', () => {
    const fields = [
      {
        type: 'tabs',
        key: 'tabs_1',
        panes: [
          {
            id: 'p1',
            title: 'A',
            fields: [
              {
                key: 'kids',
                type: 'subform',
                fields: [{ key: 'col', type: 'input' }],
              },
            ],
          },
        ],
      },
    ];
    expect(flattenFields(fields).map((item) => item.key)).toEqual(['kids']);
  });
});
