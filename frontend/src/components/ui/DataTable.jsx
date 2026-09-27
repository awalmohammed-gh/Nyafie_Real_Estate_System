import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Pager = ({ page, pages, total, pageSize, onChange }) => {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500 sm:px-5">
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page" className="grid h-7 w-7 place-items-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 tabular-nums">
          {page} / {pages}
        </span>
        <button onClick={() => onChange(page + 1)} disabled={page === pages} aria-label="Next page" className="grid h-7 w-7 place-items-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

/**
 * Responsive table: a table from md up, a compact list on phones (no sideways scrolling
 * on small screens). columns: [{ key, header, render(row), className, align }]
 * onRowClick makes whole rows open the item; pageSize adds pagination.
 */
const DataTable = ({ columns, rows, rowKey = (row) => row.id, mobileCard, empty, minWidth = 760, onRowClick, pageSize = 20 }) => {
  const [page, setPage] = useState(1);
  if (rows.length === 0) return empty;

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages); // filters may shrink the list
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const pager = <Pager page={current} pages={pages} total={rows.length} pageSize={pageSize} onChange={setPage} />;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* relative: keeps absolutely positioned children (sr-only labels) inside the scroll container */}
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={`px-3 py-2.5 font-medium whitespace-nowrap first:pl-5 last:pr-5 ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? (e) => !e.target.closest("button, a, input, select, label") && onRowClick(row) : undefined}
                className={`transition-colors hover:bg-gray-50 ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-3 align-middle first:pl-5 last:pr-5 ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-gray-100 md:hidden">
        {visible.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3.5">
            {mobileCard(row)}
          </li>
        ))}
      </ul>
      {pager}
    </div>
  );
};

export default DataTable;
