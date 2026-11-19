import { cloudImageSources } from "./cloudImage.js";

// Cards request only display-sized images (galleries choose their own sizes in PropertyGallery).
export const propertyCardImageSources = (url = "") =>
  cloudImageSources(url, "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw", [320, 480, 640, 960], 640);
