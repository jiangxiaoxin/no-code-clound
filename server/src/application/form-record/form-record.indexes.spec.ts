import {
  collectionName,
  dataIndexName,
  targetDataIndexNames,
} from './form-record.indexes';

describe('form-record.indexes', () => {
  it('names collection by form id', () => {
    expect(collectionName(12)).toBe('frm_12');
  });

  it('builds data index name from field key', () => {
    expect(dataIndexName('a1b2-c3')).toBe('idx_data_a1b2-c3');
  });

  it('indexes only filterable types and skips layout/media/subform', () => {
    const names = targetDataIndexNames([
      { key: 't1', type: 'input' },
      { key: 't2', type: 'number' },
      { key: 't3', type: 'select-multiple' },
      { key: 'd1', type: 'divider' },
      { key: 'i1', type: 'image' },
      { key: 'f1', type: 'file' },
      { key: 's1', type: 'subform' },
      { key: 'sn', type: 'serialNumber' },
      {
        key: 'tabs_1',
        type: 'tabs',
        panes: [
          {
            id: 'p1',
            title: 'A',
            fields: [{ key: 'inner', type: 'input' }],
          },
        ],
      },
    ]);
    expect(names).toEqual([
      'idx_data_t1',
      'idx_data_t2',
      'idx_data_t3',
      'idx_data_sn',
      'idx_data_inner',
    ]);
  });


  it('returns no data indexes when fields is null', () => {
    expect(targetDataIndexNames(null)).toEqual([]);
    expect(targetDataIndexNames(undefined)).toEqual([]);
  });
});
