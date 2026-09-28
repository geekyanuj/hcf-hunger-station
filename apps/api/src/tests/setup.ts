import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  // By default tests run against an in-memory MongoDB. Set TEST_MONGO_URI to point them at any
  // MongoDB-compatible server instead (useful where mongodb-memory-server can't download its binary).
  const externalUri = process.env.TEST_MONGO_URI;
  if (externalUri) {
    await mongoose.connect(`${externalUri.replace(/\/$/, '')}/hfc_test_${process.pid}`);
  } else {
    const { MongoMemoryServer: Server } = await import('mongodb-memory-server');
    mongod = await Server.create();
    await mongoose.connect(mongod.getUri());
  }
  // Make sure unique indexes exist before the first test writes anything.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => undefined)));
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  if (process.env.TEST_MONGO_URI) await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
