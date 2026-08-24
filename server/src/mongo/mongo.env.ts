export function requireMongoEnv(
  uri?: string,
  dbName?: string,
): { uri: string; dbName: string } {
  if (!uri || !dbName) {
    throw new Error('MONGO_URI 和 MONGO_DB_NAME 必须配置');
  }
  return { uri, dbName };
}
