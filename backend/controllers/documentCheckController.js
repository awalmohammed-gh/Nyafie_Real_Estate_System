import mongoose from "mongoose";
import DocumentCheck from "../models/DocumentCheck.js";
import Property from "../models/Property.js";
import { canHandleTeamRecord } from "../utils/team.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { DOCUMENT_KINDS, MAX_DOCUMENTS, OWNERSHIP_KINDS, destroyDocument, documentLink, inspectDocument, uploadDocument, LINK_MINUTES } from "../utils/propertyDocuments.js";
import { ok, fail, HttpError } from "../utils/response.js";

// What the owner and the admins see: never a file URL (links are created one at a time, on request)
const present = (check, property) => ({
  id: check ? String(check._id) : null,
  propertyId: String(property?._id || check?.property?._id || check?.property),
  propertyTitle: property?.title || check?.property?.title || "Listing removed",
  status: check?.status || "draft",
  note: check?.note || "",
  submittedAt: check?.submittedAt || null,
  reviewedAt: check?.reviewedAt || null,
  verifiedAt: (property || check?.property)?.documentsVerifiedAt || null,
  documents: (check?.documents || []).map((d) => ({ id: String(d._id), kind: d.kind, kindLabel: DOCUMENT_KINDS[d.kind] || d.kind, name: d.name, format: d.format, bytes: d.bytes, uploadedAt: d.uploadedAt })),
});

// The signed-in agent's own sale listing (or their agency's, as their team role allows)
const loadOwnSaleListing = async (req) => {
  const property = mongoose.isValidObjectId(req.params.id) ? await Property.findById(req.params.id) : null;
  if (!property || property.ownerType !== "agent" || !canHandleTeamRecord(property, req.user)) throw new HttpError(404, "Property not found.");
  if (property.listingType !== "Sale") throw new HttpError(400, "Document checks are for properties for sale.");
  return property;
};

// The check to change, created on first use. Only drafts and rejected checks can be edited.
const editableCheck = async (property) => {
  const check = await DocumentCheck.findOneAndUpdate({ property: property._id }, { $setOnInsert: { owner: property.owner, status: "draft" } }, { upsert: true, returnDocument: "after" });
  if (check.status === "pending") throw new HttpError(409, "Your documents are being checked. You can change them once the check is finished.");
  if (check.status === "verified") throw new HttpError(409, "These documents are verified. Choose “Update documents” first; the badge is removed until they're checked again.");
  return check;
};

// GET /api/properties/:id/documents
export const getDocuments = async (req, res) => {
  const property = await loadOwnSaleListing(req);
  ok(res, present(await DocumentCheck.findOne({ property: property._id }), property));
};

// POST /api/properties/:id/documents { kind, name, file (data URI) }
export const addDocument = async (req, res) => {
  const property = await loadOwnSaleListing(req);
  const kind = String(req.body.kind || "");
  if (!Object.hasOwn(DOCUMENT_KINDS, kind)) return fail(res, 400, "Choose what kind of document this is.");
  const name = String(req.body.name || DOCUMENT_KINDS[kind]).trim().slice(0, 120) || DOCUMENT_KINDS[kind];
  const { bytes } = inspectDocument(req.body.file);
  const check = await editableCheck(property);
  if (check.documents.length >= MAX_DOCUMENTS) return fail(res, 400, `You can add up to ${MAX_DOCUMENTS} documents. Remove one first.`);

  let stored;
  try { stored = await uploadDocument(req.body.file, property._id); }
  catch (error) {
    console.error("Document upload failed:", error.message);
    return fail(res, 502, "The document couldn't be uploaded. Please try again.");
  }
  // Only added if the check is still editable and has room (two uploads at once can't exceed the limit)
  const updated = await DocumentCheck.findOneAndUpdate(
    { _id: check._id, status: { $in: ["draft", "rejected"] }, [`documents.${MAX_DOCUMENTS - 1}`]: { $exists: false } },
    { $push: { documents: { kind, name, ...stored, bytes, uploadedBy: req.user._id } } },
    { returnDocument: "after" },
  );
  if (!updated) {
    await destroyDocument(stored);
    return fail(res, 409, "Your documents changed meanwhile. Refresh and try again.");
  }
  ok(res, present(updated, property), "Document added", 201);
};

// DELETE /api/properties/:id/documents/:docId
export const removeDocument = async (req, res) => {
  const property = await loadOwnSaleListing(req);
  const check = await editableCheck(property);
  const document = check.documents.id(req.params.docId);
  if (!document) return fail(res, 404, "Document not found.");
  const updated = await DocumentCheck.findOneAndUpdate({ _id: check._id, status: { $in: ["draft", "rejected"] } }, { $pull: { documents: { _id: document._id } } }, { returnDocument: "after" });
  if (!updated) return fail(res, 409, "Your documents changed meanwhile. Refresh and try again.");
  await destroyDocument(document);
  ok(res, present(updated, property), "Document removed");
};

// POST /api/properties/:id/documents/submit -> waits for an admin
export const submitDocuments = async (req, res) => {
  const property = await loadOwnSaleListing(req);
  const check = await editableCheck(property);
  if (!check.documents.some((d) => OWNERSHIP_KINDS.includes(d.kind))) return fail(res, 400, "Add a land title certificate or an indenture before submitting.");
  const updated = await DocumentCheck.findOneAndUpdate({ _id: check._id, status: { $in: ["draft", "rejected"] } }, { $set: { status: "pending", submittedAt: new Date(), note: "" } }, { returnDocument: "after" });
  if (!updated) return fail(res, 409, "Your documents changed meanwhile. Refresh and try again.");
  await notifyAdmins({ type: "documents", title: "Documents to check", message: `${req.user.firstName} ${req.user.lastName} submitted ${updated.documents.length} document(s) for "${property.title}".`, link: "/admin/document-checks" });
  ok(res, present(updated, property), "Documents submitted for checking");
};

// POST /api/properties/:id/documents/reopen -> a verified check can be changed again (the badge is removed)
export const reopenDocuments = async (req, res) => {
  const property = await loadOwnSaleListing(req);
  const updated = await DocumentCheck.findOneAndUpdate({ property: property._id, status: "verified" }, { $set: { status: "draft" } }, { returnDocument: "after" });
  if (!updated) return fail(res, 409, "Only verified documents need reopening.");
  await Property.updateOne({ _id: property._id }, { $set: { documentsVerifiedAt: null } });
  property.documentsVerifiedAt = null;
  ok(res, present(updated, property), "You can change the documents now");
};

// GET /api/properties/:id/documents/:docId/link -> the owner opens one of their own documents
export const ownerDocumentLink = async (req, res) => {
  const property = await loadOwnSaleListing(req);
  const check = await DocumentCheck.findOne({ property: property._id });
  const document = check?.documents.id(req.params.docId);
  if (!document) return fail(res, 404, "Document not found.");
  res.set("Cache-Control", "no-store");
  ok(res, { url: documentLink(document), expiresInMinutes: LINK_MINUTES });
};

// ---------- Admin ----------

// GET /api/admin/document-checks?status=pending|verified|rejected|all -> oldest pending first
export const listDocumentChecks = async (req, res) => {
  const status = ["pending", "verified", "rejected"].includes(req.query.status) ? req.query.status : req.query.status === "all" ? null : "pending";
  const checks = await DocumentCheck.find(status ? { status } : { status: { $ne: "draft" } })
    .sort(status === "pending" ? { submittedAt: 1 } : { updatedAt: -1 })
    .limit(300)
    .populate("property", "title location price status documentsVerifiedAt")
    .populate("owner", "firstName lastName email phone agentApplication.companyName")
    .populate("reviewedBy", "firstName lastName");
  ok(res, checks.map((check) => ({
    ...present(check),
    location: [check.property?.location?.address, check.property?.location?.neighbourhood, check.property?.location?.city].filter(Boolean).join(", "),
    price: check.property?.price ?? null,
    owner: check.owner ? { id: String(check.owner._id), name: `${check.owner.firstName} ${check.owner.lastName}`, email: check.owner.email, phone: check.owner.phone, company: check.owner.agentApplication?.companyName || "" } : null,
    reviewedBy: check.reviewedBy ? `${check.reviewedBy.firstName} ${check.reviewedBy.lastName}` : null,
  })));
};

// GET /api/admin/document-checks/:id/documents/:docId/link
export const adminDocumentLink = async (req, res) => {
  const check = mongoose.isValidObjectId(req.params.id) ? await DocumentCheck.findById(req.params.id) : null;
  const document = check?.documents.id(req.params.docId);
  if (!document) return fail(res, 404, "Document not found.");
  res.set("Cache-Control", "no-store");
  ok(res, { url: documentLink(document), expiresInMinutes: LINK_MINUTES });
};

/**
 * PATCH /api/admin/document-checks/:id { decision: verify|reject, note }
 * verify: the listing shows "Documents checked". reject: the owner is told what to fix (note required).
 */
export const reviewDocumentCheck = async (req, res) => {
  const { decision } = req.body;
  const note = String(req.body.note || "").trim().slice(0, 1000);
  if (!["verify", "reject"].includes(decision)) return fail(res, 400, "Choose verify or reject.");
  if (decision === "reject" && note.length < 10) return fail(res, 400, "Tell the owner what's missing or wrong (at least 10 characters).");
  const now = new Date();
  const check = mongoose.isValidObjectId(req.params.id)
    ? await DocumentCheck.findOneAndUpdate({ _id: req.params.id, status: "pending" }, { $set: { status: decision === "verify" ? "verified" : "rejected", note, reviewedAt: now, reviewedBy: req.user._id } }, { returnDocument: "after" })
    : null;
  if (!check) return fail(res, 409, "This check was already reviewed, or it doesn't exist. Refresh the list.");
  const property = await Property.findByIdAndUpdate(check.property, { $set: { documentsVerifiedAt: decision === "verify" ? now : null } }, { returnDocument: "after" });
  await notifyUser(check.owner, decision === "verify"
    ? { type: "documents", title: "Documents verified", message: `"${property?.title}" now shows “Documents checked” to buyers.`, link: `/agent/properties/${check.property}` }
    : { type: "documents", title: "Documents need attention", message: `We couldn't verify the documents for "${property?.title}": ${note}`, link: `/agent/properties/${check.property}` });
  ok(res, present(check, property), decision === "verify" ? "Documents verified" : "Owner asked to fix the documents");
};

export const pendingDocumentCheckCount = () => DocumentCheck.countDocuments({ status: "pending" });
