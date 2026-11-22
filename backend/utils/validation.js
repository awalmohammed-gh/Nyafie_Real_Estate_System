// Customer contact details sent with a rental or purchase request
export const validateContact = (body, { requireAddress = false } = {}) => {
  const contactName = String(body.fullName || "").trim();
  const contactEmail = String(body.email || "").trim().toLowerCase();
  const contactPhone = String(body.phone || "").trim();
  const currentAddress = String(body.currentAddress || "").trim().slice(0, 300);
  if (contactName.length < 2) return { error: "Enter your full name." };
  if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return { error: "Enter a valid email address." };
  if (contactPhone.replace(/\D/g, "").length < 9) return { error: "Enter a valid phone number." };
  if (requireAddress && currentAddress.length < 5) return { error: "Enter your current address." };
  return { contactName, contactEmail, contactPhone, currentAddress };
};

export const cleanText = (value, max = 1000) => String(value || "").trim().slice(0, max);

// Text matched literally inside a RegExp (search boxes)
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
