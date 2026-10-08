import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Pager = ({ page, pages, total, pageSize, onChange }) => {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2 text-xs text-gray-500 sm:px-6">
      <span className="tabular-nums" aria-live="polite">
        {pages > 1 ? `${from}–${to} of ${total}` : `${total} ${total === 1 ? "result" : "results"}`}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page" className="grid h-10 w-10 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-1 tabular-nums">
            Page {page} of {pages}
          </span>
          <button onClick={() => onChange(page + 1)} disabled={page === pages} aria-label="Next page" className="grid h-10 w-10 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// Width of an element, kept up to date as the layout changes (sidebar collapse, rotation, resize)
const useWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

/**
 * Responsive table. Shows a real table only when the space it gets is at least `minWidth`
 * (the width its columns need); until then each row is a compact card, so tablets and a
 * collapsed/expanded sidebar never produce a cramped or sideways-scrolling table.
 * columns: [{ key, header, render(row), className, align }]
 * onRowClick makes whole rows open the item; pageSize adds pagination.
 */
const DataTable = ({ columns, rows, rowKey = (row) => row.id, mobileCard, empty, minWidth = 760, onRowClick, pageSize = 20 }) => {
  const [page, setPage] = useState(1);
  const [ref, width] = useWidth();
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages); // filters may shrink the list
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const asTable = width !== null && width >= minWidth;

  return (
    <div ref={ref} className={rows.length === 0 ? "" : "admin-card overflow-hidden"}>
      {rows.length === 0 ? (
        empty
      ) : asTable ? (
        <div className="relative">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-500">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} scope="col" className={`px-3 py-3 font-medium whitespace-nowrap first:pl-6 last:pr-6 ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}>
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
                    <td key={col.key} className={`px-3 py-3.5 align-middle first:pl-6 last:pr-6 ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((row) => (
            <li key={rowKey(row)} className="px-4 py-4 sm:px-6">
              {mobileCard(row)}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && <Pager page={current} pages={pages} total={rows.length} pageSize={pageSize} onChange={setPage} />}
    </div>
  );
};

export default DataTable;
