import { createContext, useContext, useLayoutEffect } from "react";

// Lets a page's dark hero tell the site layout it is on screen, so the navbar can sit
// transparently on top of it. Value: register() -> unregister (null outside the public site).
export const NavOverlayContext = createContext(null);

// Call from a hero component. Runs before paint, so the navbar never flashes solid first.
export const useNavOverlay = () => {
  const register = useContext(NavOverlayContext);
  useLayoutEffect(() => register?.(), [register]);
};
