import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection } from 'mongoose';

let replSet: MongoMemoryReplSet;

export async function startTestDb(): Promise<string> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  return replSet.getUri();
}

export async function stopTestDb(): Promise<void> {
  if (replSet) {
    await replSet.stop();
  }
}

export async function clearCollections(connection: Connection): Promise<void> {
  const collections = connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
