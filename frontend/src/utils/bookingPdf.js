import { jsPDF } from "jspdf";
import { bookingRows } from "./bookingPass";

// A stay's booking pass as a one-page PDF, to show at the hotel (loaded on demand from BookingPass.jsx)
const safeText = (value) => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();

export const downloadBookingPass = (booking, siteName) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const write = (value, x, y, { size = 10, bold = false, color = "#1e293b", align = "left", width } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = width ? doc.splitTextToSize(safeText(value), width) : [safeText(value)];
    doc.text(lines, x, y, { align });
    return lines.length;
  };
  write(siteName, 18, 22, { size: 14, bold: true, color: "#3e0766" });
  write("BOOKING PASS", 192, 22, { size: 9, color: "#64748b", align: "right" });
  write("Show this booking code when you arrive", 18, 38, { size: 11, color: "#64748b" });
  write(booking.bookingCode, 18, 54, { size: 30, bold: true });
  let y = 72;
  for (const [label, value] of bookingRows(booking)) {
    write(label, 18, y, { size: 9, color: "#64748b" });
    y += 7 * Math.max(1, write(value, 70, y, { size: 10, bold: true, width: 120 }));
  }
  write("If your arrival time changes, update it in your account so they know when to expect you.", 18, y + 8, { size: 8, color: "#64748b", width: 170 });
  doc.save(`booking-${safeText(booking.bookingCode)}.pdf`);
};
