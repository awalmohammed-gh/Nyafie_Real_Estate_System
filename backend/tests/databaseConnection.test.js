import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";

test("concurrent requests reuse the MongoDB connection and failed connects can retry", async (t) => {
  const oldUri = process.env.MONGODB_URI;
  const oldDb = process.env.MONGODB_DB;
  process.env.MONGODB_URI = 'mongodb://example.test/homebase';
  process.env.MONGODB_DB = 'preview_db';
  let connected = false;
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => connected ? 1 : 0 });
  let calls = 0;
  let reject;
  let resolve;
  t.mock.method(mongoose, 'connect', (_uri, options) => {
    calls++;
    assert.equal(options.maxPoolSize, 10);
    assert.equal(options.dbName, 'preview_db');
    assert.equal(options.bufferCommands, false);
    return new Promise((yes, no) => { resolve = yes; reject = no; });
  });
  try {
    const first = [connectDB(), connectDB(), connectDB()];
    assert.equal(calls, 1);
    reject(new Error('Connection refused'));
    const failures = await Promise.allSettled(first);
    assert.ok(failures.every((result) => result.status === 'rejected'));
    const second = [connectDB(), connectDB()];
    assert.equal(calls, 2);
    connected = true;
    resolve(mongoose);
    await Promise.all(second);
    await connectDB();
    assert.equal(calls, 2);
  } finally {
    delete mongoose.connection.readyState;
    if (oldUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = oldUri;
    if (oldDb === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = oldDb;
  }
});
