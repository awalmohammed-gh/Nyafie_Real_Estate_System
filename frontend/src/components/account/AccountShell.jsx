import { NavLink } from "react-router-dom";
import { Building, HandCoins, Heart, KeyRound, MessageCircle, MessageSquare, Settings, UserRound } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { getInitials } from "../../utils/property";
import { AgentBadge } from "./AccountMenu";

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

// Shared header + tab navigation for the signed-in account pages
const AccountShell = ({ title, description, children }) => {
  const { user, isAgent } = useAuth();

  return (
    <div className="bg-gray-50 pb-16">
      <div className="border-b border-gray-200 bg-white">
        <div className="container-page pt-8 sm:pt-10">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-500 text-lg font-bold text-white sm:h-16 sm:w-16">
              {getInitials(user.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">{user.name}</p>
                {isAgent && <AgentBadge />}
              </div>
              <p className="truncate text-sm text-gray-500">{user.email}</p>
            </div>
          </div>

          <nav aria-label="Account" className="-mx-4 mt-6 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-1">
              {tabs.map((tab) => (
                <li key={tab.to}>
                  <NavLink
                    to={tab.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                        isActive ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-900"
                      }`
                    }
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="container-page pt-8 sm:pt-10">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{title}</h1>
          {description && <p className="mt-1 text-gray-500">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
};

export default AccountShell;
