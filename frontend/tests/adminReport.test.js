import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminReport } from "../src/utils/adminReport.js";
import { createAdminReportPdf, reportPdfFilename } from "../src/utils/reportPdf.js";

const now = new Date(2026, 0, 20, 12);
const created = (month, day = 1) => new Date(2025, month, day).toISOString();
const property = (type, state, createdAt, reviewedAt) => ({ owner: { type }, listing: { state, createdAt, reviewedAt } });
const fixture = {
  users: [
    { role: "user", createdAt: created(7), email: "private@example.test" },
    { role: "user", createdAt: created(12, 3) },
    { role: "user", createdAt: created(6) },
    ...["active", "expired", "cancelled", "pending"].map((status) => ({ role: "agent", createdAt: created(11), subscription: { status, paymentStatus: "paid", expiryDate: created(12, 30) } })),
    { role: "agent", createdAt: created(12, 3) },
    { role: "admin", createdAt: created(12, 3) },
  ],
  listings: [
    property("agent", "published", created(8, 4), created(9, 2)),
    property("agent", "rejected", created(9, 5), created(10, 3)),
    property("agent", "draft", created(12, 10)),
    property("admin", "published", created(12, 3)),
    property("agent", "suspended", created(7), created(11)),
  ],
  payments: [
    { status: "paid", amount: 99.95, createdAt: created(11, 15) },
    { status: "paid", amount: 100.15, createdAt: created(12, 5) },
    { status: "pending", amount: 999, createdAt: created(12, 5) },
    { status: "failed", amount: 999, createdAt: created(12, 5) },
    { status: "paid", amount: 999, createdAt: created(6) },
  ],
  inquiries: [{ createdAt: created(12, 2) }, { createdAt: "invalid" }],
};

test("report periods cross the year boundary and use paid records only", (t) => {
  t.mock.method(Date, "now", () => now.getTime());
  const report = buildAdminReport(fixture, now);
  assert.deepEqual(report.months.map((month) => month.fullLabel), ["Aug 2025", "Sept 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026"]);
  const section = (key) => report.sections.find((item) => item.key === key);
  assert.equal(section("users").total, 2);
  assert.equal(section("agents").total, 5);
  assert.equal(section("listings").total, 5);
  assert.equal(section("subscriptions").total, 2);
  assert.equal(section("inquiries").total, 1);
  assert.ok(Math.abs(section("revenue").total - 200.1) < 1e-9);
  assert.equal(section("approvals").data[1].values.submitted, 1);
  assert.equal(section("approvals").data[2].values.approved, 1);
  assert.equal(section("approvals").data[3].values.approved, 0);
  assert.equal(section("approvals").data[4].values.approved, 1);
  assert.deepEqual(report.statuses.map(({ label, value }) => [label, value]), [["Active", 1], ["Expired", 1], ["Cancelled", 1], ["Pending", 1]]);
  assert.equal(report.agentsWithoutSubscription, 1);
  assert.ok(!JSON.stringify(report).includes("private@example.test"));
});

test("empty and populated reports generate a real three-page PDF with every report section", (t) => {
  t.mock.method(Date, "now", () => now.getTime());
  for (const source of [{}, fixture]) {
    const report = buildAdminReport(source, now);
    const doc = createAdminReportPdf(report, "NyaFie");
    assert.equal(doc.getNumberOfPages(), 3);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const content = doc.internal.pages.flat().join("\n");
    for (const section of report.sections) assert.ok(content.includes(section.title), `Missing section: ${section.title}`);
    assert.ok(content.includes("Current subscription status"));
    assert.ok(content.includes("Jan 2026"));
    assert.ok(content.includes(source === fixture ? "GHS 200.10" : "GHS 0.00"));
    assert.ok(!/NaN|Infinity/.test(content));
    assert.ok(!content.includes("private@example.test"));
  }
});

test("download filenames include the date and cannot contain path separators", () => {
  assert.equal(reportPdfFilename("NyaFie", now), "nyafie-reports-2026-01-20.pdf");
  assert.equal(reportPdfFilename("../../Homes \\ Ghana", now), "homes-ghana-reports-2026-01-20.pdf");
  assert.equal(reportPdfFilename("", now), "marketplace-reports-2026-01-20.pdf");
});
