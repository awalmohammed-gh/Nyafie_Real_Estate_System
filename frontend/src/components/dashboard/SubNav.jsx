import { NavLink } from "react-router-dom";

/**
 * Tabs that switch between sibling pages (e.g. Offers / Rentals / Sales / Payments),
 * so related transaction screens read as one area.
 */
const SubNav = ({ items, label = "Section" }) => (
  <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 px-4 no-scrollbar sm:mx-0 sm:px-0">
    <ul className="flex w-max gap-5">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end
            className={({ isActive }) =>
              `-mb-px flex items-center gap-2 border-b-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? "border-brand-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"
              }`
            }
          >
            {item.label}
            {item.count > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 tabular-nums">{item.count}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

export default SubNav;
