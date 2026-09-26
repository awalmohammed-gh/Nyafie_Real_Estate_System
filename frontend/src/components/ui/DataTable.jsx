import { motion } from "motion/react";

// Responsive table: a horizontally scrollable table from md up, cards on phones.
// columns: [{ key, header, render(row), className, align }]
const DataTable = ({ columns, rows, rowKey = (row) => row.id, mobileCard, empty, minWidth = 760 }) => {
  if (rows.length === 0) return empty;

  return (
    <>
      {/* relative: keeps absolutely positioned children (sr-only labels) inside the scroll container */}
      <div className="relative hidden overflow-x-auto rounded-3xl bg-white ring-1 ring-gray-200 md:block">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold tracking-wider text-gray-500 uppercase">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={`px-4 py-3.5 first:pl-5 last:pr-5 ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <motion.tr
                key={rowKey(row)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(index * 0.02, 0.2) }}
                className="transition-colors hover:bg-gray-50/60"
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 align-middle first:pl-5 last:pr-5 ${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-3xl bg-white p-4 ring-1 ring-gray-200">
            {mobileCard(row)}
          </li>
        ))}
      </ul>
    </>
  );
};

export default DataTable;
