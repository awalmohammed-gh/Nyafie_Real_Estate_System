const NAMES = new Set(["MongooseServerSelectionError", "MongoServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError"]);
const CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ETIMEOUT", "ENOTFOUND", "EAI_AGAIN", "ESERVFAIL"]); // the last ones: DNS

// The database couldn't be reached, as opposed to a wrong password or a missing setting (retrying won't help those)
export const isConnectionProblem = (error) => Boolean(error && (NAMES.has(error.name) || CODES.has(error.code)));
