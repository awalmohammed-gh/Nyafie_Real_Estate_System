import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { canInstall, isInstalledApp, onInstallChange, promptInstall } from "../../utils/pwa";

// "Install the app": only shown when the browser says the site can be installed (not in the app itself)
const InstallAppButton = ({ className = "" }) => {
  const [available, setAvailable] = useState(() => canInstall() && !isInstalledApp());
  useEffect(() => onInstallChange((ready) => setAvailable(ready && !isInstalledApp())), []);
  if (!available) return null;
  return (
    <button type="button" onClick={() => promptInstall()} className={className}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Install the app
    </button>
  );
};

export default InstallAppButton;
