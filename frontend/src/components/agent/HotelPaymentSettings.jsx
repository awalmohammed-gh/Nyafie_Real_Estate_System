import { useEffect, useState } from "react";
import { BadgeCheck, Banknote, Building2, CreditCard, Loader2, Smartphone } from "lucide-react";
import { hotelApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";


const Option = ({ icon: Icon, title, description, checked, onChange }) => (
  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked ? "border-brand-300 bg-brand-50/60" : "border-gray-200 bg-white hover:border-gray-300"}`}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4.5 w-4.5 shrink-0 accent-brand-600" />
    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-gray-900">{title}</span>
      <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>
    </span>
  </label>
);

/**
 * Editor section for a hotel or a rental priced per night ("rental"): which payment options guests
 * get, the arrival deadline and the cancellation / no-show policy. Hotel online payments settle to
 * the hotel's own payout account (agent hotels) or to the platform account (the platform's own
 * hotels); per-night rentals use the existing rental checkout, so they need no payout account.
 */
const HotelPaymentSettings = ({ value, onChange, error, propertyId, platform, ownerConnects = false, stay = "hotel" }) => {
  const set = (key) => (next) => onChange({ ...value, [key]: next });
  const rental = stay === "rental";
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {rental
          ? <Option icon={Banknote} title="Reserve now, pay on arrival" description="Guests reserve their dates and pay you when they arrive. The dates are held until your arrival deadline." checked={value.payOnArrival} onChange={set("payOnArrival")} />
          : <Option icon={Banknote} title="Reserve now, pay at the hotel" description="Guests reserve their rooms and pay on arrival. Rooms are held until your arrival deadline." checked={value.payOnArrival} onChange={set("payOnArrival")} />}
        <Option icon={CreditCard} title="Pay online" description={rental ? "Guests pay by card or mobile money through Paystack when they book." : platform ? "Guests pay by card or mobile money when they book. Payments go to the platform account." : "Guests pay by card or mobile money when they book. Payments go straight to your payout account."} checked={value.payOnline} onChange={set("payOnline")} />
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      {value.payOnArrival && (
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <label className="text-sm font-medium text-gray-700">
            Arrival deadline
            <input type="time" value={value.arrivalDeadline} onChange={(e) => set("arrivalDeadline")(e.target.value || "18:00")} className="field mt-1.5" />
            <span className="mt-1.5 block text-xs font-normal text-gray-500">On the check-in day (Ghana time)</span>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Cancellation and no-show policy
            <textarea value={value.cancellationPolicy} onChange={(e) => set("cancellationPolicy")(e.target.value.slice(0, 800))} rows={3} maxLength={800} placeholder="e.g. Free cancellation until the day before arrival. Guests who don't arrive by the deadline may lose their reservation." className="field mt-1.5 resize-y" />
          </label>
        </div>
      )}
      {!rental && ownerConnects && value.payOnline && <p className="text-xs text-gray-500">The hotel's owner connects the payout account for online payments from their own workspace. Until then, guests can only pay at the hotel.</p>}
      {!rental && value.payOnline && !platform && !ownerConnects && (propertyId
        ? <PayoutAccount propertyId={propertyId} />
        : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Save the hotel first, then connect the bank account or mobile money wallet that should receive online payments. Until then, guests can only pay at the hotel.</p>)}
    </div>
  );
};

const TYPES = [
  { value: "bank", label: "Bank account", icon: Building2 },
  { value: "mobile_money", label: "Mobile money", icon: Smartphone },
];

// The hotel's payout account. Only the account owner can see or change it, with their password.
const PayoutAccount = ({ propertyId }) => {
  const { data, error, loading, reload } = useApiQuery(`payout:${propertyId}`, () => hotelApi.getPayout(propertyId));
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(null);
  const payout = saved || data;

  if (loading) return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Checking your payout account…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error} <button type="button" onClick={reload} className="font-semibold underline">Try again</button></p>;
  if (!payout.available) return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Online payments aren't set up on the platform yet. Guests can pay at the hotel for now.</p>;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold text-gray-900">Payout account</p>
      <p className="mt-0.5 text-xs leading-5 text-gray-500">Online payments for this hotel are settled to this account by Paystack, minus Paystack's fee. Guests can't pay online until it's connected.</p>
      {payout.connected && !editing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3">
          <p className="flex items-start gap-2 text-sm text-emerald-900">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span><strong>{payout.bankName}</strong> ending {payout.accountLast4}{payout.accountName && <span className="block text-xs">{payout.accountName}</span>}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn btn-light px-3 py-1.5 text-xs">Change</button>
            <button type="button" onClick={async () => { try { setSaved(await hotelApi.disconnectPayout(propertyId)); } catch { reload(); } }} className="btn btn-light px-3 py-1.5 text-xs text-red-600">Remove</button>
          </div>
        </div>
      ) : (
        <PayoutForm propertyId={propertyId} onCancel={payout.connected ? () => setEditing(false) : null} onSaved={(next) => { setSaved(next); setEditing(false); }} />
      )}
    </div>
  );
};

const PayoutForm = ({ propertyId, onCancel, onSaved }) => {
  const [type, setType] = useState("bank");
  const [banks, setBanks] = useState({ type: null, list: [], error: "" });
  const [form, setForm] = useState({ bankCode: "", accountNumber: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let active = true;
    hotelApi.getPayoutBanks(type)
      .then((list) => active && setBanks({ type, list, error: "" }))
      .catch((err) => active && setBanks({ type, list: [], error: err.message }));
    return () => { active = false; };
  }, [type]);
  const choose = (next) => { setType(next); setForm((prev) => ({ ...prev, bankCode: "" })); setProblem(""); };
  const set = (key) => (e) => { setForm((prev) => ({ ...prev, [key]: e.target.value })); setProblem(""); };
  // A form inside the listing editor's form: submit by button, never the outer form
  const connect = async () => {
    if (!form.bankCode || !form.accountNumber.trim() || !form.password) return setProblem("Fill in every field.");
    setBusy(true); setProblem("");
    try { onSaved(await hotelApi.connectPayout(propertyId, { type, ...form })); }
    catch (err) { setProblem(err.message); setForm((prev) => ({ ...prev, password: "" })); }
    finally { setBusy(false); }
  };
  const mobile = type === "mobile_money";
  return (
    <div className="mt-3 space-y-4">
      <div role="radiogroup" aria-label="Payout type" className="inline-flex gap-1 rounded-xl bg-gray-100 p-1">
        {TYPES.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" role="radio" aria-checked={type === value} onClick={() => choose(value)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${type === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          {mobile ? "Network" : "Bank"}
          <select value={form.bankCode} onChange={set("bankCode")} disabled={banks.type !== type} className="field mt-1.5">
            <option value="">{banks.type !== type ? "Loading…" : mobile ? "Choose the network" : "Choose the bank"}</option>
            {banks.type === type && banks.list.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
          </select>
          {banks.error && <span className="mt-1 block text-xs font-normal text-red-600">{banks.error}</span>}
        </label>
        <label className="text-sm font-medium text-gray-700">
          {mobile ? "Mobile money number" : "Account number"}
          <input value={form.accountNumber} onChange={set("accountNumber")} inputMode="numeric" autoComplete="off" maxLength={24} placeholder={mobile ? "0241234567" : "Digits only"} className="field mt-1.5" />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Your password
          <input type="password" value={form.password} onChange={set("password")} autoComplete="current-password" className="field mt-1.5" />
          <span className="mt-1 block text-xs font-normal text-gray-500">Needed to change where money is sent. You'll get a notification of every change.</span>
        </label>
      </div>
      {problem && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={connect} disabled={busy} className="btn btn-primary">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Connect payout account</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-light">Cancel</button>}
      </div>
    </div>
  );
};

export default HotelPaymentSettings;
