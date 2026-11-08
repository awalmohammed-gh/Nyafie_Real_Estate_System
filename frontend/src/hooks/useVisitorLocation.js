import { useSyncExternalStore } from "react";
import { forgetPosition, getSnapshot, rememberPlace, requestDevicePosition, setChoice, subscribe } from "../utils/visitorLocation";

// { status, position, choice, place } plus the actions that change them (see utils/visitorLocation.js)
export const useVisitorLocation = () => ({
  ...useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  requestDevicePosition,
  setChoice,
  rememberPlace,
  forgetPosition,
});
