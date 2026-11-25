import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChanges, isServerFile } from "../scripts/dev.js";

test("only the server's own code restarts it", () => {
  for (const path of ["server.js", "app.js", ".env", "package.json", "controllers/a.js", "utils\\b.js", "models/deep/c.js"]) assert.equal(isServerFile(path), true, path);
  for (const path of ["node_modules/node-fetch/index.js", "tests/a.test.js", "seed/seed.js", "scripts/dev.js", "README.md", "controllers/notes.txt", ".env.example", ""]) assert.equal(isServerFile(path), false, path);
});

test("opening a file isn't a change; saving, adding or deleting one is", (t) => {
  const root = mkdtempSync(join(tmpdir(), "nyafie-dev-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "utils"));
  const file = join(root, "utils", "a.js");
  writeFileSync(file, "export const a = 1;");
  writeFileSync(join(root, "server.js"), "");
  const saved = new Date(Date.now() - 60000);
  utimesSync(file, saved, saved);
  const { changed } = createChanges(root);
  assert.equal(changed("utils/a.js"), false);
  readFileSync(file);
  utimesSync(file, new Date(), saved); // opened just now, not saved
  assert.equal(changed("utils\\a.js"), false, "only opened");
  writeFileSync(file, "export const a = 22;");
  assert.equal(changed("utils/a.js"), true);
  assert.equal(changed("utils/a.js"), false, "reported once");
  writeFileSync(join(root, "utils", "b.js"), "");
  assert.equal(changed("utils/b.js"), true, "a new file");
  rmSync(file);
  assert.equal(changed("utils/a.js"), true, "a deleted file");
  assert.equal(changed("utils/never.js"), false);
});
