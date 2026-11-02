import nodemailer from "nodemailer";
import { HttpError } from "./response.js";

export const smtpOptions = () => {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new HttpError(503, "Email delivery is temporarily unavailable. Please try again later.");
  return {
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user, pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  };
};

// Exported object makes it possible to test delivery failures without sending real mail.
export const verificationMailer = {
  async send(email, code) {
    const options = smtpOptions();
    const transport = nodemailer.createTransport(options);
    const result = await transport.sendMail({
      from: { name: "NyaFie", address: options.auth.user },
      to: email,
      subject: "Verify your Nya Fie email address",
      text: `Your NyaFie verification code is ${code}.\n\nThis code expires in 10 minutes. Enter it in the tab where you signed up or signed in. Never share this code.\n\nIf you did not request this, you can ignore this email.`,
    });
    if (!result.accepted?.length) throw new Error("SMTP did not accept the recipient");
  },
};

export const passwordResetMailer = {
  async send(email, code) {
    const options = smtpOptions();
    const transport = nodemailer.createTransport(options);
    const result = await transport.sendMail({
      from: { name: "Nya Fie", address: options.auth.user },
      to: email,
      subject: "Reset your NyaFie password",
      text: `Your NyaFie password reset code is ${code}.\n\nThis code expires in 10 minutes. Enter it on the password recovery screen to choose a new password. Never share this code.\n\nIf you did not request a password reset, ignore this email. Your password has not changed.`,
    });
    if (!result.accepted?.length) throw new Error("SMTP did not accept the recipient");
  },
};
