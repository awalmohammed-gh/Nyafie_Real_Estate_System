import "dotenv/config";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import User from "../models/User.js";

// Runs the requested matrix in three tabs of ONE browser session, using only
// disposable accounts. Never prints credentials or saves browser/token state.
const cli = process.argv[2] || "agent-browser";
const appUrl = process.env.AUTH_TEST_APP_URL || "http://localhost:5173";
const apiUrl = process.env.AUTH_TEST_API_URL || "http://localhost:4000/api";
for (const url of [appUrl, apiUrl]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Browser verification is restricted to local servers");
assert.notEqual(process.env.NODE_ENV, "production", "Run browser verification against development only");
const suffix = randomUUID();
const browserSession = `authverify-${suffix.slice(0, 8)}`;
const password = `Verify-${randomUUID()}`;
const created = [];
const roles = { admin: "admin", agent: "agent", customer: "user" };
const homes = { admin: "/admin/dashboard", agent: "/agent/dashboard", customer: "/account/profile" };
const logins = { admin: "/admin/login", agent: "/agent/login", customer: "/login" };
const names = { admin: "SessionAdmin", agent: "SessionAgent", customer: "SessionCustomer" };
const targets = {};
const outputDirectory = mkdtempSync(join(tmpdir(), "authverify-"));
let commandNumber = 0;
const run = (...args) => {
  // Use a file handle, so a Windows background daemon cannot keep a captured
  // stdout/stderr pipe open after the CLI process finishes.
  const outputPath = join(outputDirectory, `${++commandNumber}.json`);
  const handle = openSync(outputPath, "w");
  let result;
  try {
    result = spawnSync(cli, ["--session", browserSession, "--json", ...args], { stdio: ["ignore", handle, "ignore"], timeout: 45000, windowsHide: true });
  } finally { closeSync(handle); }
  if (result.error) throw new Error(`Browser command ${args[0]} could not run: ${result.error.code}`);
  let response;
  try { response = JSON.parse(readFileSync(outputPath, "utf8").trim()); } catch { throw new Error(`Browser command ${args[0]} returned invalid output`); }
  // Some CLI versions report a missing bound target after successfully closing
  // it. Verify the requested target is gone before treating that as success.
  if (!response.success && args[0] === "tab" && args[1] === "close") {
    assert.ok(!run("tab", "list").tabs.some((tab) => tab.targetId === args[2]), "Requested tab did not close");
    return response.data;
  }
  assert.ok(response.success, `Browser command ${args[0]} failed: ${response.error}`);
  return response.data;
};
const evaluate = (code) => run("eval", code).result;
const signIn = (domain, newTab = false) => {
  if (newTab) {
    run("tab", "new", appUrl + logins[domain]);
    targets[domain] = run("tab", "list").tabs.find((tab) => tab.active).targetId;
  } else { run("tab", targets[domain]); run("open", appUrl + logins[domain]); }
  run("wait", "input[type=email]");
  run("fill", "input[type=email]", `${domain}-${suffix}@example.test`);
  run("fill", "input[type=password]", password);
  run("click", "button[type=submit]");
  // Login may preserve a protected return destination in history.state.
  run("wait", "--fn", `location.pathname !== ${JSON.stringify(logins[domain])}`);
  run("open", appUrl + homes[domain]);
  checkPage(domain);
};
const checkPage = (domain) => {
  run("wait", "--fn", `document.body.innerText.includes(${JSON.stringify(names[domain])})`);
  const identity = evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(apiUrl + "/auth/" + domain + "/me")}, { credentials: 'include', headers: {'X-Session-Domain': ${JSON.stringify(domain)}} });
    const body = await response.json();
    return { status: response.status, role: body.data?.role, id: body.data?.id, path: location.pathname };
  })()`);
  assert.equal(identity.status, 200);
  assert.equal(identity.role, roles[domain]);
  assert.equal(identity.id, String(created.find((account) => account.role === roles[domain])._id));
  assert.equal(identity.path, homes[domain]);
  const storageSafe = evaluate(`(() => {
    const values = [...Object.values(localStorage), ...Object.values(sessionStorage)];
    return !values.some(value => /eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.test(value)) && !/(customer|agent|admin)_token=/.test(document.cookie);
  })()`);
  assert.equal(storageSafe, true, "JWT leaked into JS storage/cookies");
};
const refresh = (domain) => {
  run("tab", targets[domain]);
  run("reload");
  checkPage(domain);
  const checks = evaluate("performance.getEntriesByType('resource').map(e => e.name).filter(url => /\\/auth\\/(customer|agent|admin)\\/me(?:$|\\?)/.test(url))");
  assert.ok(checks.every((url) => url.includes(`/auth/${domain}/me`)), "Restored an unrelated role");
};
try {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const [domain, role] of Object.entries(roles)) created.push(await User.create({
    firstName: names[domain], lastName: "Verification", role,
    email: `${domain}-${suffix}@example.test`, password, isActive: true,
    ...(role === "agent" ? { agentApplication: { status: "approved", profileCompletedAt: new Date(), approvedAt: new Date() } } : {}),
  }));
  console.log("Starting one browser profile for the three-role matrix");
  // Windows daemon startup can inherit captured pipes and keep spawnSync waiting
  // after the CLI exits. Start it with detached output, then capture commands.
  const startup = spawnSync(cli, ["--session", browserSession, "open", appUrl + "/login"], { stdio: "ignore", timeout: 45000, windowsHide: true });
  assert.equal(startup.status, 0, "Browser profile could not start");
  for (const domain of Object.keys(roles)) {
    signIn(domain, true);
    console.log(`PASS: ${domain} UI sign in`);
  }
  console.log("PASS: Admin, Agent and Customer UI logins in three tabs of the same profile");
  for (const domain of Object.keys(roles)) refresh(domain);
  assert.ok(run("tab", "list").tabs.length >= 3, "Role tabs did not coexist in one browser");
  console.log("PASS: All tabs refresh with the correct identity and only their own session check");
  for (const domain of Object.keys(roles)) {
    run("tab", "close", targets[domain]);
    run("tab", "new", appUrl + homes[domain]);
    targets[domain] = run("tab", "list").tabs.find((tab) => tab.active).targetId;
    checkPage(domain);
  }
  console.log("PASS: Closing and reopening each tab restores its correct role");
  for (const domain of ["customer", "agent", "admin"]) {
    run("tab", targets[domain]);
    if (domain === "customer") {
      run("find", "role", "button", "click", "--name", `Account menu for ${names[domain]} Verification`);
      run("find", "role", "menuitem", "click", "--name", "Logout");
    } else run("find", "role", "button", "click", "--name", "Log out", "--exact");
    run("wait", "--url", `**${logins[domain]}`);
    for (const other of Object.keys(roles).filter((role) => role !== domain)) refresh(other);
    console.log(`PASS: ${domain} UI logout leaves both other role sessions authenticated`);
    signIn(domain);
  }
  for (const domain of Object.keys(roles)) {
    run("tab", targets[domain]);
    const paths = domain === "customer" ? ["/admin/users", "/agents/dashboard"] : domain === "agent" ? ["/admin/users"] : [];
    for (const path of paths) {
      const status = evaluate(`(async () => (await fetch(${JSON.stringify(apiUrl + path)}, {credentials:'include', headers:{'X-Session-Domain':${JSON.stringify(domain)}}})).status)()`);
      assert.equal(status, 403);
    }
    checkPage(domain);
  }
  console.log("PASS: Cross-role APIs reject access with all three cookies present; no JWT in JS storage");
  // Agent profile and plan renewal must use agent auth even while customer is signed in.
  run("tab", targets.agent);
  run("open", appUrl + "/agent/profile");
  run("wait", "#firstName");
  assert.equal(evaluate("document.querySelector('#firstName').value"), names.agent);
  run("open", appUrl + "/agent/subscription/plans");
  run("wait", "--text", "View plans");
  assert.equal(evaluate("location.pathname"), "/agent/subscription/plans");
  console.log("PASS: Agent profile and renewal routes retain the agent session");
} finally {
  try { run("close"); } catch { /* Browser may already be closed after a failure. */ }
  if (created.length) {
    const deleted = await User.deleteMany({ _id: { $in: created.map((account) => account._id) }, email: { $in: created.map((account) => account.email) } });
    assert.equal(deleted.deletedCount, created.length, "Temporary account cleanup failed");
    console.log("Temporary verification accounts removed");
  }
  await mongoose.disconnect();
  for (let index = 1; index <= commandNumber; index++) rmSync(join(outputDirectory, `${index}.json`), { force: true });
  rmdirSync(outputDirectory); // Only the newly created empty directory is removed.
}
