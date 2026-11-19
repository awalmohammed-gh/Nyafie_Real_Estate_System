/**
 * In-memory stand-in for the listed-agents aggregation in utils/marketplace.js (User.aggregate:
 * users joined to their subscription and plan in one round trip). Returns the rows it would produce:
 * { _id, subscription, priority }.
 *
 * `agents`: the candidate users, or a function returning them. `matches(user, filter)`: the test's own
 * filter matcher, applied to the aggregation's $match (role, approval, agency...); without one, only a
 * single-owner lookup ({ _id }) is filtered, like the plain find() fakes these tests used before.
 * Subscriptions are passed through as stored, as the find().populate() fakes did.
 */
export const fakeListedAgents = (agents, matches) => async (pipeline = []) => {
  const filter = pipeline[0]?.$match || {};
  const all = typeof agents === "function" ? agents() : agents;
  const selected = matches
    ? all.filter((user) => matches(user, filter))
    : all.filter((user) => !filter._id || String(user._id) === String(filter._id));
  return selected.map((user) => ({
    _id: user._id,
    subscription: user.subscription ?? null,
    priority: Boolean(user.subscription?.plan?.priorityVisibility),
  }));
};
