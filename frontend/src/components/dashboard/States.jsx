import { AlertTriangle, RotateCcw } from "lucide-react";

// Placeholder rows shaped like the table/list that is loading
export const TableSkeleton = ({ rows = 6, columns = 5 }) => (
  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-busy="true" aria-label="Loading">
    <div className="hidden border-b border-gray-100 bg-gray-50 px-5 py-3 md:flex md:gap-6">
      {Array.from({ length: columns }, (_, i) => (
        <span key={i} className="h-2.5 flex-1 animate-pulse rounded bg-gray-200/70" />
      ))}
    </div>
    <ul className="divide-y divide-gray-100">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
          <span className="h-9 w-12 shrink-0 animate-pulse rounded-md bg-gray-100" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-gray-100" />
            <span className="block h-2.5 w-1/3 animate-pulse rounded bg-gray-100" />
          </span>
          <span className="hidden h-5 w-20 animate-pulse rounded-full bg-gray-100 sm:block" />
        </li>
      ))}
    </ul>
  </div>
);

// Page-shaped skeleton shown while the dashboard's data first loads
export const DashboardSkeleton = () => (
  <div aria-busy="true" aria-label="Loading">
    <div className="mb-6 space-y-2">
      <span className="block h-6 w-48 animate-pulse rounded bg-gray-200/70" />
      <span className="block h-3.5 w-72 animate-pulse rounded bg-gray-200/60" />
    </div>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-100 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2 bg-white px-5 py-4">
          <span className="block h-2.5 w-20 animate-pulse rounded bg-gray-100" />
          <span className="block h-6 w-12 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white lg:col-span-2" />
      <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
    </div>
  </div>
);

// A failed request, with a way to try again (instead of a browser alert)
export const ErrorState = ({ title = "Couldn't load this page", message, onRetry }) => (
  <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-5 sm:flex-row sm:items-center">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600">
      <AlertTriangle className="h-4.5 w-4.5" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-red-900">{title}</p>
      {message && <p className="text-sm text-red-800/80">{message}</p>}
    </div>
    {onRetry && (
      <button onClick={onRetry} className="btn btn-light px-3.5 py-2">
        <RotateCcw className="h-4 w-4" />
        Try again
      </button>
    )}
  </div>
);
