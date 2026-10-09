// The kinds of agent account. Every plan is for one of them; agencies and companies are organisations
// with a team (owner + staff), shared listings and leads, and one subscription for the whole organisation.
export const ACCOUNT_TYPES = ["individual", "agency", "company"];
export const ORGANIZATION_TYPES = ["agency", "company"];
export const isOrganization = (type) => ORGANIZATION_TYPES.includes(type);
export const ACCOUNT_LABELS = { individual: "Individual Agent", agency: "Agency", company: "Company" };
