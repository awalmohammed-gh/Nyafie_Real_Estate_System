import { jsPDF } from "jspdf";
import { sumReportValues } from "./adminReport.js";

const BRAND = "#3e0766";
const INK = "#1e293b";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const SERIES_COLORS = ["#7a0cc8", "#10b981"];
const LEFT = 16;
const WIDTH = 178;

// The built-in PDF font supports Latin text; normalize labels to avoid broken glyphs.
const safeText = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
const count = (value) => value.toLocaleString("en-GB");
const amount = (value) => `GHS ${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (value) => value.toLocaleString("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const date = (value) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const text = (doc, value, x, y, { size = 10, bold = false, color = INK, align = "left", width } = {}) => {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(color);
  const label = safeText(value);
  doc.text(width ? doc.splitTextToSize(label, width) : label, x, y, { align });
};

const header = (doc, report, siteName, title) => {
  text(doc, siteName, LEFT, 17, { size: 13, bold: true, color: BRAND, width: 105 });
  text(doc, "ADMINISTRATIVE REPORT", LEFT + WIDTH, 16, { size: 8, color: MUTED, align: "right" });
  text(doc, `Generated ${date(report.generatedAt)}`, LEFT + WIDTH, 21, { size: 8, color: MUTED, align: "right" });
  text(doc, title, LEFT, 35, { size: 20, bold: true });
  text(doc, `${date(report.period.from)} - ${date(report.period.to)} | Last 6 calendar months`, LEFT, 43, { size: 9, color: MUTED });
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.25);
  doc.line(LEFT, 49, LEFT + WIDTH, 49);
};

const chart = (doc, section, x, y, width, height) => {
  doc.setFillColor("#ffffff");
  doc.setDrawColor(BORDER);
  doc.roundedRect(x, y, width, height, 2, 2, "FD");
  text(doc, section.title, x + 6, y + 8, { size: 10, bold: true });
  if (section.total != null) text(doc, `Total: ${section.currency ? amount(section.total) : count(section.total)}`, x + 6, y + 14, { size: 8, color: MUTED });
  else section.series.forEach((series, index) => {
    doc.setFillColor(SERIES_COLORS[index]);
    doc.rect(x + 6 + index * 31, y + 12, 2, 2, "F");
    text(doc, series.label, x + 10 + index * 31, y + 14, { size: 7, color: MUTED });
  });

  const plotX = x + 6;
  const plotWidth = width - 12;
  const top = y + 26;
  const bottom = y + height - 13;
  const plotHeight = bottom - top;
  const max = Math.max(1, ...section.data.flatMap((row) => section.series.map((series) => row.values[series.key] || 0)));
  doc.setDrawColor("#edf0f4");
  for (const position of [0, .5, 1]) doc.line(plotX, bottom - plotHeight * position, plotX + plotWidth, bottom - plotHeight * position);
  const groupWidth = plotWidth / section.data.length;
  const barWidth = Math.min(9, (groupWidth * .65) / section.series.length);
  section.data.forEach((row, index) => {
    const centre = plotX + (index + .5) * groupWidth;
    section.series.forEach((series, seriesIndex) => {
      const value = row.values[series.key] || 0;
      const barHeight = (value / max) * plotHeight;
      const barX = centre - (section.series.length * barWidth + (section.series.length - 1)) / 2 + seriesIndex * (barWidth + 1);
      doc.setFillColor(SERIES_COLORS[seriesIndex]);
      if (barHeight > 0) doc.rect(barX, bottom - barHeight, barWidth, barHeight, "F");
      text(doc, compact(value), barX + barWidth / 2, bottom - barHeight - 2, { size: 6.5, align: "center", color: MUTED });
    });
    text(doc, row.label, centre, bottom + 6, { size: 7, align: "center", color: MUTED });
  });
};

const table = (doc, headers, rows, x, y, widths) => {
  const width = widths.reduce((sum, value) => sum + value, 0);
  const headerHeight = 9;
  const rowHeight = 7;
  doc.setFillColor(BRAND);
  doc.rect(x, y, width, headerHeight, "F");
  let columnX = x;
  headers.forEach((label, index) => {
    text(doc, label, index === 0 ? columnX + 3 : columnX + widths[index] - 3, y + 6, { size: 8, color: "#ffffff", bold: true, align: index === 0 ? "left" : "right" });
    columnX += widths[index];
  });
  rows.forEach((row, index) => {
    const rowY = y + headerHeight + index * rowHeight;
    const isTotal = index === rows.length - 1;
    doc.setFillColor(isTotal ? "#f3e8ff" : index % 2 === 0 ? "#f8fafc" : "#ffffff");
    doc.rect(x, rowY, width, rowHeight, "F");
    columnX = x;
    row.forEach((value, column) => {
      text(doc, value, column === 0 ? columnX + 3 : columnX + widths[column] - 3, rowY + 4.8, { size: 8.5, bold: isTotal, align: column === 0 ? "left" : "right" });
      columnX += widths[column];
    });
  });
};

export const reportPdfFilename = (siteName, generatedAt) => {
  const brand = safeText(siteName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "marketplace";
  return `${brand}-reports-${generatedAt.toISOString().slice(0, 10)}.pdf`;
};

export const createAdminReportPdf = (report, siteName) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `${safeText(siteName)} - Platform report`, subject: "Six-month administrative report", author: safeText(siteName) });
  doc.setCreationDate(report.generatedAt);
  header(doc, report, siteName, "Platform overview");

  const summary = report.sections.filter((section) => section.total != null);
  summary.forEach((section, index) => {
    const x = LEFT + (index % 3) * 61;
    const y = 56 + Math.floor(index / 3) * 30;
    doc.setFillColor("#f8f5fc");
    doc.roundedRect(x, y, 56, 25, 2, 2, "F");
    text(doc, section.title, x + 5, y + 7, { size: 8, color: MUTED });
    const label = section.currency ? amount(section.total) : count(section.total);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const size = Math.min(15, 15 * 46 / Math.max(46, doc.getTextWidth(label)));
    text(doc, label, x + 5, y + 18, { size, bold: true, color: BRAND });
  });
  const revenue = report.sections.find((section) => section.key === "revenue");
  chart(doc, revenue, LEFT, 119, WIDTH, 78);
  text(doc, "Subscription revenue by month", LEFT, 207, { size: 10, bold: true });
  const revenueRows = revenue.data.map((row, index) => [report.months[index].fullLabel, amount(row.values.revenue)]);
  table(doc, ["Month", "Revenue (GHS)"], [...revenueRows, ["Total", amount(revenue.total)]], LEFT, 214, [65, 113]);

  doc.addPage();
  header(doc, report, siteName, "Monthly trends");
  report.sections.filter((section) => section.key !== "revenue").forEach((section, index) => chart(doc, section, LEFT + (index % 2) * 92, 56 + Math.floor(index / 2) * 73, 86, 66));

  doc.addPage();
  header(doc, report, siteName, "Monthly detail & subscription status");
  text(doc, "Account, property and inquiry activity", LEFT, 59, { size: 11, bold: true });
  const keys = ["users", "agents", "listings", "subscriptions", "inquiries"];
  const sections = keys.map((key) => report.sections.find((section) => section.key === key));
  const rows = report.months.map((month, index) => [month.fullLabel, ...sections.map((section) => count(section.data[index].values[section.totalKey]))]);
  table(doc, ["Month", "Customers", "Agents", "Listings", "Subscriptions", "Inquiries"], [...rows, ["Total", ...sections.map((section) => count(section.total))]], LEFT, 65, [29, 29, 24, 27, 39, 30]);

  text(doc, "Agent property submissions and approvals", LEFT, 137, { size: 11, bold: true });
  const approvals = report.sections.find((section) => section.key === "approvals");
  const approvalRows = approvals.data.map((row, index) => [report.months[index].fullLabel, count(row.values.submitted), count(row.values.approved)]);
  table(doc, ["Month", "Submitted", "Approved"], [...approvalRows, ["Total", count(sumReportValues(approvals.data, "submitted")), count(sumReportValues(approvals.data, "approved"))]], LEFT, 143, [65, 57, 56]);

  text(doc, "Current subscription status", LEFT, 215, { size: 11, bold: true });
  text(doc, "Snapshot at generation time; not limited to the six-month period.", LEFT, 222, { size: 8, color: MUTED });
  const statusTotal = report.statuses.reduce((sum, status) => sum + status.value, 0);
  doc.setFillColor("#f1f5f9");
  doc.rect(LEFT, 228, WIDTH, 4, "F");
  let statusX = LEFT;
  report.statuses.forEach((status, index) => {
    const width = statusTotal ? WIDTH * status.value / statusTotal : 0;
    if (width) { doc.setFillColor(status.color); doc.rect(statusX, 228, width, 4, "F"); }
    statusX += width;
    const x = LEFT + index * 44.5;
    text(doc, status.label, x, 241, { size: 9, color: MUTED });
    text(doc, `${count(status.value)} (${statusTotal ? Math.round(status.value / statusTotal * 100) : 0}%)`, x, 249, { size: 12, bold: true });
  });
  text(doc, `Agents without a subscription: ${report.agentsWithoutSubscription}.`, LEFT, 259, { size: 8, color: MUTED });
  text(doc, "Revenue and subscription growth include paid subscriptions only. Current month is partial. Approvals use the review date, falling back to the listing creation date.", LEFT, 267, { size: 8, color: MUTED, width: WIDTH });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(BORDER);
    doc.line(LEFT, 281, LEFT + WIDTH, 281);
    text(doc, "Platform report | Amounts in Ghana cedis (GHS)", LEFT, 287, { size: 8, color: MUTED });
    text(doc, `${page} / ${pages}`, LEFT + WIDTH, 287, { size: 8, color: MUTED, align: "right" });
  }
  return doc;
};

export const downloadAdminReport = async (report, siteName) => {
  const doc = createAdminReportPdf(report, siteName);
  await doc.save(reportPdfFilename(siteName, report.generatedAt), { returnPromise: true });
};
