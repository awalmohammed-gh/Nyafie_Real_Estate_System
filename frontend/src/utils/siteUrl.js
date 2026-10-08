export const publicSiteUrl = (settings) => import.meta.env.VITE_PUBLIC_SITE_URL || settings?.seo?.baseUrl || window.location.origin;
export const propertyUrl = (id, settings) => new URL(`/house/${id}`, publicSiteUrl(settings)).href;
