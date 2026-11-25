import { clearAuthCookie } from "../utils/generateToken.js";
import { browserSessionIds, endSessions, listSessions } from "../utils/sessions.js";
import { ok, fail } from "../utils/response.js";

// GET /api/auth/:area/sessions -> every place this account is signed in (customer and agent areas together)
export const mySessions = async (req, res) => ok(res, await listSessions(req, req.user));

// DELETE /api/auth/:area/sessions/:id -> one session; "others" (all but this browser) or "all"
export const endMySessions = async (req, res) => {
  const target = req.params.id;
  const here = browserSessionIds(req, req.user);
  if (target === "others") {
    const ended = await endSessions(req.user._id, "signed_out_elsewhere", { except: here });
    return ok(res, { ended }, ended ? "Signed out of your other devices" : "You aren't signed in anywhere else");
  }
  if (target === "all") {
    const ended = await endSessions(req.user._id, "signed_out_elsewhere");
    for (const area of req.sessionDomain === "admin" ? ["admin"] : ["customer", "agent"]) clearAuthCookie(res, area);
    return ok(res, { ended, signedOut: true }, "Signed out everywhere");
  }
  if (!/^[a-f\d]{24}$/i.test(target)) return fail(res, 404, "Session not found.");
  if (here.includes(target)) return fail(res, 400, "This is the device you're using. Sign out instead.");
  const ended = await endSessions(req.user._id, "signed_out_elsewhere", { id: target });
  return ended ? ok(res, { ended }, "Signed out of that device") : fail(res, 404, "That session has already ended.");
};
