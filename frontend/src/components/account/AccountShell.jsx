import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Building, ChevronDown, ChevronRight, HandCoins, Heart, KeyRound, MessageCircle, MessageSquare, Settings, UserRound } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { AgentBadge } from "./AccountMenu";
import UserAvatar from "./UserAvatar";
import "./account.css";

const tabs = [
  { label: "Profile", to: "/account/profile", icon: UserRound },
  { label: "Saved", to: "/account/saved", icon: Heart },
  { label: "Conversations", to: "/account/messages", icon: MessageCircle },
  { label: "Offers", to: "/account/offers", icon: HandCoins },
  { label: "Rentals", to: "/account/rentals", icon: KeyRound },
  { label: "Purchases", to: "/account/purchases", icon: Building },
  { label: "Inquiries", to: "/account/inquiries", icon: MessageSquare },
  { label: "Settings", to: "/account/settings", icon: Settings },
];

// Every customer account page shares the sidebar and content column.
const AccountShell = ({ title, description, children }) => {
  const { user, isAgent } = useAuth();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const navigation = useRef(null);
  useEffect(() => {
    if (!isAgent) return;
    const nav = navigation.current;
    const active = nav?.querySelector('[aria-current="page"]');
    if (!active) return;
    const navBounds = nav.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    if (activeBounds.left < navBounds.left || activeBounds.right > navBounds.right) {
      nav.scrollLeft += activeBounds.left - navBounds.left - (nav.clientWidth - activeBounds.width) / 2;
    }
  }, [isAgent, pathname]);

  if (!isAgent) {
    const currentPage = tabs.find((tab) => pathname === tab.to)?.label || "Account";
    return (
      <div className="customer-account">
        <div className="customer-account-workspace">
          <aside className="customer-account-sidebar" data-expanded={expanded} aria-label="Your account">
            <div className="customer-account-sidebar-header">
              <p className="account-eyebrow">My account</p>
              <div className="customer-account-identity">
                <UserAvatar user={user} className="h-11 w-11 text-sm" />
                <div className="min-w-0"><p className="customer-account-name truncate">{user.name}</p><p className="customer-account-email truncate">{user.email}</p></div>
              </div>
            </div>
            <button type="button" className="customer-account-mobile-menu" aria-expanded={expanded} aria-controls="customer-account-navigation" onClick={() => setExpanded((previous) => !previous)}>
              <span>Account menu <span className="text-gray-400">/</span> <span className="text-brand-700">{currentPage}</span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            <nav id="customer-account-navigation" aria-label="Account" className="customer-account-sidebar-nav">
              <ul>
                {tabs.map((tab) => (
                  <li key={tab.to}>
                    <NavLink to={tab.to} className="customer-account-sidebar-link" onClick={() => setExpanded(false)}>
                      <tab.icon className="h-4 w-4 shrink-0" /><span>{tab.label}</span><ChevronRight aria-hidden="true" className="customer-account-active-arrow ml-auto h-3.5 w-3.5" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
          <div className="customer-account-content">
            <header className="customer-account-title"><h1>{title}</h1>{description && <p>{description}</p>}</header>
            {children}
          </div>
        </div>
      </div>
    );
  }

  const agentTabs = tabs.filter((tab) => ["Profile", "Settings"].includes(tab.label)).map((tab) => ({ ...tab, to: tab.to.replace("/account/", "/agent/") }));
  return (
    <div className="bg-gray-50 pb-16">
      <div className="border-b border-gray-200 bg-white">
        <div className="container-page pt-8 sm:pt-10">
          <div className="flex items-center gap-4">
            <UserAvatar user={user} className="h-14 w-14 text-lg sm:h-16 sm:w-16" />
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">{user.name}</p><AgentBadge /></div><p className="truncate text-sm text-gray-500">{user.email}</p></div>
          </div>
          <nav ref={navigation} aria-label="Account" className="-mx-4 mt-6 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-1">{agentTabs.map((tab) => <li key={tab.to}><NavLink to={tab.to} className={({ isActive }) => `flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${isActive ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-900"}`}><tab.icon className="h-4 w-4" />{tab.label}</NavLink></li>)}</ul>
          </nav>
        </div>
      </div>
      <div className="container-page pt-8 sm:pt-10"><div className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{title}</h1>{description && <p className="mt-1 text-gray-500">{description}</p>}</div>{children}</div>
    </div>
  );
};

export default AccountShell;
