import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { getInitials } from "../../utils/property";
import { adminPath } from "../../utils/adminEntry";

// Signed-in account at the bottom of the dashboard sidebar, with its role and a logout button
const SidebarAccount = ({ roleLabel, tone = "light" }) => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  if (!user) return null;
  const dark = tone === "dark";

  const signOut = async () => {
    try {
      await logout();
      toast({ title: "You've been signed out", type: "info" });
      navigate(user.role === "admin" ? adminPath("/login") : "/agent/login");
    } catch (error) {
      toast({ title: "Could not sign out", description: error.message, type: "error" });
    }
  };

  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">{getInitials(user.name)}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={`block truncate text-sm font-medium ${dark ? "text-white" : "text-gray-900"}`}>{user.name}</span>
        <span className={`block truncate text-[11px] ${dark ? "text-white/70" : "text-gray-500"}`}>{roleLabel}</span>
      </span>
      <button
        type="button"
        onClick={signOut}
        title="Log out"
        aria-label="Log out"
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors ${dark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
};

export default SidebarAccount;
