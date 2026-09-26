import { useContext } from "react";
import { PlatformContext } from "./platformContext";

export const usePlatform = () => useContext(PlatformContext);
