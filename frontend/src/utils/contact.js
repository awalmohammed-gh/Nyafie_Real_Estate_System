// Business contact details from Admin Settings, shaped for the footer and contact page.
// Empty fields are skipped, so nothing is shown that the admin hasn't filled in.
export const businessContactItems = (c) =>
  [
    { kind: "address", lines: [c.address, [c.city, c.region, c.country].filter(Boolean).join(", ")].filter(Boolean), href: c.mapUrl || undefined },
    c.phone && { kind: "phone", lines: [c.phone], href: `tel:${c.phone.replace(/[^\d+]/g, "")}` },
    c.email && { kind: "email", lines: [c.email], href: `mailto:${c.email}` },
    c.hours && { kind: "hours", lines: c.hours.split("\n").map((l) => l.trim()).filter(Boolean) },
  ].filter((item) => item && item.lines.length);
