// Display-sized copies of images stored on Cloudinary. Cloudinary resizes on its CDN, picks WebP/AVIF
// for browsers that support them (f_auto) and the lowest quality that looks the same (q_auto), so a
// 48px avatar no longer downloads the full photo. Other URLs (site files, data: previews) are returned
// unchanged.

export const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

// A fixed set of widths: every page asks for the same few copies, so each is made once and then served
// from the CDN cache (each new copy counts toward the Cloudinary plan's transformations).
const WIDTHS = [96, 160, 240, 320, 480, 640, 960, 1280, 1440, 1920, 2560];
// Vector logos and animations are served as stored
const AS_STORED = /\.(svg|gif)(?:[?#]|$)/i;
const snap = (width) => WIDTHS.find((w) => w >= width) || WIDTHS[WIDTHS.length - 1];

/** The URL at exactly `width` pixels wide (never enlarged), or the URL unchanged when it isn't on Cloudinary. */
export const cloudinaryAt = (url, width) => {
  if (typeof url !== "string") return url;
  const cloud = CLOUDINARY_UPLOAD.exec(url);
  // Already a delivery URL made here: keep it as it is
  if (!cloud || /^f_auto,/.test(cloud[2]) || AS_STORED.test(url)) return url;
  return `${cloud[1]}f_auto,q_auto,c_limit,w_${width}/${cloud[2]}`;
};

/**
 * An uploaded logo with any empty (transparent or plain) margins trimmed off (e_trim), so every logo
 * fills its height and lines up with the page edge whatever canvas it was exported on. One fixed
 * height (144px: sharp up to 48px on 3x screens) keeps it to a single cached copy per logo.
 */
export const cloudLogo = (url) => {
  if (typeof url !== "string") return url;
  const cloud = CLOUDINARY_UPLOAD.exec(url);
  if (!cloud || /^(e_trim\/|f_auto,)/.test(cloud[2]) || AS_STORED.test(url)) return url;
  return `${cloud[1]}e_trim/f_auto,q_auto,c_limit,h_144/${cloud[2]}`;
};

/**
 * For an image shown at most `displayWidth` CSS pixels wide: a copy sharp on 2x (retina) screens.
 * e.g. <img src={cloudImage(user.profileImage, 48)} className="h-12 w-12" />
 */
export const cloudImage = (url, displayWidth) => cloudinaryAt(url, snap(displayWidth * 2));

/**
 * src, srcSet and sizes for a large image whose width depends on the screen (galleries, banners).
 * The browser downloads only the copy it needs.
 */
export const cloudImageSources = (url, sizes = "100vw", widths = [480, 960, 1440, 1920], fallbackWidth = 960) => {
  if (cloudinaryAt(url, widths[0]) === url) return { src: url };
  return {
    // For browsers without srcset support
    src: cloudinaryAt(url, fallbackWidth),
    srcSet: widths.map((width) => `${cloudinaryAt(url, width)} ${width}w`).join(", "),
    sizes,
  };
};
