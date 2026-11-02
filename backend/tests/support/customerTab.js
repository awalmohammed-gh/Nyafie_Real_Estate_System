import { CUSTOMER_TAB_HEADER, tabSecretHash } from "../../utils/customerTabSession.js";
import { ADMIN_ENTRY_HEADER } from "../../utils/adminEntry.js";

export const TEST_CUSTOMER_TAB = "ab".repeat(32);
export const customerTabClaims = (session) => session === "customer" ? { tabHash: tabSecretHash(TEST_CUSTOMER_TAB) } : {};
// The headers a real browser tab sends for a session: the customer tab proof, or the admin
// console's private address (the development default unless a test sets ADMIN_ENTRY_PATH).
export const adminEntryHeaders = () => ({ [ADMIN_ENTRY_HEADER]: process.env.ADMIN_ENTRY_PATH?.trim() || "admin" });
export const customerTabHeaders = (session = "customer") => session === "customer" ? { [CUSTOMER_TAB_HEADER]: TEST_CUSTOMER_TAB } : session === "admin" ? adminEntryHeaders() : {};
