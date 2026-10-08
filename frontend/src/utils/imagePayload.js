const IMAGE_KEYS = new Set(["images", "image", "profileImage", "agencyLogo", "logo", "logoDark", "favicon"]);

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
