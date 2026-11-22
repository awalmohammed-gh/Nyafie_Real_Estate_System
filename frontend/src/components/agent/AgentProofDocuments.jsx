import { useEffect, useRef, useState } from "react";
import { Eye, FileText, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast } from "../../context/useToast";
import { useAuth } from "../../context/useAuth";
import * as proofs from "../../frontApi/agentApplicationApi";
import { openDocument, readFileAsDataUrl } from "../../utils/openDocument";
import { formatDate } from "../../utils/date";

const KINDS = [
  ["professional_certificate", "Professional registration or licence"],
  ["agency_authorization", "Agency authorization / employment letter"],
  ["business_registration", "Agency / company registration certificate"],
];

const AgentProofDocuments = ({
  agentId,
  onCountChange,
  onBusyChange,
  disabled = false,
}) => {
  const admin = Boolean(agentId);
  const { refreshUser } = useAuth();
  const query = useApiQuery(`agent-proof:${agentId || "self"}`, () =>
    admin ? proofs.getAdminProofDocuments(agentId) : proofs.getProofDocuments(),
  );
  const { toast } = useToast();
  const input = useRef(null);
  const [kind, setKind] = useState(KINDS[0][0]);
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState(null);
  const data = latest || query.data;
  useEffect(() => { if (data) onCountChange?.(data.documents.length); }, [data, onCountChange]);
  const setWorking = (value) => {
    setBusy(value);
    onBusyChange?.(value);
  };
  const apply = async (next) => {
    setLatest(next);
    onCountChange?.(next.documents.length);
    await refreshUser();
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > proofs.MAX_PROOF_BYTES)
      return toast({
        type: "error",
        title: "Choose a document smaller than 3 MB.",
      });
    setWorking(true);
    try {
      const result = await proofs.addProofDocument({
        kind,
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 120),
        file: await readFileAsDataUrl(file),
      });
      await apply(result);
      toast({ title: "Proof document uploaded" });
    } catch (error) {
      toast({ type: "error", title: error.message });
    } finally {
      setWorking(false);
    }
  };
  const remove = async (doc) => {
    setWorking(true);
    try {
      await apply(await proofs.removeProofDocument(doc.id));
    } catch (error) {
      toast({ type: "error", title: error.message });
    } finally {
      setWorking(false);
    }
  };
  const view = (doc) =>
    openDocument(() =>
      admin
        ? proofs.adminProofDocumentLink(agentId, doc.id)
        : proofs.proofDocumentLink(doc.id),
    ).catch((error) => toast({ type: "error", title: error.message }));

  return (
    <section
      className="rounded-2xl border border-brand-100 bg-white p-5 sm:p-7"
      aria-label="Agent proof documents"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <FileText size={23} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Professional proof documents
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {admin
              ? "Review these documents before approving the applicant. Files are private; viewing links expire after 10 minutes. They're permanently deleted as soon as you approve or reject the application."
              : "Upload at least one document showing that you work as an agent, represent an agency, or operate a registered property business. Our team must review and approve your application before your workspace opens."}
          </p>
        </div>
      </div>
      {/* What happens to the agent's documents (the server deletes them after review: agentApplicationController) */}
      {!admin && (
        <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-50 p-4 text-sm leading-6 text-brand-900">
          <Lock size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">We don't keep your documents.</strong> They're used only to confirm you're a genuine agent:
            stored privately while our team reviews your application, then permanently deleted once the review is done, whether you're
            approved or not. No copies are kept.
          </span>
        </p>
      )}
      {query.error && !data ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {query.error}{" "}
          <button type="button" onClick={query.reload} className="underline">
            Try again
          </button>
        </p>
      ) : !data ? (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 text-sm text-gray-500"
        >
          <Loader2 className="animate-spin" size={18} />
          Loading documents...
        </p>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-gray-100">
            {data.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-gray-900">
                    {doc.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {doc.kindLabel} · {doc.format.toUpperCase()} ·{" "}
                    {Math.max(1, Math.round(doc.bytes / 1000))} KB
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => view(doc)}
                    className="btn btn-light text-sm"
                  >
                    <Eye size={16} />
                    View
                  </button>
                  {!admin && data.editable && (
                    <button
                      type="button"
                      disabled={busy || disabled}
                      onClick={() => remove(doc)}
                      aria-label={`Remove ${doc.name}`}
                      className="btn btn-light text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!data.documents.length && data.reviewedAt && (
            <p role="status" className="mt-5 flex items-start gap-2.5 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
              <Lock size={17} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
              <span>
                {admin
                  ? `These documents were reviewed on ${formatDate(data.reviewedAt)} and permanently deleted.`
                  : data.editable
                    ? `Your previous documents were reviewed on ${formatDate(data.reviewedAt)} and permanently deleted. Upload your documents again to reapply.`
                    : `Your documents were reviewed on ${formatDate(data.reviewedAt)} and permanently deleted. We don't keep copies.`}
              </span>
            </p>
          )}
          {!data.documents.length && (!data.reviewedAt || data.editable) && (
            <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              {admin
                ? "No professional proof uploaded. Approval is blocked until the applicant provides a document."
                : "At least one proof document is required before you can submit your application."}
            </p>
          )}
          {!admin && data.editable && (
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Document type
                <select
                  className="field mt-2"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                  disabled={busy || disabled}
                >
                  {KINDS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                ref={input}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={upload}
                className="sr-only"
                aria-label="Upload agent proof document"
                disabled={busy || disabled}
              />
              <button
                type="button"
                disabled={busy || disabled || data.documents.length >= 4}
                onClick={() => input.current?.click()}
                className="btn btn-primary"
              >
                {busy ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Upload size={17} />
                )}
                Upload proof document
              </button>
              <p className="text-xs text-gray-500">
                PDF, JPG, PNG or WebP. Up to 4 files, 3 MB each. Do not upload
                unrelated personal documents.
              </p>
            </div>
          )}
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-gray-500">
            <Lock size={15} className="mt-0.5 shrink-0" />
            Only the applicant and authorized administrators can open these
            files. Documents are locked while the application is under review or
            approved.
          </p>
        </>
      )}
    </section>
  );
};
export default AgentProofDocuments;
