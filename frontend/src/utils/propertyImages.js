const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

// Keep original uploads for property galleries; cards request only display-sized images.
export const propertyCardImageSources = (url = "") => {
  const cloud = CLOUDINARY_UPLOAD.exec(url);
  if (!cloud) return { src: url };
  const at = (width) => `${cloud[1]}f_auto,q_auto,c_limit,w_${width}/${cloud[2]}`;
  return {
    src: at(640),
    srcSet: [320, 480, 640, 960].map((width) => `${at(width)} ${width}w`).join(", "),
    sizes: "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw",
  };
};
