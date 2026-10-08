import { useEffect, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";
import { Bell, Building2, CreditCard, Globe, Images, Palette, Phone, Search, UserRound, Users } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { UnsavedContext } from "../../hooks/useSettingsForm";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import { Callout } from "../../components/admin/settings/SettingsUI";
import { BrandingTab, GeneralTab, SeoTab } from "./settings/SiteTabs";
import { AgentsTab, ContactTab, NotificationsTab, PaymentsTab, PropertyTab } from "./settings/BusinessTabs";
import { AccountTab } from "./settings/AccountTab";
import { HeroTab } from "./settings/HeroTab";

const SECTIONS = [
  { group: "Website", items: [
    { id: "general", label: "General", icon: Globe, Tab: GeneralTab },
    { id: "branding", label: "Branding", icon: Palette, Tab: BrandingTab },
    { id: "hero", label: "Homepage Hero", icon: Images, Tab: HeroTab },
    { id: "seo", label: "SEO & URLs", icon: Search, Tab: SeoTab },
    { id: "contact", label: "Contact & Business", icon: Phone, Tab: ContactTab },
  ] },
  { group: "System", items: [
    { id: "property", label: "Property Settings", icon: Building2, Tab: PropertyTab },
    { id: "agents", label: "Agents & Plans", icon: Users, Tab: AgentsTab },
    { id: "payments", label: "Payment Settings", icon: CreditCard, Tab: PaymentsTab },
    { id: "notifications", label: "Notifications", icon: Bell, Tab: NotificationsTab },
  ] },
  { group: "You", items: [{ id: "account", label: "Admin Account", icon: UserRound, Tab: AccountTab }] },
];
const ALL = SECTIONS.flatMap((s) => s.items);
const LEAVE_MESSAGE = "You have unsaved changes. Leave without saving?";

/**
 * Admin Settings: the whole system's configuration (stored in MongoDB, applied site-wide)
 * plus the admin's own account. Every section saves on its own with "Save Changes".
 */
const AdminSettings = () => {
  const { settingsError, reloadSettings } = usePlatform();
  const [params, setParams] = useSearchParams();
  const [unsaved] = useState(() => new Set());
  const active = ALL.find((s) => s.id === params.get("tab")) || ALL[0];
  // Sections stay mounted once opened, so unsaved edits survive switching between them
  const [visited, setVisited] = useState(() => new Set([active.id]));
  const mounted = visited.has(active.id) ? visited : new Set([...visited, active.id]);

  const open = (id) => {
    if (id === active.id) return;
    setVisited((prev) => new Set(prev).add(id));
    setParams({ tab: id }, { replace: true });
  };

  // Warn before leaving the page (other admin pages, reload or closing the tab) with unsaved edits
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved.size > 0 && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(LEAVE_MESSAGE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const warn = (e) => {
      if (!unsaved.size) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // On phones the section tabs scroll sideways: keep the open one visible
  useEffect(() => {
    document.querySelector("[data-settings-tab][aria-current]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active.id]);


  return (
    <UnsavedContext.Provider value={unsaved}>
      <AdminPageTitle title="Settings" description="Configure the website, the system and your own admin account." />

      {settingsError && (
        <div className="mb-6">
          <Callout tone="red">
            Settings couldn't be loaded from the server, so the values below may be out of date.{" "}
            <button onClick={reloadSettings} className="font-semibold underline">Try again</button>
          </Callout>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        {/* Section navigation: a sidebar on large screens, scrollable tabs on phones */}
        <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0">
          <div className="flex gap-1 lg:flex-col lg:gap-5">
            {SECTIONS.map(({ group, items }) => (
              <div key={group} className="contents lg:block">
                <p className="hidden px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-gray-400 uppercase lg:block">{group}</p>
                <ul className="contents lg:block lg:space-y-0.5">
                  {items.map(({ id, label, icon: Icon }) => {
                    const isActive = id === active.id;
                    return (
                      <li key={id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => open(id)}
                          data-settings-tab
                          aria-current={isActive ? "page" : undefined}
                          className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ring-1 transition-[background-color,color,box-shadow] duration-250 ease-out ${
                            isActive ? "bg-white text-gray-900 shadow-sm ring-slate-200" : "text-gray-600 ring-transparent hover:bg-white/70 hover:text-gray-900 hover:shadow-sm hover:ring-slate-200/70 focus-visible:bg-white/70 focus-visible:text-gray-900"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${isActive ? "text-brand-600" : "text-gray-400"}`} />
                          {label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {ALL.filter((section) => mounted.has(section.id)).map(({ id, Tab }) => (
            <div key={id} hidden={id !== active.id}>
              <Tab />
            </div>
          ))}
        </div>
      </div>
    </UnsavedContext.Provider>
  );
};

export default AdminSettings;
