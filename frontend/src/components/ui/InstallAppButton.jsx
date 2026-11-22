import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { canInstall, isInstalledApp, onInstallChange, promptInstall } from "../../utils/pwa";

// "Install the app": only shown when the browser says this page's app can be installed (not in the
// app itself). Which app that is depends on the area: the site, the agent workspace or the admin
// console (utils/appManifest.js). label/labelClassName let a toolbar show a shorter or icon-only button.
const InstallAppButton = ({ className = "", label = "Install the app", labelClassName = "" }) => {
  const [available, setAvailable] = useState(() => canInstall() && !isInstalledApp());
  useEffect(() => onInstallChange((ready) => setAvailable(ready && !isInstalledApp())), []);
  if (!available) return null;
  return (
    <button type="button" onClick={() => promptInstall()} className={className} title={label}>
      <Download className="h-4 w-4" aria-hidden="true" />
      <span className={labelClassName}>{label}</span>
    </button>
  );
};

export default InstallAppButton;
