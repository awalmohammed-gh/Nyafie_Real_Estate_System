import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ExternalLink, Eye, FileCheck2, FileText, Loader2, XCircle } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import StatusBadge from "../../components/ui/StatusBadge";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { ADMIN_COUNTS_CHANGED } from "../../hooks/useAdminCounts";
import { useToast } from "../../context/useToast";
import { documentApi } from "../../frontApi";
import { adminPath } from "../../utils/adminEntry";
import { formatDate, formatRelative } from "../../utils/date";
import { openDocument } from "../../utils/openDocument";
import { formatGhs } from "../../utils/property";

const TABS = [
  { id: "pending", label: "To check" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Sent back" },
  { id: "all", label: "All" },
];
const STATUS = { pending: "Pending", verified: "Verified", rejected: "Sent back", draft: "Draft" };

// What to compare before verifying (the badge tells buyers these checks were made)
const CHECKLIST = [
  "The owner's name matches the agent's details or a seller authorisation they provided",
  "The plot, address or site plan matches this listing's location",
  "Stamps, signatures and dates look genuine and complete",
];

const CheckCard = ({ check, onReviewed }) => {
  const run = useAsyncAction();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const view = (doc) => openDocument(() => documentApi.getCheckDocumentLink(check.id, doc.id)).catch((error) => toast({ type: "error", title: error.message }));
  const review = async (decision) => {
    setBusy(decision);
    const { ok } = await run(documentApi.reviewDocumentCheck(check.id, decision, note.trim()), {
      success: decision === "verify" ? "Documents verified" : "Sent back to the owner",
      description: decision === "verify" ? "The listing now shows “Documents checked”." : "The owner has your note.",
    });
    setBusy("");
    if (ok) onReviewed();
  };

  return (
    <li className="rounded-3xl bg-white p-5 ring-1 ring-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-gray-900">{check.propertyTitle}</p>
          <p className="text-sm text-gray-500">{[check.location, check.price != null && formatGhs(check.price)].filter(Boolean).join(" · ")}</p>
          {check.owner && <p className="mt-1 text-sm text-gray-600">Owner: <span className="font-medium text-gray-900">{check.owner.name}</span>{check.owner.company ? ` (${check.owner.company})` : ""} · {check.owner.email}{check.owner.phone ? ` · ${check.owner.phone}` : ""}</p>}
        </div>
        <StatusBadge status={STATUS[check.status]} />
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {check.documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 p-3">
            <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{doc.kindLabel}</p>
              <p className="truncate text-xs text-gray-500">{doc.name} · {doc.format.toUpperCase()} · added {formatDate(doc.uploadedAt)}</p>
            </div>
            <button type="button" onClick={() => view(doc)} className="btn btn-light px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Open</button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link to={`/house/${check.propertyId}`} target="_blank" className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">View listing<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        <Link to={adminPath(`/properties?open=${check.propertyId}`)} className="font-medium text-brand-700 hover:underline">Manage listing</Link>
        {check.owner && <Link to={adminPath(`/agents?open=${check.owner.id}`)} className="font-medium text-brand-700 hover:underline">Agent profile</Link>}
      </div>

      {check.status === "pending" ? (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
            <p className="font-semibold text-gray-800">Before verifying, check:</p>
            <ul className="mt-1 list-disc pl-4">{CHECKLIST.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the owner (required when sending back): what's missing or wrong" className="field resize-none" aria-label="Note for the owner" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => review("reject")} disabled={Boolean(busy) || note.trim().length < 10} className="btn btn-light px-4 py-2 text-xs">
              {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}Send back
            </button>
            <button type="button" onClick={() => review("verify")} disabled={Boolean(busy)} className="btn btn-primary px-4 py-2 text-xs">
              {busy === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}Verify documents
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
          {check.status === "verified" ? "Verified" : check.status === "rejected" ? "Sent back" : "Being prepared by the owner"}
          {check.reviewedBy && ` by ${check.reviewedBy}`}{check.reviewedAt && `, ${formatRelative(check.reviewedAt)}`}
          {check.note && <span className="mt-1 block text-gray-500">Note to the owner: {check.note}</span>}
        </p>
      )}
    </li>
  );
};

/** Ownership documents owners submitted for their sale listings, oldest first. */
const AdminDocumentChecks = () => {
  const [tab, setTab] = useState("pending");
  const checks = useApiQuery(`document-checks:${tab}`, () => documentApi.getDocumentChecks(tab));
  const reviewed = () => {
    checks.reload();
    window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED));
  };

  return (
    <>
      <AdminPageTitle title="Document checks" description="Ownership documents owners submitted for their sale listings. Verified listings show “Documents checked” to buyers. Files open through links that expire after 10 minutes." />
      <FilterTabs tabs={TABS} value={tab} onChange={setTab} label="Check status" />
      <div className="mt-5">
        {checks.error ? <ErrorState title="Couldn't load document checks" message={checks.error} onRetry={checks.reload} />
          : checks.loading ? <TableSkeleton />
            : checks.data.length === 0 ? <EmptyState icon={FileCheck2} title={tab === "pending" ? "Nothing to check" : "No document checks here"} description={tab === "pending" ? "Documents owners submit for checking appear here." : "Reviewed checks are kept here for reference."} />
              : <ul className="space-y-4">{checks.data.map((check) => <CheckCard key={check.id} check={check} onReviewed={reviewed} />)}</ul>}
      </div>
    </>
  );
};

export default AdminDocumentChecks;
