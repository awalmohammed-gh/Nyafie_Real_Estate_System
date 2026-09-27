import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, ChevronRight, HandCoins, Home, Inbox, Lock, Mail, MapPin, Phone, Plus, Sparkles } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { useTransactions } from "../../context/useTransactions";
import ActivityFeed from "../../components/dashboard/ActivityFeed";
import { ErrorState } from "../../components/dashboard/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { buildActivity } from "../../utils/activity";
import { formatDate, formatRelative } from "../../utils/date";
import { formatLocation, formatType, getInitials, getListingStatus, getPriceParts, statusLabel } from "../../utils/property";
import { lockCopy } from "../../utils/permissions";
import { formatCedis } from "../../utils/reports";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fade = (i = 0) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, delay: i * 0.05, ease: "easeOut" } });
const STATUS_SEGMENTS = [
  { key: "Available", label: "Available", color: "bg-emerald-500" },
  { key: "Under Offer", label: "Under offer", color: "bg-amber-400" },
  { key: "Rented", label: "Rented", color: "bg-sky-500" },
  { key: "Sold", label: "Sold", color: "bg-gray-500" },
];

// Section heading with an optional secondary action (never a card of its own)
const Heading = ({ title, description, to, toLabel }) => (
  <div className="mb-4 flex items-end justify-between gap-4">
    <div className="min-w-0">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
    {to && (
      <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800">
        {toLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    )}
  </div>
);

const Photo = ({ src, className }) =>
  src ? <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} /> : <span className={`grid place-items-center bg-gray-100 text-gray-300 ${className}`}><Home className="h-6 w-6" /></span>;

// ---------- Portfolio snapshot: counts from the agent's own listings ----------
const Snapshot = ({ properties, live, inReview, drafts, pendingOffers, newInquiries, loading }) => {
  const total = properties.length;
  const count = (a) => properties.filter((p) => p.listing.availability === a).length;
  return (
    <motion.section {...fade(1)} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Total properties</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-gray-900 tabular-nums">{total}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/agent/offers" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${pendingOffers ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-gray-50 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"}`}>
            <HandCoins className="h-4 w-4" />
            {loading ? "–" : pendingOffers} pending {pendingOffers === 1 ? "offer" : "offers"}
          </Link>
          <Link to="/agent/inquiries" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${newInquiries ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100" : "bg-gray-50 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"}`}>
            <Inbox className="h-4 w-4" />
            {newInquiries} new {newInquiries === 1 ? "inquiry" : "inquiries"}
          </Link>
        </div>
      </div>

      {/* Status overview: one bar instead of a chart, since it reads well with any number of listings */}
      <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={STATUS_SEGMENTS.map((s) => `${s.label}: ${count(s.key)}`).join(", ")}>
        {total > 0 && STATUS_SEGMENTS.map((s) => count(s.key) > 0 && <motion.span key={s.key} initial={{ width: 0 }} animate={{ width: `${(count(s.key) / total) * 100}%` }} transition={{ duration: 0.5, ease: "easeOut" }} className={s.color} />)}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-gray-100">
        {[
          ["Active listings", live, "Live on the website", null],
          ...STATUS_SEGMENTS.filter((s) => s.key !== "Under Offer").map((s) => [s.label, count(s.key), null, s.color]),
        ].map(([label, value, hint, color], i) => (
          <div key={label} className={`sm:px-5 ${i === 0 ? "sm:pl-0" : ""}`}>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              {color && <span className={`h-2 w-2 rounded-full ${color}`} />}
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</dd>
            {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
          </div>
        ))}
      </dl>
      {(inReview > 0 || drafts > 0 || count("Under Offer") > 0) && (
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
          {[count("Under Offer") && plural(count("Under Offer"), "listing under offer", "listings under offer"), inReview && `${inReview} in review`, drafts && plural(drafts, "draft", "drafts")].filter(Boolean).join(" · ")}
        </p>
      )}
    </motion.section>
  );
};

// ---------- Subscription and property usage (real plan values) ----------
const Subscription = ({ perms, subscription }) => {
  const state = perms.subscription;
  const limit = perms.propertyLimit || 0;
  const used = perms.activeCount;
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const renewTo = subscription ? `/agent/checkout?plan=${subscription.planId}` : "/agent/plans";
  return (
    <motion.section {...fade(2)} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">Your plan</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-gray-900">{perms.plan?.name || subscription?.planName || "No"} plan</p>
        </div>
        <StatusBadge status={state.statusLabel} tone={{ active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber" }[state.status]} />
      </div>

      {subscription && (
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Started</dt>
            <dd className="font-medium text-gray-900">{formatDate(subscription.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{state.isActive ? "Expires" : "Ended"}</dt>
            <dd className="font-medium text-gray-900">{formatDate(subscription.expiryDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Days left</dt>
            <dd className={`font-semibold tabular-nums ${state.expiringSoon ? "text-amber-600" : "text-gray-900"}`}>{state.daysRemaining}</dd>
          </div>
        </dl>
      )}

      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-gray-900">Property usage</p>
          <p className="text-sm text-gray-600 tabular-nums"><span className="font-semibold text-gray-900">{used}</span> of {limit} properties</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label="Property usage">
          <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.5, ease: "easeOut" }} className={`h-full rounded-full ${percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-400" : "bg-brand-500"}`} />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">{plural(perms.remainingListings, "slot", "slots")} left · live and in-review listings count, drafts don't</p>
        {perms.limitReached ? (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            You've used every slot on this plan, so new listings can only be saved as drafts. Upgrade to publish more.
          </p>
        ) : perms.nearLimit ? (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            You're close to your property limit.
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex gap-2 pt-5">
        {state.isActive ? (
          <>
            <Link to="/agent/subscription" className="btn btn-light flex-1 px-3 py-2 text-sm">Manage subscription</Link>
            {(perms.limitReached || perms.nearLimit) && (
              <Link to="/agent/plans#plans" className="btn btn-primary flex-1 px-3 py-2 text-sm"><Sparkles className="h-4 w-4" />Upgrade</Link>
            )}
          </>
        ) : (
          <Link to={renewTo} className="btn btn-primary flex-1 px-3 py-2 text-sm">Renew subscription</Link>
        )}
      </div>
    </motion.section>
  );
};

// ---------- Property showcase: photography first ----------
const FeatureProperty = ({ property: p, status, onOpen }) => {
  const { value, period } = getPriceParts(p);
  return (
    <motion.button {...fade(0)} type="button" onClick={onOpen} className="group relative block h-full min-h-72 overflow-hidden rounded-xl bg-gray-900 text-left">
      <Photo src={p.media.images[0]} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.03]" />
      <span className="absolute inset-0 bg-linear-to-t from-gray-950/90 via-gray-950/25 to-transparent" />
      <span className="absolute top-4 left-4 flex gap-2">
        <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-900">{status}</span>
        <span className="rounded-md bg-gray-950/70 px-2 py-0.5 text-[11px] font-semibold text-white uppercase">{statusLabel(p.property.status)}</span>
      </span>
      <span className="absolute inset-x-0 bottom-0 block p-5 text-white">
        <span className="block text-xs font-medium text-white/70">Latest listing · {formatDate(p.listing.createdAt)}</span>
        <span className="mt-1 block text-xl font-semibold tracking-tight">{p.title}</span>
        <span className="mt-1 flex items-center gap-1.5 text-sm text-white/80"><MapPin className="h-4 w-4" />{formatLocation(p.location)} · <span className="capitalize">{formatType(p.property.type)}</span></span>
        <span className="mt-3 flex items-end justify-between gap-3">
          <span className="text-2xl font-semibold tabular-nums">{value}<span className="text-sm font-medium text-white/70">{period}</span></span>
          <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-medium backdrop-blur-sm">{p.listing.availability}</span>
        </span>
      </span>
    </motion.button>
  );
};

const CompactProperty = ({ property: p, status, onOpen, index }) => {
  const { value, period } = getPriceParts(p);
  return (
    <motion.button {...fade(index + 1)} type="button" onClick={onOpen} className="group flex min-w-0 gap-3 rounded-xl border border-gray-200 bg-white p-2.5 text-left transition-shadow hover:shadow-md hover:shadow-gray-900/5">
      <Photo src={p.media.images[0]} className="aspect-4/3 w-28 shrink-0 rounded-lg" />
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand-700">{p.title}</span>
        <span className="truncate text-xs text-gray-500">{formatLocation(p.location)}</span>
        <span className="mt-1 text-sm font-semibold text-gray-900 tabular-nums">{value}<span className="text-xs font-normal text-gray-500">{period}</span></span>
        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
          <StatusBadge status={status} />
          <span className="text-[11px] text-gray-400">{formatDate(p.listing.createdAt)}</span>
        </span>
      </span>
    </motion.button>
  );
};

// ---------- Offers and inquiries ----------
const Feed = ({ title, description, to, toLabel, loading, error, onRetry, empty, children, count }) => (
  <section className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white">
    <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="truncate text-xs text-gray-500">{description}</p>
      </div>
      <Link to={to} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-600 hover:text-brand-800">{toLabel}<ChevronRight className="h-3.5 w-3.5" /></Link>
    </header>
    {loading ? (
      <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-md bg-gray-50" />)}</div>
    ) : error ? (
      <div className="p-4"><ErrorState title="Couldn't load" message={error} onRetry={onRetry} /></div>
    ) : count === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">{empty}</div>
    ) : (
      <ul className="divide-y divide-gray-100">{children}</ul>
    )}
  </section>
);

const EmptyNote = ({ icon: Icon, title, text }) => (
  <>
    <Icon className="h-6 w-6 text-gray-300" />
    <p className="mt-2 text-sm font-semibold text-gray-900">{title}</p>
    <p className="text-sm text-gray-500">{text}</p>
  </>
);

/**
 * Agent workspace overview: the agent's own listings, customers' interest in them,
 * and their plan. Every figure comes from the signed-in agent's data (never other agents').
 */
const Dashboard = () => {
  const navigate = useNavigate();
  const { user, myProperties, myInquiries, permissions: perms } = useAgent();
  const { findProperty, isPubliclyVisible } = useRealEstate();
  const { offers, rentals, sales, pending, loading, error, reload } = useTransactions();
  const subscription = user.subscription;

  const statusOf = (p) => getListingStatus(p, p.listing.state !== "published" || isPubliclyVisible(p));
  const byState = (s) => myProperties.filter((p) => p.listing.state === s).length;
  const recent = [...myProperties].sort((a, b) => new Date(b.listing.createdAt) - new Date(a.listing.createdAt));
  const [latest, ...others] = recent;
  const newInquiries = myInquiries.filter((i) => i.status === "New").length;
  const recentOffers = [...offers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const recentInquiries = [...myInquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const activity = buildActivity({ base: "/agent", offers, rentals, sales, inquiries: myInquiries, findProperty, limit: 6 });
  const addLock = lockCopy(perms);
  const openProperty = (p) => navigate(`/agent/properties?view=${p.id}`);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.header {...fade(0)} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Welcome back, {user.firstName}</h1>
          <p className="mt-1 text-gray-500">{myProperties.length ? "Here's what's happening with your properties today." : "Let's get your first property in front of customers."}</p>
        </div>
        {perms.canCreateDraft ? (
          <Link to="/agent/properties/add" className="btn btn-primary self-start px-5 py-2.5 sm:self-auto">
            <Plus className="h-4 w-4" />
            Add Property
          </Link>
        ) : (
          <span className="btn btn-light cursor-not-allowed self-start px-5 py-2.5 opacity-70 sm:self-auto" title={addLock.description}>
            <Lock className="h-4 w-4" />
            Add Property
          </span>
        )}
      </motion.header>

      {/* Portfolio and plan */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Snapshot properties={myProperties} live={myProperties.filter(isPubliclyVisible).length} inReview={byState("pending")} drafts={byState("draft")} pendingOffers={pending.offers} newInquiries={newInquiries} loading={loading} />
        <Subscription perms={perms} subscription={subscription} />
      </div>

      {/* Properties, photography first */}
      <section>
        <Heading title="Recent properties" description="Your latest listings" to={myProperties.length ? "/agent/properties" : undefined} toLabel="View all properties" />
        {!latest ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Building2 className="h-6 w-6" /></span>
            <p className="mt-3 text-base font-semibold text-gray-900">No properties yet</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">Add your first property to start building your listings.</p>
            {perms.canCreateDraft ? (
              <Link to="/agent/properties/add" className="btn btn-primary mt-5 px-4 py-2"><Plus className="h-4 w-4" />Add Property</Link>
            ) : (
              <p className="mt-4 text-sm text-amber-800">{addLock.description}</p>
            )}
          </div>
        ) : (
          <div className={`grid gap-4 ${others.length ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""}`}>
            <FeatureProperty property={latest} status={statusOf(latest)} onOpen={() => openProperty(latest)} />
            {others.length > 0 && (
              <div className="grid content-start gap-3">
                {others.slice(0, 4).map((p, i) => (
                  <CompactProperty key={p.id} index={i} property={p} status={statusOf(p)} onOpen={() => openProperty(p)} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Customer interest */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Feed
          title="Recent offers"
          description="What customers are offering on your properties"
          to="/agent/offers"
          toLabel="All offers"
          loading={loading}
          error={error}
          onRetry={reload}
          count={recentOffers.length}
          empty={<EmptyNote icon={HandCoins} title="No offers yet" text="Customer offers will appear here when they are submitted." />}
        >
          {recentOffers.map((o) => (
            <li key={o.id}>
              <Link to={`/agent/offers?property=${o.property.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50">
                <Photo src={o.property.image} className="h-10 w-12 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{o.customer?.name || "Customer"}</span>
                  <span className="block truncate text-xs text-gray-500">{o.property.title} · {formatRelative(o.createdAt)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold text-gray-900 tabular-nums">{formatCedis(o.amount)}</span>
                  <StatusBadge status={o.status} className="mt-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </Feed>

        <Feed
          title="Recent inquiries"
          description="Questions from customers about your properties"
          to="/agent/inquiries"
          toLabel="All inquiries"
          count={recentInquiries.length}
          empty={<EmptyNote icon={Inbox} title="No inquiries yet" text="Customer inquiries about your properties will appear here." />}
        >
          {recentInquiries.map((inq) => (
            <li key={inq.id}>
              <Link to={`/agent/inquiries?open=${inq.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-gray-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{getInitials(inq.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{inq.name}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">{formatRelative(inq.createdAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-gray-500">{findProperty(inq.propertyId)?.title || "Removed property"}</span>
                  <span className="mt-1 line-clamp-1 text-sm text-gray-600">“{inq.message}”</span>
                </span>
                <StatusBadge status={inq.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </Feed>
      </div>

      {/* Profile and activity */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <motion.section {...fade(0)} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-bold text-white">{getInitials(user.name)}</span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900">{user.name}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <StatusBadge status="Agent" tone="brand" dot={false} />
                <StatusBadge status={perms.isSuspended ? "Suspended" : "Active"} tone={perms.isSuspended ? "red" : "green"} />
              </div>
            </div>
          </div>
          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5 text-gray-700"><dt className="sr-only">Email</dt><Mail className="h-4 w-4 shrink-0 text-gray-400" /><dd className="truncate">{user.email}</dd></div>
            <div className="flex items-center gap-2.5 text-gray-700"><dt className="sr-only">Phone</dt><Phone className="h-4 w-4 shrink-0 text-gray-400" /><dd>{user.phone || <span className="text-gray-400">No phone number added</span>}</dd></div>
            <div className="flex items-center gap-2.5 text-gray-700"><dt className="sr-only">Member since</dt><CalendarClock className="h-4 w-4 shrink-0 text-gray-400" /><dd>Member since {formatDate(user.createdAt)}</dd></div>
          </dl>
          <div className="mt-5 flex gap-2">
            <Link to="/account/profile" className="btn btn-light flex-1 px-3 py-2 text-sm">Edit profile</Link>
            <Link to={`/agent/${user.id}`} className="btn btn-light flex-1 px-3 py-2 text-sm">Public profile</Link>
          </div>
        </motion.section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
            <p className="text-xs text-gray-500">Offers, rental and purchase requests, and inquiries on your properties</p>
          </header>
          <ActivityFeed items={activity} loading={loading} emptyText="Activity appears here when customers make offers, request rentals or purchases, or send inquiries." />
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
