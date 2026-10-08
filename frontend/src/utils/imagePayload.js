const IMAGE_KEYS = new Set(["images", "image", "profileImage", "agencyLogo", "logo", "logoDark", "favicon"]);
const DIRECT_IMAGE_ENDPOINTS = new Set(["/uploads/image", "/auth/customer/me/photo"]);

// These endpoints handle the actual image data themselves. Sending customer
// photos through the generic owner upload route would reject the customer session.
export const prepareRequestImagePayload = async (config, upload) => {
  if (DIRECT_IMAGE_ENDPOINTS.has(config.url) || !["post", "put", "patch"].includes(config.method) || !config.data || typeof config.data !== "object" || config.data instanceof FormData) return config.data;
  return prepareImagePayload(config.data, upload);
};

// Keep each upload below the function payload limit, then save only cloud URLs.
// The input form is never mutated, so failed saves retain all edits and previews.
export const prepareImagePayload = async (payload, upload) => {
  const uploaded = new Map();
  const visit = async (value, key) => {
    if (typeof value === "string" && IMAGE_KEYS.has(key) && value.startsWith("data:image/")) {
      if (!uploaded.has(value)) uploaded.set(value, upload(value));
      return uploaded.get(value);
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await visit(item, key));
      return result;
    }
    if (value && typeof value === "object") {
      const result = {};
      for (const [name, item] of Object.entries(value)) result[name] = await visit(item, name);
      return result;
    }
    return value;
  };
  return visit(payload);
};
