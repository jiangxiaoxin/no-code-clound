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
    expect(collection.dropIndex).not.toHaveBeenCalledWith('idx_createdAt');
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
});
