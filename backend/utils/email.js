import nodemailer from "nodemailer";
import { HttpError } from "./response.js";
import { siteName } from "../models/Setting.js";
import { escapeHtml } from "./seo.js";

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const UNAVAILABLE = "Email delivery is temporarily unavailable. Please try again later.";
const SAFETY = {
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  disableFileAccess: true, disableUrlAccess: true,
};

/**
 * Which mail server sends the site's emails (verification and password reset codes):
 *  - An email provider over SMTP, recommended for production (Brevo, Resend, Mailgun, SendGrid,
 *    Postmark, Amazon SES...), sending from your own domain:
 *      EMAIL_SMTP_HOST, EMAIL_SMTP_PORT (587 by default; 465 for implicit TLS),
 *      EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD, EMAIL_FROM (e.g. no-reply@yourdomain.com)
 *  - Otherwise Gmail: SMTP_USER and SMTP_APP_PASSWORD (sends from that Gmail address).
 * Returns the nodemailer transport options plus `from`, the sender address.
 */
export const smtpOptions = () => {
  const host = process.env.EMAIL_SMTP_HOST?.trim();
  if (host) {
    const port = Number(process.env.EMAIL_SMTP_PORT?.trim() || 587);
    const user = process.env.EMAIL_SMTP_USER?.trim();
    const pass = process.env.EMAIL_SMTP_PASSWORD?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!user || !pass || !ADDRESS.test(from || "") || !Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(503, UNAVAILABLE);
    // Port 465 is TLS from the start; other ports must upgrade with STARTTLS (never plain text)
    return { host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass }, from, ...SAFETY };
  }
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new HttpError(503, UNAVAILABLE);
  return { host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass }, from: user, ...SAFETY };
};

// At startup: new accounts can only be finished with an emailed code, so a missing or incomplete mail
// setup is reported loudly (browsing keeps working; sign-up and password reset can't until it's fixed)
export const emailConfigProblem = () => {
  try { smtpOptions(); return ""; }
  catch {
    return process.env.EMAIL_SMTP_HOST?.trim()
      ? "EMAIL_SMTP_HOST is set, but EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD, EMAIL_FROM or EMAIL_SMTP_PORT is missing or invalid."
      : "Set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD and EMAIL_FROM (an email provider), or SMTP_USER and SMTP_APP_PASSWORD (Gmail).";
  }
};

// A short, plain HTML version alongside the text: better delivery and readability in mail apps
const codeEmailHtml = ({ name, heading, intro, code, note }) => `<!doctype html><html><body style="margin:0;background:#f6f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#5b21b6">${escapeHtml(name)}</td></tr>
<tr><td style="padding-top:20px;font-size:18px;font-weight:bold">${escapeHtml(heading)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:22px">${escapeHtml(intro)}</td></tr>
<tr><td style="padding:24px 0;font-size:32px;font-weight:bold;letter-spacing:8px;color:#111827">${escapeHtml(code)}</td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(note)}</td></tr>
</table></td></tr></table></body></html>`;

const send = async ({ to, subject, text, html }) => {
  const { from, ...options } = smtpOptions();
  const transport = nodemailer.createTransport(options);
  const result = await transport.sendMail({ from: { name: siteName(), address: from }, to, subject, text, html });
  if (!result.accepted?.length) throw new Error("SMTP did not accept the recipient");
};

// Exported objects make it possible to test delivery failures without sending real mail.
export const verificationMailer = {
  async send(email, code) {
    const name = siteName();
    const note = "Never share this code. If you did not request it, you can ignore this email.";
    await send({
      to: email,
      subject: `Verify your ${name} email address`,
      text: `Your ${name} verification code is ${code}.\n\nThis code expires in 10 minutes. Enter it in the tab where you signed up or signed in. Never share this code.\n\nIf you did not request this, you can ignore this email.`,
      html: codeEmailHtml({ name, heading: "Verify your email address", intro: "Enter this code in the tab where you signed up or signed in. It expires in 10 minutes.", code, note }),
    });
  },
};

export const passwordResetMailer = {
  async send(email, code) {
    const name = siteName();
    await send({
      to: email,
      subject: `Reset your ${name} password`,
      text: `Your ${name} password reset code is ${code}.\n\nThis code expires in 10 minutes. Enter it on the password recovery screen to choose a new password. Never share this code.\n\nIf you did not request a password reset, ignore this email. Your password has not changed.`,
      html: codeEmailHtml({ name, heading: "Reset your password", intro: "Enter this code on the password recovery screen to choose a new password. It expires in 10 minutes.", code, note: "Never share this code. If you did not request a password reset, ignore this email: your password has not changed." }),
    });
  },
};

// A new listing matched one of a customer's saved searches
export const searchAlertMailer = {
  async send(email, { searchName, title, price, place, url, manageUrl }) {
    const name = siteName();
    const details = [price, place].filter(Boolean).join(" · ");
    await send({
      to: email,
      subject: `New match for your saved search: ${title}`.slice(0, 150),
      text: `A new home matches your saved search "${searchName}" on ${name}:\n\n${title}\n${details}\n\nView it: ${url}\n\nManage your saved searches and alerts: ${manageUrl}`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#5b21b6">${escapeHtml(name)}</td></tr>
<tr><td style="padding-top:20px;font-size:15px;line-height:22px">A new home matches your saved search <strong>${escapeHtml(searchName)}</strong>:</td></tr>
<tr><td style="padding-top:16px;font-size:18px;font-weight:bold">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:4px;font-size:15px;color:#4b5563">${escapeHtml(details)}</td></tr>
<tr><td style="padding:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">View the home</a></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#6b7280">You get this email because you saved this search. <a href="${escapeHtml(manageUrl)}" style="color:#6b7280">Manage your saved searches and alerts</a>.</td></tr>
</table></td></tr></table></body></html>`,
    });
  },
};

// A receipt for a payment the customer made to an agent, agency or hotel (utils/receipts.js)
export const receiptMailer = {
  async send(email, receipt) {
    const name = siteName();
    const amount = `GHS ${Number(receipt.amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const issued = new Date(receipt.issuedAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });
    const rows = [
      ["Receipt number", receipt.number],
      ["Received from", receipt.customerName],
      ["For", receipt.description],
      ["Amount", amount],
      ["Paid", receipt.method],
      ...(receipt.paymentReference ? [["Payment reference", receipt.paymentReference]] : []),
      ["Date", issued],
      ["Received by", `${receipt.issuedByName}, ${receipt.business}`],
      ...(receipt.businessAddress ? [["Address", receipt.businessAddress]] : []),
      ...(receipt.businessPhone ? [["Phone", receipt.businessPhone]] : []),
      ...(receipt.note ? [["Note", receipt.note]] : []),
    ];
    await send({
      to: email,
      subject: `Your receipt ${receipt.number} from ${receipt.business}`.slice(0, 150),
      text: `${receipt.business} received your payment.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nKeep this receipt. You can also see it in your ${name} account. If you didn't make this payment, contact ${name} straight away.`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#5b21b6">${escapeHtml(name)}</td></tr>
<tr><td style="padding-top:20px;font-size:18px;font-weight:bold">Payment receipt</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:22px">${escapeHtml(receipt.business)} received your payment.</td></tr>
<tr><td style="padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:20px">
${rows.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`).join("\n")}
</table></td></tr>
<tr><td style="padding-top:20px;font-size:13px;line-height:20px;color:#6b7280">Keep this receipt. You can also see it in your ${escapeHtml(name)} account. If you didn't make this payment, contact ${escapeHtml(name)} straight away.</td></tr>
</table></td></tr></table></body></html>`,
    });
  },
};

// A hotel's payout account was connected, changed, cancelled or removed (controllers/hotelPayoutController.js).
// Sent to the account owner's own inbox, so a stolen session can't hide the change.
export const payoutAlertMailer = {
  async send(email, { title, message, hotel }) {
    const name = siteName();
    await send({
      to: email,
      subject: `Security alert: ${title} for ${hotel}`.slice(0, 150),
      text: `${title}\n\n${message}\n\nThis is an automatic security alert from ${name}.`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#5b21b6">${escapeHtml(name)}</td></tr>
<tr><td style="padding-top:20px;font-size:18px;font-weight:bold">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:22px">${escapeHtml(message)}</td></tr>
<tr><td style="padding-top:20px;font-size:13px;line-height:20px;color:#6b7280">This is an automatic security alert from ${escapeHtml(name)}.</td></tr>
</table></td></tr></table></body></html>`,
    });
  },
};

// The second step of an admin sign-in (controllers/adminSignInController.js)
export const adminSignInMailer = {
  async send(email, code) {
    const name = siteName();
    const note = "Never share this code. If you didn't just sign in, someone knows your admin password: change it now.";
    await send({
      to: email,
      subject: `Your ${name} admin sign-in code`,
      text: `Your ${name} admin sign-in code is ${code}.\n\nIt expires in 10 minutes. Enter it on the admin sign-in screen to finish signing in.\n\n${note}`,
      html: codeEmailHtml({ name, heading: "Admin sign-in code", intro: "Enter this code on the admin sign-in screen to finish signing in. It expires in 10 minutes.", code, note }),
    });
  },
};

// A confirmed stay (hotels and per-night rentals): what the guest shows when they arrive
export const bookingConfirmationMailer = {
  async send(email, booking) {
    const name = siteName();
    const rows = [
      ["Booking code", booking.bookingCode],
      ["Where", booking.place],
      ...(booking.room ? [["Room", booking.room]] : []),
      ["Check-in", booking.checkIn],
      ["Check-out", booking.checkOut],
      ["Arriving at", `${booking.arrivalTime} (Ghana time)`],
      ["Guest", booking.guestName],
      ["Total", booking.total],
      ["Payment", booking.payment],
    ];
    const intro = booking.paid ? "Your stay is booked and paid." : "Your stay is reserved. Nothing has been paid online: you pay when you arrive.";
    const show = "Show this booking code when you arrive. If your arrival time changes, update it in your account so they know when to expect you.";
    await send({
      to: email,
      subject: `Booking ${booking.bookingCode}: ${booking.place}`.slice(0, 150),
      text: `${intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${show}`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#5b21b6">${escapeHtml(name)}</td></tr>
<tr><td style="padding-top:20px;font-size:15px;line-height:22px">${escapeHtml(intro)}</td></tr>
<tr><td style="padding:20px 0;font-size:30px;font-weight:bold;letter-spacing:4px;color:#111827">${escapeHtml(booking.bookingCode)}</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:20px">
${rows.slice(1).map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`).join("\n")}
</table></td></tr>
<tr><td style="padding-top:20px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(show)}</td></tr>
</table></td></tr></table></body></html>`,
    });
  },
};
