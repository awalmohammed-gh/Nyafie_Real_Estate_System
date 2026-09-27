import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePlatform } from "../context/usePlatform";
import { useToast } from "../context/useToast";

// Sections with unsaved edits, so the settings page can warn before switching tabs or leaving
export const UnsavedContext = createContext(null);

/**
 * Form state for one settings section (general, seo, contact...). Nothing is sent until save():
 * the server validates and stores the section, and the saved values then flow back through
 * PlatformProvider to the whole app. `prepare` turns the form into the request body.
 */
export const useSettingsForm = (section, { label, prepare = (form) => form } = {}) => {
  const { settings, updateSettings } = usePlatform();
  const { toast } = useToast();
  const unsaved = useContext(UnsavedContext);
  const saved = settings[section];
  const savedKey = JSON.stringify(saved);

  const [form, setForm] = useState(saved);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [error, setError] = useState("");

  // After a save (or a reload) the form shows the stored values
  const [lastSavedKey, setLastSavedKey] = useState(savedKey);
  if (savedKey !== lastSavedKey) {
    setLastSavedKey(savedKey);
    setForm(saved);
  }

  const dirty = JSON.stringify(form) !== savedKey;

  useEffect(() => {
    if (!unsaved) return undefined;
    if (dirty) unsaved.add(section);
    else unsaved.delete(section);
    return () => unsaved.delete(section);
  }, [dirty, section, unsaved]);

  const set = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
    setError("");
  }, []);

  const reset = useCallback(() => {
    setForm(JSON.parse(savedKey));
    setStatus("idle");
    setError("");
  }, [savedKey]);

  const save = async () => {
    setStatus("saving");
    setError("");
    try {
      await updateSettings(section, prepare(form));
      setStatus("saved");
      toast({ title: "Saved successfully", description: label });
      return true;
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Please try again.");
      toast({ type: "error", title: "Failed to save", description: err.message });
      return false;
    }
  };

  return { form, set, dirty, status, error, save, reset };
};
