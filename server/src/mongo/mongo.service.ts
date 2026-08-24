import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient } from 'mongodb';
import { requireMongoEnv } from './mongo.env';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const { uri, dbName } = requireMongoEnv(
      this.config.get<string>('MONGO_URI'),
      this.config.get<string>('MONGO_DB_NAME'),
    );
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
  }

  async onModuleDestroy() {
    await this.client?.close();
    this.client = null;
    this.db = null;
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB 未连接');
    }
    return this.db;
  }
}
