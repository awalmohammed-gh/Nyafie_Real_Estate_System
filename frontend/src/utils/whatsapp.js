import { formatType, statusLabel } from "./property";

// Digits only, in international format (Ghana numbers starting with 0 get 233)
export const toWhatsAppNumber = (phone = "") => {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
};

const priceText = (property) => {
  const { amount, perMonth, perNight, currency = "GHS" } = property.pricing;
  const value = amount ?? perMonth ?? perNight ?? 0;
  const period = amount != null ? "" : perNight != null ? " per night" : " per month";
  return `${currency} ${Number(value).toLocaleString()}${period}`;
};

// The pre-filled message, built from the property data
export const buildWhatsAppMessage = (property, pageUrl) =>
  [
    "Hello, I am interested in this property.",
    "",
    `Property: ${property.title}`,
    `Location: ${[property.location.name, property.location.city].filter(Boolean).join(", ")}`,
    `Price: ${priceText(property)}`,
    `Listing Type: ${statusLabel(property.property.status)}`,
    `Property Type: ${formatType(property.property.type)}`,
    `Property ID: ${property.id}`,
    pageUrl ? `Link: ${pageUrl}` : null,
    "",
    "I would like to know more about this property.",
  ]
    .filter((line) => line !== null)
    .join("\n");

// wa.me links open the WhatsApp app on phones and WhatsApp Web / Desktop on computers
export const buildWhatsAppLink = (phone, property, pageUrl) => {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsAppMessage(property, pageUrl))}`;
};
