import { useNavOverlay } from "../../context/navOverlay";

// Place inside a dark hero/header: while it is rendered, the navbar is transparent over it
// (the hero must leave room at the top for the navbar: h-16, lg:h-20).
const NavOverlay = () => {
  useNavOverlay();
  return null;
};

export default NavOverlay;
