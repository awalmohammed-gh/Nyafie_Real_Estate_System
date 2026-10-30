import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, isAbsolute } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";
import mongoose from "mongoose";

// A fresh local replica set; this helper never reads the application's DB URL.
export const isolatedMongo = async (t) => {
  const probe = createServer();
  await new Promise((done) => probe.listen(0, "127.0.0.1", done));
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  const directory = await mkdtemp(join(tmpdir(), "homebase-rental-test-"));
  const log = await open(join(directory, "mongod.log"), "w");
  const binary = process.env.MONGOD_TEST_BINARY || "C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe";
  const mongod = spawn(binary, ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", String(port), "--replSet", "rentaltest"], { stdio: ["ignore", log.fd, log.fd], windowsHide: true });
  let startError;
  mongod.on("error", (error) => { startError = error; });
  t.after(async () => {
    await mongoose.disconnect();
    if (!startError && mongod.exitCode === null) {
      const stopped = new Promise((done) => mongod.once("exit", done));
      mongod.kill();
      await stopped;
    }
    await log.close();
    const absolute = resolve(directory), withinTemp = relative(resolve(tmpdir()), absolute);
    assert.ok(withinTemp && !withinTemp.startsWith("..") && !isAbsolute(withinTemp) && basename(absolute).startsWith("homebase-rental-test-"));
    await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  let connected = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (startError) throw startError;
    assert.equal(mongod.exitCode, null, "isolated MongoDB stays running");
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${port}/rental_test?directConnection=true`, { serverSelectionTimeoutMS: 500, autoCreate: false, autoIndex: false });
      connected = true;
      break;
    } catch { await delay(200); }
  }
  assert.ok(connected, "isolated MongoDB starts");
  await mongoose.connection.db.admin().command({ replSetInitiate: { _id: "rentaltest", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  let primary = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await mongoose.connection.db.admin().command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
    await delay(200);
  }
  assert.ok(primary, "isolated replica set becomes writable");
  await Promise.all(Object.values(mongoose.models).map(async (model) => { await model.createCollection(); await model.createIndexes(); }));
};
