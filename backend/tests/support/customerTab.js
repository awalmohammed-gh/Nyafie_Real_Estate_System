import { CUSTOMER_TAB_HEADER, tabSecretHash } from "../../utils/customerTabSession.js";

export const TEST_CUSTOMER_TAB = "ab".repeat(32);
export const customerTabClaims = (session) => session === "customer" ? { tabHash: tabSecretHash(TEST_CUSTOMER_TAB) } : {};
export const customerTabHeaders = (session = "customer") => session === "customer" ? { [CUSTOMER_TAB_HEADER]: TEST_CUSTOMER_TAB } : {};
