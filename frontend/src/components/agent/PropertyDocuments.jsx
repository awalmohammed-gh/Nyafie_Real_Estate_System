import { useRef, useState } from "react";
import { AlertCircle, BadgeCheck, Clock, Eye, FileText, Loader2, Lock, Send, Trash2, Upload } from "lucide-react";
import { Panel } from "../dashboard/Page";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useToast } from "../../context/useToast";
import { documentApi } from "../../frontApi";
import { formatDate } from "../../utils/date";
import { openDocument, readFileAsDataUrl } from "../../utils/openDocument";

const kb = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const OWNERSHIP = ["land_title", "indenture"];

/**
 * Ownership documents for a sale listing. The owner adds private files and submits them; the team
 * checks them and the listing shows "Documents checked" to buyers. The files are never public.
 */
const PropertyDocuments = ({ propertyId }) => {
  const query = useApiQuery(`documents:${propertyId}`, () => documentApi.getDocuments(propertyId));
  const run = useAsyncAction();
  const { toast } = useToast();
  const fileInput = useRef(null);
  const [kind, setKind] = useState("indenture");
  const [busy, setBusy] = useState("");
  const [removing, setRemoving] = useState(null);
  const [reopening, setReopening] = useState(false);
  const [check, setCheck] = useState(null); // latest answer from an action, until the query reloads
  const data = check?.propertyId === propertyId ? check : query.data;

  const apply = (result) => setCheck(result);
  const editable = data && ["draft", "rejected"].includes(data.status);
  const hasOwnership = data?.documents.some((d) => OWNERSHIP.includes(d.kind));

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > documentApi.MAX_DOCUMENT_BYTES) return toast({ type: "error", title: "This file is larger than 3 MB", description: "Scan it at a lower resolution, or save it as a PDF." });
    setBusy("upload");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { ok, result } = await run(documentApi.addDocument(propertyId, { kind, name: file.name.replace(/\.[^.]+$/, "").slice(0, 120), file: dataUrl }), { success: "Document added", description: file.name });
      if (ok) apply(result);
    } catch (error) {
      toast({ type: "error", title: error.message });
    }
    setBusy("");
  };
  const view = (doc) => openDocument(() => documentApi.getDocumentLink(propertyId, doc.id)).catch((error) => toast({ type: "error", title: error.message }));
  const remove = async () => {
    const doc = removing;
    setRemoving(null);
    setBusy(doc.id);
    const { ok, result } = await run(documentApi.removeDocument(propertyId, doc.id), { success: "Document removed" });
    if (ok) apply(result);
    setBusy("");
  };
  const submit = async () => {
    setBusy("submit");
    const { ok, result } = await run(documentApi.submitDocuments(propertyId), { success: "Submitted for checking", description: "We'll notify you when it's done." });
    if (ok) apply(result);
    setBusy("");
  };
  const reopen = async () => {
    setReopening(false);
    setBusy("reopen");
    const { ok, result } = await run(documentApi.reopenDocuments(propertyId), { success: "You can update the documents now", description: "The badge returns once they're checked again.", type: "info" });
    if (ok) apply(result);
    setBusy("");
  };

  const banner = data && {
    draft: { tone: "bg-gray-50 text-gray-700", Icon: FileText, text: "Add the land title certificate or indenture (plus anything else that helps, like a site plan or search report), then submit them for checking." },
    pending: { tone: "bg-amber-50 text-amber-900", Icon: Clock, text: `Submitted ${formatDate(data.submittedAt)}. Our team is checking your documents; you'll be notified when it's done.` },
    verified: { tone: "bg-emerald-50 text-emerald-900", Icon: BadgeCheck, text: `Verified ${formatDate(data.reviewedAt || data.verifiedAt)}. Buyers see “Documents checked” on this listing.` },
    rejected: { tone: "bg-red-50 text-red-800", Icon: AlertCircle, text: `We couldn't verify these documents: ${data.note || "please check them and submit again."}` },
  }[data.status];

  return (
    <Panel title="Ownership documents">
      {query.error && !data ? (
        <p role="alert" className="text-sm text-red-700">{query.error}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading documents...</p>
      ) : (
        <div className="space-y-4">
          <p className={`flex items-start gap-2.5 rounded-xl p-3 text-sm leading-6 ${banner.tone}`}><banner.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{banner.text}</p>

          {data.documents.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {data.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{doc.kindLabel}</p>
                    <p className="truncate text-xs text-gray-500">{doc.name} · {doc.format.toUpperCase()} · {kb(doc.bytes)}</p>
                  </div>
                  <button type="button" onClick={() => view(doc)} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label={`Open ${doc.kindLabel}`}><Eye className="h-4 w-4" aria-hidden="true" /></button>
                  {editable && <button type="button" onClick={() => setRemoving(doc)} disabled={Boolean(busy)} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${doc.kindLabel}`}>{busy === doc.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}</button>}
                </li>
              ))}
            </ul>
          )}

          {editable && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`doc-kind-${propertyId}`}>Document type</label>
              <select id={`doc-kind-${propertyId}`} value={kind} onChange={(e) => setKind(e.target.value)} className="field sm:flex-1">
                {Object.entries(documentApi.DOCUMENT_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={upload} className="hidden" />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)} className="btn btn-light">
                {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}Add file
              </button>
            </div>
          )}

          {editable && (
            <button type="button" onClick={submit} disabled={Boolean(busy) || !hasOwnership} className="btn btn-primary w-full">
              {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {data.status === "rejected" ? "Submit again" : "Submit for checking"}
            </button>
          )}
          {data.status === "verified" && (
            <button type="button" onClick={() => setReopening(true)} disabled={Boolean(busy)} className="btn btn-light w-full">Update documents</button>
          )}
          <p className="flex items-start gap-2 text-xs leading-5 text-gray-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Private: only your team and our checkers can open these files, through links that expire. Buyers only see the badge. PDF or photos, up to 3 MB each.</p>
        </div>
      )}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Remove this document?" description={removing ? `${removing.kindLabel} (${removing.name}) will be deleted.` : ""} confirmLabel="Remove" />
      <ConfirmDialog open={reopening} onClose={() => setReopening(false)} onConfirm={reopen} title="Update the documents?" description="The “Documents checked” badge is removed from the listing until the new documents are checked." confirmLabel="Update documents" tone="primary" />
    </Panel>
  );
};

export default PropertyDocuments;
