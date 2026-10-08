import { CheckCircle2 } from "lucide-react";

// Shown on the admin overview instead of an empty "Attention required" panel
export const AllClear = ({ children }) => (
  <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-5 py-3.5 text-sm text-emerald-900">
    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
    {children}
  </div>
);
