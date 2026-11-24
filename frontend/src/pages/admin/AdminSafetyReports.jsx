import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, ExternalLink, Loader2, ShieldAlert, UserRound, XCircle } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import StatusBadge from "../../components/ui/StatusBadge";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { ADMIN_COUNTS_CHANGED } from "../../utils/adminCounts";
import { reportApi } from "../../frontApi";
import { adminPath } from "../../utils/adminEntry";
import { formatRelative } from "../../utils/date";

const TABS = [
  { id: "open", label: "To review" },
  { id: "resolved", label: "Action taken" },
  { id: "dismissed", label: "No problem found" },
  { id: "all", label: "All" },
];
const STATUS = { open: "Open", resolved: "Resolved", dismissed: "Dismissed" };

// One report, with links to the listing or agent (where an admin takes action) and the review form
const ReportCard = ({ report, onReviewed }) => {
  const run = useAsyncAction();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const isListing = report.targetType === "property";
  const removed = isListing && (!report.property || report.property.removed);

  const review = async (status) => {
    setBusy(status);
    const { ok, result } = await run(reportApi.reviewReport(report.id, status, note.trim()), {
      success: status === "resolved" ? "Report resolved" : "Report dismissed",
      description: "The person who reported it has been thanked. Your note stays internal.",
    });
    setBusy("");
    if (ok) onReviewed(result);
  };

  return (
    <li className="rounded-3xl bg-white p-5 ring-1 ring-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase ${report.reason === "scam" ? "text-red-700" : "text-gray-500"}`}>
            {isListing ? <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> : <UserRound className="h-3.5 w-3.5" aria-hidden="true" />}
            {isListing ? "Listing" : "Agent"} · {report.reasonLabel}
          </p>
          <p className="mt-1 text-lg font-bold text-gray-900">{report.targetTitle}</p>
          {isListing && report.agent?.name && <p className="text-sm text-gray-500">Listed by {report.agent.name}{report.agent.email ? ` · ${report.agent.email}` : ""}</p>}
          {isListing && report.ownerType === "admin" && <p className="text-sm text-gray-500">A NyaFie listing</p>}
        </div>
        <StatusBadge status={STATUS[report.status]} />
      </div>

      {report.details && <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm whitespace-pre-line text-gray-700">“{report.details}”</p>}
      <p className="mt-3 text-xs text-gray-500">
        Reported {formatRelative(report.createdAt)} by {report.reporter ? `${report.reporter.name} (${report.reporter.email}, ${report.reporter.role === "agent" ? "agent" : "customer"})` : "a deleted account"}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {isListing && !removed && <Link to={`/house/${report.property.id}`} target="_blank" className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">View listing<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        {isListing && !removed && <Link to={adminPath(`/properties?open=${report.property.id}`)} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">Manage listing (suspend, edit)</Link>}
        {isListing && removed && <span className="text-gray-500">The listing has since been deleted.</span>}
        {report.agent?.id && <Link to={adminPath(`/agents?open=${report.agent.id}`)} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">Manage agent (warn, remove)</Link>}
      </div>

      {report.status === "open" ? (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note: what you checked and did (never shown to the reporter or the agent)" className="field resize-none" aria-label="Internal note" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => review("dismissed")} disabled={Boolean(busy)} className="btn btn-light px-4 py-2 text-xs">
              {busy === "dismissed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}No problem found
            </button>
            <button type="button" onClick={() => review("resolved")} disabled={Boolean(busy)} className="btn btn-primary px-4 py-2 text-xs">
              {busy === "resolved" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}Action taken
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
          {report.status === "resolved" ? "Action taken" : "No problem found"}
          {report.reviewedBy && ` by ${report.reviewedBy.name}`}{report.reviewedAt && `, ${formatRelative(report.reviewedAt)}`}
          {report.adminNote && <span className="mt-1 block text-gray-500">Note: {report.adminNote}</span>}
        </p>
      )}
    </li>
  );
};

/**
 * Reports from customers and agents about listings and agents. The admin checks each one, takes
 * action on the listing or agent from their own pages, then marks it here.
 */
const AdminSafetyReports = () => {
  const [tab, setTab] = useState("open");
  const reports = useApiQuery(`safety-reports:${tab}`, () => reportApi.getReports(tab));
  const reviewed = () => {
    reports.reload();
    window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED));
  };

  return (
    <>
      <AdminPageTitle title="Safety reports" description="Listings and agents reported by customers and agents. Check each one, act on the listing or agent, then mark it reviewed." />
      <FilterTabs tabs={TABS} value={tab} onChange={setTab} label="Report status" />
      <div className="mt-5">
        {reports.error ? <ErrorState title="Couldn't load reports" message={reports.error} onRetry={reports.reload} />
          : reports.loading ? <TableSkeleton />
            : reports.data.length === 0 ? <EmptyState icon={ShieldAlert} title={tab === "open" ? "Nothing to review" : "No reports here"} description={tab === "open" ? "New reports from customers and agents appear here." : "Reviewed reports are kept here for reference."} />
              : <ul className="space-y-4">{reports.data.map((report) => <ReportCard key={report.id} report={report} onReviewed={reviewed} />)}</ul>}
      </div>
    </>
  );
};

export default AdminSafetyReports;
