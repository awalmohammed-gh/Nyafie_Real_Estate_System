import { useId, useState } from "react";
import { Link, Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { readStorage, writeStorage } from "../../utils/storage";
import { usePlatform } from "../../context/usePlatform";
import BrandLogo from "../brand/BrandLogo";

const SMOOTH_TRANSITION = { duration: 0.3, ease: [0.22, 1, 0.36, 1] };

// Both workspaces use the existing brand palette; the admin sidebar is violet.
const THEMES = {
  admin: {
    sidebar: "bg-brand-900 text-white/80",
    border: "border-white/10",
    group: "text-white/70",
    item: "text-white/80 hover:bg-white/10 hover:text-white hover:ring-white/10 focus-visible:bg-white/10 focus-visible:text-white",
    active: "bg-white/15",
    activeText: "text-white",
    activeIcon: "text-white",
    activeBar: "before:bg-white",
    badge: "bg-white/15 text-white",
    urgentBadge: "bg-amber-400/20 text-amber-200",
    brandText: "text-white",
    tone: "violet",
    brandSub: "text-white/70",
    toggle: "text-white/75 hover:bg-white/10 hover:text-white",
  },
  agent: {
    sidebar: "border-r border-gray-200 bg-white text-gray-600",
    border: "border-gray-100",
    group: "text-gray-400",
    item: "text-gray-600 hover:bg-gray-900/[0.04] hover:text-gray-900 hover:ring-gray-900/[0.06] focus-visible:bg-gray-900/[0.04] focus-visible:text-gray-900",
    active: "bg-brand-50",
    activeText: "text-brand-700",
    activeIcon: "text-brand-600",
    activeBar: "before:bg-brand-500",
    badge: "bg-brand-50 text-brand-700",
    urgentBadge: "bg-amber-100 text-amber-800",
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

// Rows are 40px on desktop and 44px in the touch drawer; urgent badges (review queues) are amber
const NavGroups = ({ groups, badges, theme, compact, touch = false, onNavigate }) => {
  const location = useLocation();
  const layoutId = useId();
  return (
    <LayoutGroup id={layoutId}>
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          {compact ? (
            <div className={`mx-auto mb-2 h-px w-6 ${theme.border} border-t`} />
          ) : (
            <p className={`mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase ${theme.group}`}>{group.label}</p>
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
                    className={`workspace-nav-link relative isolate flex ${touch ? "h-11" : "h-10"} items-center gap-3 rounded-lg px-3 text-sm font-medium ring-1 ring-transparent ring-inset transition-[background-color,color,box-shadow] duration-250 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${active ? `${theme.activeText} before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full ${theme.activeBar}` : theme.item} ${compact ? "justify-center px-0" : ""}`}
                  >
                    {active && <motion.span layoutId="active-navigation" aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 rounded-lg ${theme.active}`} transition={SMOOTH_TRANSITION} />}
                    <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? theme.activeIcon : ""}`} aria-hidden="true" />
                    {!compact && <span className="flex-1 truncate">{item.label}</span>}
                    {count > 0 &&
                      (compact ? (
                        <span className={`absolute top-2 right-2 h-2 w-2 rounded-full ${item.urgent ? "bg-amber-400" : "bg-brand-400"}`}><span className="sr-only">{count} waiting</span></span>
                      ) : (
                        <span className={`min-w-6 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums ${item.urgent ? theme.urgentBadge : theme.badge}`}>{count > 99 ? "99+" : count}<span className="sr-only"> waiting</span></span>
                      ))}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
    </LayoutGroup>
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
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : SMOOTH_TRANSITION;
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
    <MotionConfig reducedMotion="user" transition={SMOOTH_TRANSITION}>
    <div className={`dash min-h-dvh bg-gray-50 ${variant === "agent" ? "agent-workspace" : "admin-workspace"}`} style={{ "--sidebar-width": collapsed ? "4rem" : "15rem" }}>
      <ScrollRestoration />

      {/* Desktop sidebar */}
      <motion.aside initial={false} animate={{ width: collapsed ? 64 : 240 }} transition={transition} className={`workspace-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col lg:flex ${theme.sidebar}`}>
        <div className={`flex h-14 shrink-0 items-center border-b px-4 ${theme.border} ${collapsed ? "justify-center px-0" : ""}`}>
          <Brand theme={theme} label={label} compact={collapsed} />
        </div>
        <div className={`workspace-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 ${collapsed ? "px-2" : "px-3"}`}>
          <NavGroups groups={groups} badges={badges} theme={theme} compact={collapsed} />
        </div>
        {!collapsed && sidebarFooter && <div className={`border-t px-3 py-3 ${theme.border}`}>{sidebarFooter}</div>}
        <div className={`border-t p-2 ${theme.border}`}>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${theme.toggle} ${collapsed ? "justify-center" : ""}`}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </motion.aside>

      <div className={`transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "lg:pl-16" : "lg:pl-60"}`}>
        <header className="workspace-header sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="-ml-1.5 grid h-10 w-10 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
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
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-gray-950/50" />
            <motion.aside
              initial={reducedMotion ? false : { x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reducedMotion ? 0 : "-100%" }}
              transition={transition}
              className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col shadow-xl ${theme.sidebar}`}
            >
              <div className={`flex h-14 shrink-0 items-center justify-between border-b px-4 ${theme.border}`}>
                <Brand theme={theme} label={label} />
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className={`grid h-11 w-11 place-items-center rounded-lg ${theme.toggle}`}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="workspace-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
                <NavGroups groups={groups} badges={badges} theme={theme} touch onNavigate={() => setMenuOpen(false)} />
              </div>
              {sidebarFooter && <div className={`border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${theme.border}`}>{sidebarFooter}</div>}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
};

export default DashboardLayout;
