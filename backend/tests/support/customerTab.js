import { CUSTOMER_TAB_HEADER, tabSecretHash } from "../../utils/customerTabSession.js";
import { ADMIN_ENTRY_HEADER } from "../../utils/adminEntry.js";
import { TEST_SESSION } from "./sessions.js";

export const TEST_CUSTOMER_TAB = "ab".repeat(32);
// The claims a hand-signed session cookie needs: an active session, and for customers the tab it belongs to
export const customerTabClaims = (session) => ({ sid: TEST_SESSION, ...(session === "customer" ? { tabHash: tabSecretHash(TEST_CUSTOMER_TAB) } : {}) });
// Tests run with a private admin console address unless they configure their own
process.env.ADMIN_ENTRY_PATH ||= "hb-test-admin-entry-path";

// The headers a real browser tab sends for a session: the customer tab proof, or the admin
// console's private address.
export const adminEntryHeaders = () => ({ [ADMIN_ENTRY_HEADER]: process.env.ADMIN_ENTRY_PATH?.trim() });
export const customerTabHeaders = (session = "customer") => session === "customer" ? { [CUSTOMER_TAB_HEADER]: TEST_CUSTOMER_TAB } : session === "admin" ? adminEntryHeaders() : {};
