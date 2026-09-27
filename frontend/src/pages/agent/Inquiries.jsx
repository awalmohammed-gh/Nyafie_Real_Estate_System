import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox, Mail, Phone, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import PageTitle from "../../components/agent/PageTitle";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import Modal from "../../components/ui/Modal";
import LockedFeature from "../../components/ui/LockedFeature";
import { lockCopy } from "../../utils/permissions";
import { formatDate, formatRelative } from "../../utils/date";
import { formatPrice } from "../../utils/property";

const STATUSES = ["New", "Contacted", "In Progress", "Closed"];

const Inquiries = () => {
  const { myInquiries, permissions: perms } = useAgent();
  const inquiryLock = lockCopy(perms, "inquiries");
  const { findProperty, updateInquiryStatus } = useRealEstate();
  const run = useAsyncAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  const openId = searchParams.get("open");
  const open = myInquiries.find((inq) => inq.id === openId);
  const openProperty = open && findProperty(open.propertyId);

  // ?property= narrows the list to one listing (linked from its management page)
  const propertyFilter = searchParams.get("property");
  const filteredProperty = propertyFilter && findProperty(propertyFilter);
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const setOpen = (id) => setParam("open", id);

  const search = query.trim().toLowerCase();
  const visible = [...myInquiries]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .filter((inq) => !propertyFilter || inq.propertyId === propertyFilter)
    .filter((inq) => filter === "All" || inq.status === filter)
    .filter((inq) => {
      if (!search) return true;
      const title = findProperty(inq.propertyId)?.title || "";
      return `${inq.name} ${inq.email} ${title} ${inq.message}`.toLowerCase().includes(search);
    });

  const counts = { All: myInquiries.length, ...Object.fromEntries(STATUSES.map((s) => [s, myInquiries.filter((i) => i.status === s).length])) };

  const changeStatus = (inquiry, status) => {
    if (inquiry.status === status) return;
    run(updateInquiryStatus(inquiry.id, status), { success: `Marked as ${status.toLowerCase()}`, description: `Inquiry from ${inquiry.name}` });
  };

  return (
    <>
      <PageTitle title="Property Inquiries" description="Messages from people interested in your listings." />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs label="Inquiry status" value={filter} onChange={setFilter} tabs={["All", ...STATUSES].map((s) => ({ id: s, label: s, count: counts[s] }))} />
        <SearchInput value={query} onChange={setQuery} placeholder="Search inquiries" className="md:w-72" />
      </div>
      {propertyFilter && (
        <button onClick={() => setParam("property", null)} className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
          Property: {filteredProperty?.title || "Removed property"}
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {myInquiries.length === 0 ? (
        <EmptyState icon={Inbox} title="No inquiries yet" description="When someone contacts you about one of your listings, their message will show up here." />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="Nothing here" description="No inquiries match this filter." />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {visible.map((inquiry, index) => {
            const property = findProperty(inquiry.propertyId);
            return (
              <motion.li
                key={inquiry.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.2) }}
                className="border-b border-gray-100 last:border-0"
              >
                <button onClick={() => setOpen(inquiry.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-gray-50 sm:items-center sm:px-5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${inquiry.status === "New" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {inquiry.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className={`truncate ${inquiry.status === "New" ? "font-bold" : "font-semibold"} text-gray-900`}>{inquiry.name}</p>
                      <span className="truncate text-sm text-gray-500">{property?.title || "Removed property"}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-sm text-gray-500">{inquiry.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={inquiry.status} />
                    <span className="text-xs text-gray-400">{formatRelative(inquiry.createdAt)}</span>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? `Inquiry from ${open.name}` : ""}
        description={open && `Received ${formatDate(open.createdAt)}`}
        footer={
          open && (
            <>
              <a href={`tel:${open.phone.replace(/\s+/g, "")}`} className="btn btn-light">
                <Phone className="h-4 w-4" />
                Call
              </a>
              <a
                href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${openProperty?.title || "Your inquiry"}`)}`}
                onClick={() => perms.canManageInquiries && open.status === "New" && changeStatus(open, "Contacted")}
                className="btn btn-primary"
              >
                <Mail className="h-4 w-4" />
                Reply by email
              </a>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-5">
            <dl className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-semibold text-gray-900">{open.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-0.5"><StatusBadge status={open.status} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd><a href={`mailto:${open.email}`} className="font-semibold break-all text-brand-600 hover:underline">{open.email}</a></dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd><a href={`tel:${open.phone.replace(/\s+/g, "")}`} className="font-semibold text-brand-600 hover:underline">{open.phone}</a></dd>
              </div>
            </dl>

            {openProperty ? (
              <Link to={`/house/${openProperty.id}`} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-gray-200 transition hover:ring-brand-200">
                <img src={openProperty.media.images[0]} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{openProperty.title}</p>
                  <p className="text-sm text-gray-500">{formatPrice(openProperty)} · {openProperty.location.name}</p>
                </div>
              </Link>
            ) : (
              <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">This property has been removed.</p>
            )}

            <div>
              <p className="text-sm font-semibold text-gray-900">Message</p>
              <p className="mt-2 rounded-lg bg-brand-50/60 p-4 text-sm leading-relaxed whitespace-pre-line text-gray-700">{open.message}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-900">Update status</p>
              {perms.canManageInquiries ? (
                <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:grid-cols-4">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={open.status === s}
                      onClick={() => changeStatus(open, s)}
                      className={`rounded-lg py-2 text-sm font-semibold transition ${open.status === s ? "bg-white text-brand-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <LockedFeature
                  compact
                  className="mt-2"
                  title={inquiryLock.title}
                  description={`${inquiryLock.description} You can still reply to the customer.`}
                  cta={inquiryLock.cta}
                  to={perms.isActive ? "/agent/plans#plans" : "/agent/subscription"}
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default Inquiries;
