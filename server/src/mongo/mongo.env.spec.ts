import { requireMongoEnv } from './mongo.env';

describe('requireMongoEnv', () => {
  it('returns uri and db name', () => {
    expect(
      requireMongoEnv('mongodb://localhost:27017', 'no_code_cloud'),
    ).toEqual({
      uri: 'mongodb://localhost:27017',
      dbName: 'no_code_cloud',
    });
  });

  it('throws when missing', () => {
    expect(() => requireMongoEnv('', 'no_code_cloud')).toThrow(
      'MONGO_URI 和 MONGO_DB_NAME 必须配置',
    );
    expect(() => requireMongoEnv('mongodb://localhost:27017', '')).toThrow(
      'MONGO_URI 和 MONGO_DB_NAME 必须配置',
    );
  });
});
