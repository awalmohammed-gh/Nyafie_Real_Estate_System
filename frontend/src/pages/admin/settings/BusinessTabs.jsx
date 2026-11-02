import { Bell, CheckCircle2, CircleSlash, KeyRound, Lock } from "lucide-react";
import { usePlatform } from "../../../context/usePlatform";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import { useApiQuery } from "../../../hooks/useApiQuery";
import { adminApi } from "../../../frontApi";
import { Callout, Panel, Row, SaveBar, Switch, TagEditor } from "../../../components/admin/settings/SettingsUI";
import { formatType } from "../../../utils/property";

const Input = ({ id, value, onChange, max = 120, ...rest }) => (
  <input id={id} value={value} onChange={(e) => onChange(e.target.value.slice(0, max))} className="field" {...rest} />
);

// ---------- Contact & Business ----------
const SOCIAL = [
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourpage" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourpage" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/yourpage" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/yourpage" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourpage" },
];

export const ContactTab = () => {
  const c = useSettingsForm("contact", { label: "Contact details" });
  const s = useSettingsForm("social", { label: "Social links" });
  return (
    <div className="space-y-6">
      <Panel title="Contact & business" description="Shown in the footer and on the Contact page, and used for listings posted by the admin. Empty fields are hidden on the site." footer={<SaveBar form={c} />}>
        <Row label="Phone" htmlFor="c-phone">
          <Input id="c-phone" type="tel" value={c.form.phone} onChange={(v) => c.set("phone", v)} max={30} placeholder="+233 24 000 0000" />
        </Row>
        <Row label="Email" htmlFor="c-email">
          <Input id="c-email" type="email" value={c.form.email} onChange={(v) => c.set("email", v)} placeholder="info@yourdomain.com" />
        </Row>
        <Row label="WhatsApp number" description="Customers message this number about admin listings. Include the country code. Empty uses the phone number." htmlFor="c-wa">
          <Input id="c-wa" type="tel" value={c.form.whatsapp} onChange={(v) => c.set("whatsapp", v)} max={20} placeholder="+233 24 000 0000" />
        </Row>
        <Row label="Office address" description="Where customers pay for property purchases and visit the team." htmlFor="c-address">
          <Input id="c-address" value={c.form.address} onChange={(v) => c.set("address", v)} max={150} placeholder="Street and area" />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Input aria-label="City" value={c.form.city} onChange={(v) => c.set("city", v)} max={60} placeholder="City" />
            <Input aria-label="Region" value={c.form.region} onChange={(v) => c.set("region", v)} max={60} placeholder="Region" />
            <Input aria-label="Country" value={c.form.country} onChange={(v) => c.set("country", v)} max={60} placeholder="Country" />
          </div>
        </Row>
        <Row label="Google Maps link" description="Makes the address clickable. Paste the Share link from Google Maps." htmlFor="c-map">
          <Input id="c-map" type="url" value={c.form.mapUrl} onChange={(v) => c.set("mapUrl", v.trim())} max={500} placeholder="https://maps.app.goo.gl/..." />
        </Row>
        <Row label="Business hours" description="One line per entry." htmlFor="c-hours">
          <textarea id="c-hours" rows={3} value={c.form.hours} onChange={(e) => c.set("hours", e.target.value.slice(0, 200))} placeholder={"Mon - Fri: 9:00 AM - 6:00 PM\nSat: 10:00 AM - 4:00 PM"} className="field resize-y" />
        </Row>
      </Panel>

      <Panel title="Social links" description="Icons appear in the footer and on the Contact page for the profiles you add." footer={<SaveBar form={s} />}>
        {SOCIAL.map(({ key, label, placeholder }) => (
          <Row key={key} label={label} htmlFor={`social-${key}`}>
            <Input id={`social-${key}`} type="url" value={s.form[key]} onChange={(v) => s.set(key, v.trim())} max={300} placeholder={placeholder} />
          </Row>
        ))}
      </Panel>
    </div>
  );
};

// ---------- Property ----------
const PERIODS = [
  { value: "month", label: "Per month", description: "Long-term rentals" },
  { value: "night", label: "Per night", description: "Short stays" },
];

export const PropertyTab = () => {
  const f = useSettingsForm("property", { label: "Property settings", prepare: (form) => ({ ...form, maxImages: Number(form.maxImages) }) });
  const togglePeriod = (value) => {
    const next = f.form.rentPeriods.includes(value) ? f.form.rentPeriods.filter((p) => p !== value) : [...f.form.rentPeriods, value];
    if (next.length) f.set("rentPeriods", PERIODS.map((p) => p.value).filter((p) => next.includes(p)));
  };
  return (
    <Panel title="Property settings" description="Rules and options for every listing. The server enforces these when listings are created or edited." footer={<SaveBar form={f} />}>
      <Switch label="Review agent listings before publishing" description="Agent submissions go to Pending Review. Admin listings are always published directly." checked={f.form.requireApproval} onChange={(v) => f.set("requireApproval", v)} />
      <Switch label="Allow agents to publish listings" description="When off, agents can only save drafts." checked={f.form.allowAgentPublishing} onChange={(v) => f.set("allowAgentPublishing", v)} />
      <Row label="Maximum photos per property" description="A platform-wide cap. Each plan's photo limit applies within it." htmlFor="p-max">
        <input id="p-max" type="number" min="1" max="50" value={f.form.maxImages} onChange={(e) => f.set("maxImages", e.target.value)} className="field max-w-32" />
      </Row>
      <Row label="Property types" description="The options agents and admins can choose. Removing a type doesn't change listings that already use it.">
        <TagEditor values={f.form.propertyTypes} onChange={(v) => f.set("propertyTypes", v)} format={formatType} placeholder="e.g. Office Space" />
      </Row>
      <Row label="Rental price periods" description="How rent can be priced. At least one is required.">
        <div className="grid gap-2 sm:grid-cols-2">
          {PERIODS.map((p) => (
            <label key={p.value} className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 transition ${f.form.rentPeriods.includes(p.value) ? "bg-brand-50 ring-brand-300" : "ring-slate-200 hover:ring-slate-300"}`}>
              <input type="checkbox" checked={f.form.rentPeriods.includes(p.value)} onChange={() => togglePeriod(p.value)} className="mt-0.5 h-4 w-4 accent-brand-500" />
              <span>
                <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
                <span className="block text-xs text-gray-500">{p.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Row>
      <Row label="Listing types" description="Built into the offer, rental and purchase workflows, so they can't be changed here.">
        <div className="flex flex-wrap gap-2">
          {["For Sale", "For Rent"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              {t}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">Prices are in Ghana cedi (GHS), the currency Paystack charges in.</p>
      </Row>
    </Panel>
  );
};

// ---------- Agents & plans ----------
export const AgentsTab = () => {
  const { plans } = usePlatform();
  const f = useSettingsForm("agent", { label: "Agent settings" });
  return (
    <Panel title="Agents & plans" description="How agent accounts work when their subscription lapses." footer={<SaveBar form={f} />}>
      <Switch
        label="Require an active subscription"
        description="When off, agents without an active plan keep listing with the default plan's limits."
        checked={f.form.requireSubscription}
        onChange={(v) => f.set("requireSubscription", v)}
      />
      <Row label="Default plan" description="The limits used for agents without a subscription (when the switch above is off)." htmlFor="a-plan">
        <select id="a-plan" value={f.form.defaultPlan} onChange={(e) => f.set("defaultPlan", e.target.value)} className="field max-w-72">
          <option value="">No default plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inactive)"}</option>
          ))}
        </select>
      </Row>
    </Panel>
  );
};

// ---------- Payments ----------
const StatusItem = ({ ok, label, detail }) => (
  <li className="flex items-start gap-2.5">
    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
    <span className="text-sm">
      <span className="font-medium text-gray-900">{label}</span>
      {detail && <span className="block text-xs text-gray-500">{detail}</span>}
    </span>
  </li>
);

export const PaymentsTab = () => {
  const f = useSettingsForm("payments", { label: "Payment settings" });
  const status = useApiQuery("payment-status", adminApi.getPaymentStatus);
  const s = status.data;
  return (
    <div className="space-y-6">
      <Panel title="Payment provider" description="Read from the server's environment. Keys are never stored in the database or shown here.">
        <div className="px-5 py-5 sm:px-6">
          {status.loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ) : status.error ? (
            <Callout tone="red">
              Couldn't load the payment status. <button onClick={status.reload} className="font-semibold underline">Try again</button>
            </Callout>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#0ba4db]/10 text-sm font-extrabold text-[#0ba4db]">PS</span>
                <div>
                  <p className="font-semibold text-gray-900">{s.provider}</p>
                  <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${s.environment === "test" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : s.environment === "live" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600"}`}>
                    {s.environment === "test" ? "Test mode" : s.environment === "live" ? "Live: real money" : s.mode === "live" ? "Live mode not ready" : "Not configured"}
                  </span>
                </div>
              </div>
              <ul className="space-y-2.5">
                <StatusItem ok={s.secretKeyConfigured} label="Secret key" detail={`PAYSTACK_SECRET_KEY (sk_${s.mode === "live" ? "live" : "test"}_…, server only)`} />
                <StatusItem ok={s.publicKeyConfigured} label="Public key" detail={`PAYSTACK_PUBLIC_KEY (pk_${s.mode === "live" ? "live" : "test"}_…)`} />
                <StatusItem ok={s.active} label="Online payments available" detail={`Charged in ${s.currency}`} />
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 sm:px-6">
          {s?.liveBlockers?.length > 0 && (
            <Callout tone="red">
              Live payments are switched off until these are fixed:
              <ul className="mt-1 list-disc pl-5">{s.liveBlockers.map((item) => <li key={item}>{item}</li>)}</ul>
            </Callout>
          )}
          <div className={s?.liveBlockers?.length ? "mt-3" : ""}>
            <Callout icon={KeyRound}>
              {s?.environment === "live"
                ? "Checkouts charge real money. Refund flagged payments from Payments. To change keys or go back to test mode, update the server environment (PAYSTACK_MODE, PAYSTACK_SECRET_KEY) and redeploy."
                : "Test mode: no real money is charged. Live payments need PAYSTACK_MODE=live, a live secret key and the scheduled recovery job; follow the go-live checklist in DEPLOYMENT.md."}
            </Callout>
          </div>
        </div>
      </Panel>

      <Panel title="Online payments" description="Switch Paystack checkouts on or off. Payments already in progress can still be confirmed." footer={<SaveBar form={f} />}>
        <Switch label="Rental payments" description="Customers pay for rentals online with Rent Now." checked={f.form.rentalsEnabled} onChange={(v) => f.set("rentalsEnabled", v)} />
        <Switch label="Agent subscription payments" description="Agents pay for plans online at checkout." checked={f.form.subscriptionsEnabled} onChange={(v) => f.set("subscriptionsEnabled", v)} />
        <div className="px-5 py-4 sm:px-6">
          <Callout>Property purchases are never charged online. Buyers pay at the office, and the payment is confirmed from Sales.</Callout>
        </div>
      </Panel>
    </div>
  );
};

// ---------- Notifications ----------
const NOTIFICATIONS = [
  { key: "newUsers", label: "New accounts", description: "Someone signs up." },
  { key: "propertyReviews", label: "Listings to review", description: "An agent submits a listing for approval." },
  { key: "customerReviews", label: "Customer reviews", description: "A customer rates or reviews a property." },
  { key: "offers", label: "Offers", description: "Offers made or withdrawn on admin listings." },
  { key: "rentals", label: "Rental requests", description: "New rental requests on admin listings." },
  { key: "sales", label: "Purchase requests", description: "New or cancelled purchase requests on admin listings." },
  { key: "payments", label: "Payments", description: "Successful rental payments. Problem payments (duplicates, wrong amounts) are always sent." },
  { key: "messages", label: "Messages", description: "Customer chats about admin listings." },
];

export const NotificationsTab = () => {
  const f = useSettingsForm("notifications", { label: "Notification settings" });
  return (
    <Panel title="Notifications" description="What appears in the notification bell of the admin console. Agents and customers always receive their own notifications." footer={<SaveBar form={f} />}>
      {NOTIFICATIONS.map(({ key, label, description }) => (
        <Switch key={key} label={label} description={description} checked={f.form[key]} onChange={(v) => f.set(key, v)} />
      ))}
      <div className="px-5 py-4 sm:px-6">
        <Callout icon={Bell}>Email notifications aren't set up, so these control in-app notifications only.</Callout>
      </div>
    </Panel>
  );
};
