import { useState } from "react";
import { Link, Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { readStorage, writeStorage } from "../../utils/storage";
import { usePlatform } from "../../context/usePlatform";
import BrandLogo from "../brand/BrandLogo";

// Visual identity per workspace: the admin console is dark, the agent workspace light
const THEMES = {
  admin: {
    sidebar: "bg-gray-950 text-gray-400",
    border: "border-white/10",
    group: "text-gray-500",
    item: "text-gray-400 hover:bg-white/[0.06] hover:text-white",
    active: "bg-white/[0.08] text-white",
    activeIcon: "text-brand-300",
    badge: "bg-brand-500 text-white",
    brandText: "text-white",
    tone: "dark",
    brandSub: "text-gray-500",
    toggle: "text-gray-500 hover:bg-white/[0.06] hover:text-white",
  },
  agent: {
    sidebar: "border-r border-gray-200 bg-white text-gray-600",
    border: "border-gray-100",
    group: "text-gray-400",
    item: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    active: "bg-brand-50 text-brand-700",
    activeIcon: "text-brand-600",
    badge: "bg-brand-500 text-white",
    brandText: "text-gray-900",
    brandSub: "text-gray-400",
    toggle: "text-gray-400 hover:bg-gray-100 hover:text-gray-700",
    tone: "light",
  },
};

// An item is active when the path matches its route (or its own `match` rule)
const isItemActive = (item, location) =>
  item.match ? item.match(location) : item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

const Brand = ({ theme, label, compact }) => {
  const { siteName } = usePlatform();
  return (
    <Link to="/" className="flex min-w-0 items-center" title={`${siteName} website`}>
      <BrandLogo tone={theme.tone} size="sm" compact={compact} subtitle={label} />
    </Link>
  );
};

const NavGroups = ({ groups, badges, theme, compact, onNavigate }) => {
  const location = useLocation();
  return (
    <nav className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          {compact ? (
            <div className={`mx-auto mb-2 h-px w-6 ${theme.border} border-t`} />
          ) : (
            <p className={`mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider uppercase ${theme.group}`}>{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isItemActive(item, location);
              const count = item.badge ? badges[item.badge] || 0 : 0;
              return (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    title={compact ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${active ? theme.active : theme.item} ${compact ? "justify-center" : ""}`}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${active ? theme.activeIcon : ""}`} />
                    {!compact && <span className="flex-1 truncate">{item.label}</span>}
                    {count > 0 &&
                      (compact ? (
                        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brand-400" />
                      ) : (
                        <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums ${theme.badge}`}>{count > 99 ? "99+" : count}</span>
                      ))}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};

/**
 * Shared shell for the admin console and the agent workspace: grouped sidebar
 * (collapsible to an icon rail on large screens, a drawer on smaller ones),
 * a compact header with breadcrumb and account controls, and the page outlet.
 */
const DashboardLayout = ({ variant, label, groups, badges = {}, headerActions, sidebarFooter, banner, ready = true, fallback }) => {
  const theme = THEMES[variant];
  const location = useLocation();
  const storageKey = `homebase:sidebar-collapsed:${variant}`;
  const [collapsed, setCollapsed] = useState(() => readStorage(storageKey, false));
  const [menuOpen, setMenuOpen] = useState(false);
  useLockBodyScroll(menuOpen);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      writeStorage(storageKey, !c);
      return !c;
    });
  };

  // Breadcrumb: the group and page of the most specific matching nav item
  const current = groups
    .flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })))
    .filter((item) => isItemActive(item, location))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return (
    // --sidebar-width lets fixed elements (e.g. the property form's save bar) line up with the sidebar
    <div className="dash min-h-dvh bg-gray-50" style={{ "--sidebar-width": collapsed ? "4rem" : "15rem" }}>
      <ScrollRestoration />

      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col transition-[width] duration-200 lg:flex ${theme.sidebar} ${collapsed ? "w-16" : "w-60"}`}>
        <div className={`flex h-14 shrink-0 items-center border-b px-4 ${theme.border} ${collapsed ? "justify-center px-0" : ""}`}>
          <Brand theme={theme} label={label} compact={collapsed} />
        </div>
        <div className={`flex-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
          <NavGroups groups={groups} badges={badges} theme={theme} compact={collapsed} />
        </div>
        {!collapsed && sidebarFooter && <div className={`border-t px-3 py-3 ${theme.border}`}>{sidebarFooter}</div>}
        <div className={`border-t p-2 ${theme.border}`}>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors ${theme.toggle} ${collapsed ? "justify-center" : ""}`}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-60"}`}>
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="-ml-1.5 grid h-9 w-9 place-items-center rounded-md text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <span className="hidden text-gray-400 sm:inline">{label}</span>
              {current && (
                <>
                  <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-gray-300 sm:block" />
                  <span className="hidden text-gray-400 md:inline">{current.group}</span>
                  <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-gray-300 md:block" />
                  <span className="truncate font-medium text-gray-900">{current.label}</span>
                </>
              )}
            </nav>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">{headerActions}</div>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {banner}
          {ready ? <Outlet /> : fallback}
        </motion.main>
      </div>

      {/* Drawer on phones and tablets */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-gray-950/50" />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
              className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col shadow-xl ${theme.sidebar}`}
            >
              <div className={`flex h-14 shrink-0 items-center justify-between border-b px-4 ${theme.border}`}>
                <Brand theme={theme} label={label} />
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className={`grid h-9 w-9 place-items-center rounded-md ${theme.toggle}`}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4">
                <NavGroups groups={groups} badges={badges} theme={theme} onNavigate={() => setMenuOpen(false)} />
              </div>
              {sidebarFooter && <div className={`border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${theme.border}`}>{sidebarFooter}</div>}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DashboardLayout;
