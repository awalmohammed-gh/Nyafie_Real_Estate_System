// Single-field indexes that older versions created and that a compound index now covers (the
// compound index starts with the same field, so MongoDB uses it for those queries too). Mongoose
// builds new indexes on its own but never drops old ones; `npm run indexes:sync` removes these.
export const REPLACED_INDEXES = {
  Property: { owner_1: "owner_1_createdAt_-1", status_1: "status_1_staleSince_1_createdAt_-1" },
  Inquiry: { agent_1: "agent_1_createdAt_-1" },
  Offer: { customer_1: "customer_1_createdAt_-1", owner_1: "owner_1_createdAt_-1" },
  Rental: { customer_1: "customer_1_createdAt_-1", owner_1: "owner_1_createdAt_-1" },
  SaleRequest: { customer_1: "customer_1_createdAt_-1", owner_1: "owner_1_createdAt_-1" },
  Viewing: { customer_1: "customer_1_scheduledAt_-1", owner_1: "owner_1_scheduledAt_-1" },
  Conversation: { customer_1: "customer_1_lastMessageAt_-1", owner_1: "owner_1_lastMessageAt_-1", ownerType_1: "ownerType_1_lastMessageAt_-1" },
  Message: { conversation_1: "conversation_1_createdAt_1" },
  Notification: { recipient_1: "recipient_1_createdAt_-1", audience_1: "audience_1_createdAt_-1" },
  Subscription: { user_1: "user_1_createdAt_-1" },
  SafetyReport: { status_1: "status_1_createdAt_-1" },
  DocumentCheck: { status_1: "status_1_submittedAt_1" },
  ContactMessage: { "status_1_createdAt_-1": "status_1_createdAt_-1__id_-1", "createdAt_-1": "createdAt_-1__id_-1" },
};

// MongoDB's default name for an index: { owner: 1, createdAt: -1 } -> "owner_1_createdAt_-1"
export const indexName = (keys, options = {}) => options.name || Object.entries(keys).map(([field, dir]) => `${field}_${dir}`).join("_");

// Which old indexes may go: only listed ones that exist, and only once the index replacing them exists
export const indexesToDrop = (modelName, existingNames) => {
  const existing = new Set(existingNames);
  return Object.entries(REPLACED_INDEXES[modelName] || {})
    .filter(([old, replacement]) => existing.has(old) && existing.has(replacement))
    .map(([old]) => old);
};
