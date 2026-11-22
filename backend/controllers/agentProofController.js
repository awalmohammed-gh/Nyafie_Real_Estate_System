import mongoose from "mongoose";
import User from "../models/User.js";
import {
  inspectDocument,
  uploadDocument,
  destroyDocument,
  documentLink,
  LINK_MINUTES,
} from "../utils/propertyDocuments.js";
import { ok, fail } from "../utils/response.js";

// Agents and agencies prove their trade; property owners listing their own homes prove who they are
// and that the property is theirs. Every lister is checked by an admin before anything can go live.
export const AGENT_PROOF_KINDS = Object.freeze({
  professional_certificate: "Professional registration or licence",
  agency_authorization: "Agency authorization or employment letter",
  business_registration: "Agency / company registration certificate",
  national_id: "Ghana Card or passport",
  ownership_proof: "Proof of ownership (land title, indenture or site plan)",
});
const MAX_PROOFS = 4;
const present = (user) => ({
  agentId: String(user._id),
  // Proof is deleted as soon as an admin has reviewed it (approved or rejected): when that happened
  reviewedAt: user.agentApplication?.proofReviewedAt || null,
  editable: user.isActive === true && (
    ["incomplete", "rejected"].includes(
      user.agentApplication?.status || "incomplete",
    ) ||
    (user.agentApplication?.status === "pending" &&
      !user.agentApplication.proofCount)),
  documents: (user.agentApplication?.proofDocuments || []).map((doc) => ({
    id: String(doc._id),
    kind: doc.kind,
    kindLabel: AGENT_PROOF_KINDS[doc.kind],
    name: doc.name,
    bytes: doc.bytes,
    format: doc.format,
    uploadedAt: doc.uploadedAt,
  })),
});
const ownFilter = (id) => ({ _id: id, role: "agent", isActive: true });
const editableFilter = (id) => ({
  ...ownFilter(id),
  $or: [
    { "agentApplication.status": { $in: ["incomplete", "rejected"] } },
    { "agentApplication.status": { $exists: false } },
    {
      "agentApplication.status": "pending",
      "agentApplication.proofCount": { $in: [0, null] },
    },
  ],
});
const load = (id) =>
  User.findById(id).select("+agentApplication.proofDocuments");

export const getAgentProofs = async (req, res) => {
  const user = await load(req.user._id);
  ok(res, present(user));
};

export const addAgentProof = async (req, res) => {
  const kind = req.body?.kind;
  if (!Object.hasOwn(AGENT_PROOF_KINDS, kind || ""))
    return fail(res, 400, "Choose a professional proof document type.");
  const { bytes } = inspectDocument(req.body.file);
  const user = await load(req.user._id);
  if (!present(user).editable)
    return fail(
      res,
      409,
      "Your application is being reviewed or has already been approved. Documents are locked.",
    );
  if (user.agentApplication?.proofCount >= MAX_PROOFS)
    return fail(
      res,
      400,
      "You can upload up to 4 proof documents. Remove one first.",
    );
  const name =
    typeof req.body.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  let stored;
  try {
    stored = await uploadDocument(req.body.file, `agent-proof/${req.user._id}`);
  } catch {
    return fail(
      res,
      502,
      "Your proof document could not be uploaded. Please try again.",
    );
  }
  let updated;
  try {
    updated = await User.findOneAndUpdate(
      {
        ...editableFilter(req.user._id),
        $and: [
          {
            $or: [
              { "agentApplication.proofCount": { $lt: MAX_PROOFS } },
              { "agentApplication.proofCount": { $exists: false } },
            ],
          },
        ],
      },
      {
        $push: {
          "agentApplication.proofDocuments": {
            kind,
            name: name || AGENT_PROOF_KINDS[kind],
            ...stored,
            bytes,
          },
        },
        $inc: { "agentApplication.proofCount": 1 },
        $set: { "agentApplication.status": "incomplete" },
      },
      { returnDocument: "after", runValidators: true },
    ).select("+agentApplication.proofDocuments");
  } catch (error) {
    await destroyDocument(stored);
    throw error;
  }
  if (!updated) {
    await destroyDocument(stored);
    return fail(
      res,
      409,
      "Your application changed during upload. Refresh and try again.",
    );
  }
  ok(res, present(updated), "Proof document uploaded", 201);
};

export const removeAgentProof = async (req, res) => {
  const user = await load(req.user._id);
  const doc = user.agentApplication?.proofDocuments.id(req.params.docId);
  if (!doc) return fail(res, 404, "Document not found.");
  const updated = await User.findOneAndUpdate(
    {
      ...editableFilter(req.user._id),
      "agentApplication.proofDocuments._id": doc._id,
    },
    {
      $pull: { "agentApplication.proofDocuments": { _id: doc._id } },
      $inc: { "agentApplication.proofCount": -1 },
    },
    { returnDocument: "after", runValidators: true },
  ).select("+agentApplication.proofDocuments");
  if (!updated)
    return fail(
      res,
      409,
      "These documents cannot be changed while the application is under review.",
    );
  await destroyDocument(doc);
  ok(res, present(updated), "Proof document removed");
};

export const agentProofLink = async (req, res) => {
  const id = req.params.agentId || req.user._id;
  const user = mongoose.isValidObjectId(id) ? await load(id) : null;
  const doc =
    user?.role === "agent" &&
    user.agentApplication?.proofDocuments.id(req.params.docId);
  if (!doc) return fail(res, 404, "Document not found.");
  res.set("Cache-Control", "private, no-store");
  ok(res, { url: documentLink(doc), expiresInMinutes: LINK_MINUTES });
};

export const adminAgentProofs = async (req, res) => {
  const user = mongoose.isValidObjectId(req.params.agentId)
    ? await load(req.params.agentId)
    : null;
  if (!user || user.role !== "agent") return fail(res, 404, "Agent not found.");
  res.set("Cache-Control", "private, no-store");
  ok(res, present(user));
};
