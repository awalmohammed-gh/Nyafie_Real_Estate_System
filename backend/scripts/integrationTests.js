// npm run test:integration -> every database integration test, against throwaway local MongoDB replica
// sets the tests start and remove themselves (never the configured application database).
// Needs a mongod binary: set MONGOD_TEST_BINARY to its path (e.g. C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe).
// Paystack is never really called: the tests use test keys and replace every Paystack request.
import { readdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const dir = new URL("../tests/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = readdirSync(dir).filter((name) => name.endsWith(".integration.test.js")).sort();
// Each suite is switched on by its own RUN_..._INTEGRATION flag: turn them all on
const flags = new Set(files.flatMap((name) => readFileSync(join(dir, name), "utf8").match(/RUN_[A-Z_]+_INTEGRATION|RUN_[A-Z]+_MIGRATION_INTEGRATION/g) || []));
const only = process.argv.slice(2); // optional: names to run, e.g. npm run test:integration -- hotelFlow rentalInventory
const selected = only.length ? files.filter((name) => only.some((part) => name.includes(part))) : files;

if (!process.env.MONGOD_TEST_BINARY) console.warn("MONGOD_TEST_BINARY is not set: using the default Windows path in tests/support/isolatedMongo.js.");
const env = { ...process.env, ...Object.fromEntries([...flags].map((flag) => [flag, "1"])) };
// Never with live keys: the tests set their own test keys, and a live key in the shell is removed
for (const name of ["PAYSTACK_SECRET_KEY", "Test_Secret_Key"]) if (/^sk_live_/.test(env[name] || "")) delete env[name];
if (env.PAYSTACK_MODE === "live") delete env.PAYSTACK_MODE;

// Nor with the real database or email account: the app loads backend/.env, which never replaces a
// variable that is already set. Suites that need email set their own values and capture what is sent.
for (const name of ["MONGODB_URI", "MONGODB_DB", "SMTP_USER", "SMTP_APP_PASSWORD", "EMAIL_SMTP_HOST", "EMAIL_SMTP_USER", "EMAIL_SMTP_PASSWORD", "SENTRY_DSN"]) env[name] = "";

console.log(`Running ${selected.length} integration suite(s) with ${flags.size} flags on.`);
const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...selected.map((name) => join(dir, name))], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 1));
