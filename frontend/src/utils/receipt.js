// How a receipt reads (on screen in components/receipts/ReceiptCard.jsx and in the PDF, utils/receiptPdf.js)
export const receiptAmount = (value) => `GHS ${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const receiptDate = (value) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/** [label, value] rows, in the order the receipt shows them (also used on screen) */
export const receiptRows = (receipt) => [
  ["Receipt number", receipt.number],
  ["Received from", receipt.customerName],
  ["For", receipt.description],
  ["Amount", receiptAmount(receipt.amount)],
  ["Paid", receipt.method],
  ...(receipt.paymentReference ? [["Payment reference", receipt.paymentReference]] : []),
  ["Date", receiptDate(receipt.issuedAt)],
  ["Received by", `${receipt.issuedByName}, ${receipt.business}`],
  ...(receipt.businessAddress ? [["Address", receipt.businessAddress]] : []),
  ...(receipt.businessPhone ? [["Phone", receipt.businessPhone]] : []),
  ...(receipt.note ? [["Note", receipt.note]] : []),
];
