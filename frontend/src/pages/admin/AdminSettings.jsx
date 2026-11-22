import { useEffect, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";
import { Bell, Building2, CreditCard, Globe, Images, Palette, Phone, Search, Settings2, UserRound, Users } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { UnsavedContext } from "../../hooks/useSettingsForm";
import { Callout } from "../../components/admin/settings/SettingsUI";
import { SettingsSectionContext } from "../../components/admin/settings/settingsSection";
import { BrandingTab, GeneralTab, SeoTab } from "./settings/SiteTabs";
import { AgentsTab, ContactTab, NotificationsTab, PaymentsTab, PropertyTab } from "./settings/BusinessTabs";
import { AccountTab } from "./settings/AccountTab";
import { HeroTab } from "./settings/HeroTab";

const SECTIONS = [
  { group: "Website", icon: Globe, items: [
    { id: "general", label: "General", icon: Globe, Tab: GeneralTab },
    { id: "branding", label: "Branding", icon: Palette, Tab: BrandingTab },
    { id: "hero", label: "Homepage Hero", icon: Images, Tab: HeroTab },
    { id: "seo", label: "SEO & URLs", icon: Search, Tab: SeoTab },
    { id: "contact", label: "Contact & Business", icon: Phone, Tab: ContactTab },
  ] },
  { group: "System", icon: Settings2, items: [
    { id: "property", label: "Property Settings", icon: Building2, Tab: PropertyTab },
    { id: "agents", label: "Agents & Plans", icon: Users, Tab: AgentsTab },
    { id: "payments", label: "Payment Settings", icon: CreditCard, Tab: PaymentsTab },
    { id: "notifications", label: "Notifications", icon: Bell, Tab: NotificationsTab },
  ] },
  { group: "You", icon: UserRound, items: [{ id: "account", label: "Admin Account", icon: UserRound, Tab: AccountTab }] },
];
const ALL = SECTIONS.flatMap(({ group, icon, items }) => items.map((item) => ({ ...item, section: { group, icon } })));
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
      <header className="mb-6 sm:mb-8">
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900 sm:text-[32px]">Settings</h1>
        <p className="mt-1.5 text-[15px] text-gray-500">Configure the website, the system and your own admin account.</p>
      </header>

      {settingsError && (
        <div className="mb-6">
          <Callout tone="red">
            Settings couldn't be loaded from the server, so the values below may be out of date.{" "}
            <button onClick={reloadSettings} className="font-semibold underline">Try again</button>
          </Callout>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* Section navigation: a card on large screens, scrollable tabs on phones */}
        <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:rounded-2xl lg:border lg:border-[#ebe6f1] lg:bg-[#fbfafd] lg:p-3">
          <div className="flex gap-1.5 lg:flex-col lg:gap-0">
            {SECTIONS.map(({ group, items }) => (
              <div key={group} className="contents lg:block lg:border-t lg:border-[#ebe6f1] lg:pt-3 lg:pb-2 lg:first:border-t-0 lg:first:pt-0">
                <p className="hidden px-4 pt-3 pb-2 text-xs font-semibold tracking-wider text-gray-700 uppercase lg:block">{group}</p>
                <ul className="contents lg:block lg:space-y-1">
                  {items.map(({ id, label, icon: Icon }) => {
                    const isActive = id === active.id;
                    return (
                      <li key={id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => open(id)}
                          data-settings-tab
                          aria-current={isActive ? "page" : undefined}
                          className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-[15px] whitespace-nowrap transition-colors duration-200 max-lg:rounded-full max-lg:ring-1 lg:rounded-lg lg:border-l-[3px] lg:border-solid ${
                            isActive
                              ? "bg-brand-100/80 font-semibold text-gray-900 max-lg:ring-brand-200 lg:border-brand-600"
                              : "font-medium text-gray-700 hover:bg-brand-50 hover:text-gray-900 max-lg:bg-white max-lg:ring-[#ebe6f1] lg:border-transparent"
                          }`}
                        >
                          <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-brand-700" : "text-gray-500"}`} />
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
          {ALL.filter((section) => mounted.has(section.id)).map(({ id, Tab, section }) => (
            <div key={id} hidden={id !== active.id}>
              <SettingsSectionContext.Provider value={section}>
                <Tab />
              </SettingsSectionContext.Provider>
            </div>
          ))}
        </div>
      </div>
    </UnsavedContext.Provider>
  );
};

export default AdminSettings;
