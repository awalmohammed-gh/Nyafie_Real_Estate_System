import { useContext } from "react";
import { RealEstateContext } from "./realEstateContext";

export const useRealEstate = () => useContext(RealEstateContext);
