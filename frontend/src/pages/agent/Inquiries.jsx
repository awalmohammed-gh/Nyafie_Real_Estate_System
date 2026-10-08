import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox, Mail, MessageCircle, Phone, Search, X } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useDesktop } from "../../hooks/useDesktop";
import { useRealEstate } from "../../context/useRealEstate";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import PageTitle from "../../components/agent/PageTitle";
import WorkspaceStats from "../../components/agent/WorkspaceStats";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import SidePanel from "../../components/ui/SidePanel";
import LockedFeature from "../../components/ui/LockedFeature";
import { lockCopy } from "../../utils/permissions";
import { formatDate, formatRelative } from "../../utils/date";
import { formatPrice, getInitials } from "../../utils/property";

const STATUSES = ["New", "Contacted", "In Progress", "Closed"];
const InquiryDetails = ({ inquiry, property, perms, onStatus }) => <div className="space-y-6">
  {inquiry.conversationId && <Link to={`/agent/messages?c=${inquiry.conversationId}`} className="btn btn-primary w-full"><MessageCircle className="h-4 w-4" />Reply in conversation</Link>}
  <div><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 font-semibold text-brand-700">{getInitials(inquiry.name)}</span><div><h2 className="font-semibold text-gray-900">{inquiry.name}</h2><p className="mt-1 text-xs text-gray-500">Received {formatDate(inquiry.createdAt)}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={inquiry.status} /><a href={`tel:${inquiry.phone?.replace(/\s+/g, "") || ""}`} className="btn btn-light text-xs"><Phone className="h-3.5 w-3.5" />Call</a><a href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: ${property?.title || "Your inquiry"}`)}`} onClick={() => perms.canManageInquiries && inquiry.status === "New" && onStatus(inquiry, "Contacted")} className="btn btn-primary text-xs"><Mail className="h-3.5 w-3.5" />Reply by email</a></div></div>
  <div className="workspace-detail-section"><p className="workspace-eyebrow mb-3">Contact details</p><dl className="space-y-3 text-sm"><div><dt className="text-xs text-gray-500">Email</dt><dd className="mt-1 break-all text-gray-900">{inquiry.email}</dd></div><div><dt className="text-xs text-gray-500">Phone</dt><dd className="mt-1 text-gray-900">{inquiry.phone || "Not provided"}</dd></div></dl></div>
  {property && <Link to={`/agent/properties/${property.id}`} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"><img src={property.media.images[0]} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{property.title}</p><p className="mt-1 text-xs text-gray-500">{formatPrice(property)}</p></div></Link>}
  <div className="workspace-detail-section"><h3 className="text-sm font-semibold text-gray-900">Customer message</h3><p className="mt-3 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed whitespace-pre-line break-words text-gray-700">{inquiry.message}</p></div>
  <div className="workspace-detail-section"><h3 className="text-sm font-semibold text-gray-900">Inquiry progress</h3>{perms.canManageInquiries ? <div role="group" aria-label="Inquiry status" className="mt-3 grid grid-cols-2 gap-2">{STATUSES.map((status) => <button key={status} type="button" aria-pressed={inquiry.status === status} onClick={() => onStatus(inquiry, status)} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${inquiry.status === status ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{status}</button>)}</div> : <LockedFeature compact className="mt-3" {...lockCopy(perms, "inquiries")} to={perms.isActive ? "/agent/subscription/plans" : "/agent/subscription"} />}</div>
</div>;

const Inquiries = () => {
  const { myInquiries, permissions: perms } = useAgent();
  const { findProperty, updateInquiryStatus } = useRealEstate();
  const run = useAsyncAction();
  const desktop = useDesktop();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const open = myInquiries.find((i) => i.id === params.get("open"));
  const propertyId = params.get("property");
  const changeParam = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const scoped = myInquiries.filter((i) => !propertyId || i.propertyId === propertyId);
  const counts = { All: scoped.length, ...Object.fromEntries(STATUSES.map((status) => [status, scoped.filter((i) => i.status === status).length])) };
  const search = query.trim().toLowerCase();
  const rows = [...scoped].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).filter((i) => filter === "All" || i.status === filter).filter((i) => !search || `${i.name} ${i.email} ${findProperty(i.propertyId)?.title} ${i.message}`.toLowerCase().includes(search));
  const onStatus = (inquiry, status) => { if (inquiry.status !== status) run(updateInquiryStatus(inquiry.id, status), { success: `Marked as ${status.toLowerCase()}`, description: `Inquiry from ${inquiry.name}` }); };
  const details = open && <InquiryDetails inquiry={open} property={findProperty(open.propertyId)} perms={perms} onStatus={onStatus} />;
  return <>
    <PageTitle title="Your inquiry inbox" description="Turn property interest into a conversation. Review the details and keep every lead moving." />
    <WorkspaceStats className="mb-6" items={STATUSES.map((status) => ({ label: status, value: myInquiries.filter((i) => i.status === status).length, note: { New: "Waiting for a response", Contacted: "Conversation started", "In Progress": "Active opportunities", Closed: "Completed conversations" }[status] }))} />
    <div className="workspace-toolbar"><div className="workspace-toolbar-top"><FilterTabs label="Inquiry status" value={filter} onChange={setFilter} tabs={["All", ...STATUSES].map((s) => ({ id: s, label: s, count: counts[s] }))} /><SearchInput value={query} onChange={setQuery} placeholder="Search customers or properties" className="w-full sm:w-72" /></div>{propertyId && <button onClick={() => changeParam("property", null)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{findProperty(propertyId)?.title || "Removed property"}<X className="h-3.5 w-3.5" /></button>}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]"><section className="workspace-card"><div className="workspace-card-header"><h2>Conversations</h2><span role="status" className="text-xs text-gray-500">{rows.length} inquiries</span></div>{rows.length ? <ul className="divide-y divide-gray-100">{rows.map((i) => <li key={i.id}><button type="button" onClick={() => changeParam("open", i.id)} aria-pressed={open?.id === i.id} className={`flex w-full items-start gap-3 p-4 text-left transition sm:p-5 ${open?.id === i.id ? "bg-brand-50 border-l-2 border-brand-500" : "hover:bg-gray-50 border-l-2 border-transparent"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-semibold ${i.status === "New" ? "bg-brand-100 text-brand-800" : "bg-gray-100 text-gray-500"}`}>{getInitials(i.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{i.name}</p><p className="mt-1 truncate text-xs text-gray-500">{findProperty(i.propertyId)?.title || "Removed property"}</p><p className="mt-2 line-clamp-2 text-sm text-gray-600">{i.message}</p></div><div className="shrink-0 text-right"><StatusBadge status={i.status} /><p className="mt-2 text-[11px] text-gray-400">{formatRelative(i.createdAt)}</p></div></button></li>)}</ul> : <EmptyState icon={myInquiries.length ? Search : Inbox} title={myInquiries.length ? "No matching inquiries" : "Your next customer starts here"} description={myInquiries.length ? "Try a different search or status." : "Inquiries about your properties will appear in this inbox."} />}</section>
      {desktop && <section className="workspace-card sticky top-20"><div className="workspace-card-header"><h2>Inquiry details</h2>{open && <button onClick={() => changeParam("open", null)} aria-label="Close inquiry details" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-50"><X className="h-4 w-4 text-gray-500" /></button>}</div><div className="p-6">{details || <div className="py-20 text-center"><Inbox className="mx-auto h-8 w-8 text-gray-300" /><h3 className="mt-4 text-sm font-semibold text-gray-900">Select an inquiry</h3><p className="mt-2 text-sm text-gray-500">Customer and property details appear here.</p></div>}</div></section>}
    </div>
    {!desktop && <SidePanel open={Boolean(open)} onClose={() => changeParam("open", null)} title="Inquiry details" description={open?.name}>{details}</SidePanel>}
  </>;
};
export default Inquiries;
