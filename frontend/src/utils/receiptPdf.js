import { jsPDF } from "jspdf";
import { receiptAmount, receiptRows } from "./receipt";

// A payment receipt as a one-page PDF (loaded on demand from components/receipts/ReceiptCard.jsx)
const BRAND = "#3e0766";
const INK = "#1e293b";
const MUTED = "#64748b";
const LEFT = 18;
const RIGHT = 192;

// The built-in PDF font supports Latin text only
const safeText = (value) => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
export const downloadReceipt = (receipt, siteName) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const write = (value, x, y, { size = 10, bold = false, color = INK, align = "left", width } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    const label = safeText(value);
    const lines = width ? doc.splitTextToSize(label, width) : [label];
    doc.text(lines, x, y, { align });
    return lines.length;
  };
  write(siteName, LEFT, 22, { size: 14, bold: true, color: BRAND });
  write("PAYMENT RECEIPT", RIGHT, 22, { size: 9, color: MUTED, align: "right" });
  write(receipt.business, LEFT, 36, { size: 16, bold: true, width: 170 });
  write(`received ${receiptAmount(receipt.amount)}`, LEFT, 44, { size: 11, color: MUTED });
  let y = 58;
  for (const [label, value] of receiptRows(receipt)) {
    write(label, LEFT, y, { size: 9, color: MUTED });
    const lines = write(value, 70, y, { size: 10, bold: true, width: 120 });
    y += 7 * Math.max(1, lines);
  }
  write(`Keep this receipt. It is also in your ${siteName} account. If you didn't make this payment, contact ${siteName} straight away.`, LEFT, y + 8, { size: 8, color: MUTED, width: 170 });
  doc.save(`receipt-${safeText(receipt.number)}.pdf`);
};
