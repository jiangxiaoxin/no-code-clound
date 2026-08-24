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
});
