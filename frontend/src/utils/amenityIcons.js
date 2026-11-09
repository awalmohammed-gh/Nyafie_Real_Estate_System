import {
  AirVent, BatteryCharging, BedSingle, Building, Car, Cctv, CheckCircle2, CookingPot, Droplets,
  Dumbbell, Fence, ShieldCheck, Sofa, Sun, Trees, Warehouse, Waves, Wifi, Zap,
} from "lucide-react";

// Amenity names are free text (owners can add their own), so match on keywords; first match wins
const ICONS = [
  [/air ?con|a\/c|\bac\b/i, AirVent],
  [/kitchen/i, CookingPot],
  [/water|borehole/i, Droplets],
  [/cctv|camera/i, Cctv],
  [/security|guard|gated/i, ShieldCheck],
  [/solar/i, Sun],
  [/generator|backup|inverter/i, BatteryCharging],
  [/electric|power/i, Zap],
  [/quarter/i, BedSingle],
  [/garden|lawn|yard/i, Trees],
  [/walled|fence|compound/i, Fence],
  [/pool/i, Waves],
  [/garage/i, Warehouse],
  [/parking|car/i, Car],
  [/wi-?fi|internet/i, Wifi],
  [/furnish|sofa/i, Sofa],
  [/gym|fitness/i, Dumbbell],
  [/balcony|elevator|lift|terrace/i, Building],
];

export const amenityIcon = (name = "") => ICONS.find(([pattern]) => pattern.test(name))?.[1] || CheckCircle2;
