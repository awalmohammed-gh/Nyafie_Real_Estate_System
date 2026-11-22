import { createContext } from "react";

// The open Settings section's group (Website, System, You) and its icon, shown as a label on each
// panel. Provided by pages/admin/AdminSettings.jsx, read by Panel in SettingsUI.jsx.
export const SettingsSectionContext = createContext(null);
