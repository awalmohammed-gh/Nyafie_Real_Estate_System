import { cloudinary } from "../config/cloudinary.js";
import DocumentCheck from "../models/DocumentCheck.js";
import Property from "../models/Property.js";
import { HttpError } from "./response.js";

// What an owner can submit for a sale listing. One of the ownership documents is required.
export const DOCUMENT_KINDS = Object.freeze({
  land_title: "Land title certificate",
  indenture: "Indenture (deed of conveyance)",
  search_report: "Lands Commission search report",
  site_plan: "Site plan",
  building_permit: "Building permit",
  other: "Other supporting document",
});
export const OWNERSHIP_KINDS = ["land_title", "indenture"];
export const MAX_DOCUMENTS = 8;
export const MAX_DOCUMENT_BYTES = 3_000_000; // base64 adds a third: still under the 4 MB request body limit
export const LINK_MINUTES = 10;

// The file type from its first bytes (never from the name or the declared type)
const SIGNATURES = [
  ["pdf", (b) => b.subarray(0, 5).toString("ascii") === "%PDF-"],
  ["jpg", (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  ["png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["webp", (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"],
];
const MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Checks a data URI and returns { format, bytes }, or throws a 400/413 the owner can act on. */
export const inspectDocument = (file) => {
  const match = typeof file === "string" && /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z\d+/]+={0,2})$/.exec(file);
  if (!match) throw new HttpError(400, "Choose a PDF or a photo (JPG, PNG or WebP).");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new HttpError(413, "Each document must be smaller than 3 MB. Scan it at a lower resolution or as a PDF.");
  const format = SIGNATURES.find(([, test]) => test(bytes))?.[0];
  if (!format || MIME[format] !== match[1].replace("image/jpg", "image/jpeg")) throw new HttpError(400, "This file isn't a valid PDF or photo.");
  return { format, bytes: bytes.length };
};

// Stored as a private image asset (Cloudinary handles PDFs as images too); only the id is kept
export const uploadDocument = async (file, propertyId) => {
  const result = await cloudinary.uploader.upload(file, { type: "private", resource_type: "image", folder: `nyafie/documents/${propertyId}`, overwrite: false });
  return { publicId: result.public_id, format: result.format };
};

// A download link that stops working after LINK_MINUTES
export const documentLink = (document) =>
  cloudinary.utils.private_download_url(document.publicId, document.format, { resource_type: "image", type: "private", expires_at: Math.floor(Date.now() / 1000) + LINK_MINUTES * 60 });

export const destroyDocument = (document) =>
  cloudinary.uploader.destroy(document.publicId, { type: "private", resource_type: "image", invalidate: true }).catch((error) => console.error("Document delete failed:", error.message));

/**
 * Deletes the document checks matching `filter` and their files (e.g. a deleted listing, or an
 * agent's listings when the agent is permanently deleted). Files are removed best-effort.
 */
export const deleteDocumentChecks = async (filter) => {
  const checks = await DocumentCheck.find(filter).select("property documents");
  if (!checks.length) return 0;
  await Promise.all(checks.flatMap((check) => check.documents.map(destroyDocument)));
  await Promise.all([
    DocumentCheck.deleteMany({ _id: { $in: checks.map((c) => c._id) } }),
    Property.updateMany({ _id: { $in: checks.map((c) => c.property) } }, { $set: { documentsVerifiedAt: null } }),
  ]);
  return checks.length;
};
