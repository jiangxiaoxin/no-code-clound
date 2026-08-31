import { FormRecordStore } from './form-record.store';

describe('FormRecordStore', () => {
  const collection = {
    createIndex: jest.fn(),
    indexes: jest.fn(),
    dropIndex: jest.fn(),
    drop: jest.fn(),
    insertOne: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  const mongo = {
    getDb: () => ({
      collection: jest.fn(() => collection),
    }),
  };

  let store: FormRecordStore;

  beforeEach(() => {
    jest.resetAllMocks();
    collection.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            toArray: async () => [],
          }),
        }),
      }),
    });
    store = new FormRecordStore(mongo as never);
  });

  it('syncs filterable indexes and drops stale data indexes', async () => {
    collection.indexes.mockResolvedValue([
      { name: '_id_' },
      { name: 'idx_createdAt' },
      { name: 'idx_updatedAt' },
      { name: 'idx_createdBy' },
      { name: 'idx_data_old' },
    ]);
    collection.createIndex.mockResolvedValue('ok');
    collection.dropIndex.mockResolvedValue('ok');

    await store.syncIndexes(12, [{ key: 'name', type: 'input' }]);

    expect(collection.createIndex).toHaveBeenCalledWith(
      { 'data.name': 1 },
      { name: 'idx_data_name' },
    );
    expect(collection.dropIndex).toHaveBeenCalledWith('idx_data_old');
    expect(collection.createIndex).toHaveBeenCalledWith(
      { updatedAt: -1 },
      { name: 'idx_updatedAt' },
    );
    expect(collection.dropIndex).not.toHaveBeenCalledWith('idx_createdAt');
    expect(collection.dropIndex).not.toHaveBeenCalledWith('idx_updatedAt');
  });

  it('creates indexes for filterable fields inside tabs panes', async () => {
    collection.indexes.mockResolvedValue([]);
    collection.createIndex.mockResolvedValue('ok');

    await store.syncIndexes(12, [
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

    expect(collection.createIndex).toHaveBeenCalledWith(
      { 'data.inner': 1 },
      { name: 'idx_data_inner' },
    );
  });

  it('ignores missing collection on drop', async () => {
    collection.drop.mockRejectedValue(
      Object.assign(new Error('ns'), { code: 26 }),
    );
    await expect(store.dropFormCollection(12)).resolves.toBeUndefined();
  });

  it('looks up an existing data value and can exclude a record id', async () => {
    collection.findOne.mockResolvedValue({ _id: 'x' });
    await expect(
      store.existsByDataValue(12, 'name', '张三'),
    ).resolves.toBe(true);
    expect(collection.findOne).toHaveBeenCalledWith(
      { 'data.name': '张三' },
      { projection: { _id: 1 } },
    );

    collection.findOne.mockResolvedValue(null);
    await expect(
      store.existsByDataValue(
        12,
        'name',
        '张三',
        '64b64c4c4c4c4c4c4c4c4c4c',
      ),
    ).resolves.toBe(false);
    expect(collection.findOne).toHaveBeenLastCalledWith(
      {
        'data.name': '张三',
        _id: { $ne: expect.any(Object) },
      },
      { projection: { _id: 1 } },
    );
  });

  describe('dropAppCollections', () => {
    it('drops known form collections and leftover collections of the app', async () => {
      const byName = new Map<string, { drop: jest.Mock; findOne: jest.Mock }>();
      const col = (name: string) => {
        if (!byName.has(name)) {
          byName.set(name, { drop: jest.fn(), findOne: jest.fn() });
        }
        return byName.get(name)!;
      };
      const appStore = new FormRecordStore({
        getDb: () => ({
          collection: jest.fn((name: string) => col(name)),
          listCollections: () => ({
            toArray: async () => [
              { name: 'frm_10' },
              { name: 'frm_99' },
              { name: 'users' },
            ],
          }),
        }),
      } as never);
      col('frm_99').findOne.mockResolvedValue({ _id: 'x' });

      await appStore.dropAppCollections(8, [10]);

      expect(col('frm_10').drop).toHaveBeenCalled();
      expect(col('frm_99').findOne).toHaveBeenCalledWith(
        { appId: 8 },
        { projection: { _id: 1 } },
      );
      expect(col('frm_99').drop).toHaveBeenCalled();
      expect(byName.has('users')).toBe(false);
    });
  });
});
