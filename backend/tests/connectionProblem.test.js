import { test } from "node:test";
import assert from "node:assert/strict";
import { isConnectionProblem } from "../utils/connectionProblem.js";

test("startup retries only when the database can't be reached", () => {
  const error = (fields) => Object.assign(new Error("x"), fields);
  for (const fields of [{ name: "MongooseServerSelectionError" }, { name: "MongoNetworkError" }, { code: "ENOTFOUND" }, { code: "ETIMEOUT" }]) assert.equal(isConnectionProblem(error(fields)), true);
  for (const fields of [{}, { name: "MongoServerError", code: 8000 }, { name: "MongoParseError" }, { code: "EADDRINUSE" }]) assert.equal(isConnectionProblem(error(fields)), false);
  assert.equal(isConnectionProblem(undefined), false);
});
