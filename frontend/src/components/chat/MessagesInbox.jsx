import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, MessageSquare } from "lucide-react";
import { chatApi } from "../../frontApi";
import ChatThread from "./ChatThread";
import FilterTabs from "../ui/FilterTabs";
import EmptyState from "../ui/EmptyState";
import { timeAgo } from "../../utils/date";

const POLL_MS = 15000;

/**
 * Conversation list + open thread, shared by the three inboxes:
 *   scope "customer" -> chats the user started (/account/messages)
 *   scope "agent"    -> chats about the agent own listings (/agent/messages)
 *   scope "admin"    -> chats about HomeBase listings (/admin/messages)
 * The open conversation lives in the URL (?c=id) so it can be linked to.
 */
const MessagesInbox = ({ scope, emptyTitle, emptyDescription, emptyAction }) => {
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const selectedId = params.get("c");

  const refresh = useCallback(async () => {
    try {
      setConversations(await chatApi.getConversations(scope));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = setInterval(() => refresh().catch(() => {}), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const select = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("c", id);
    else next.delete("c");
    setParams(next, { replace: !id });
  };

  const counts = {
    all: conversations.filter((c) => c.status === "open").length,
    unread: conversations.filter((c) => c.status === "open" && c.unread > 0).length,
    closed: conversations.filter((c) => c.status === "closed").length,
  };
  const visible = conversations.filter((c) =>
    filter === "unread" ? c.status === "open" && c.unread > 0 : filter === "closed" ? c.status === "closed" : c.status === "open"
  );

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return <EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="grid h-[calc(100dvh-13rem)] min-h-[28rem] grid-cols-1 overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200 in-[.dash]:rounded-xl lg:grid-cols-[22rem_1fr]">
      {/* Conversation list (hidden on phones while a chat is open) */}
      <aside className={`min-h-0 flex-col border-gray-100 lg:flex lg:border-r ${selectedId ? "hidden" : "flex"}`}>
        <div className="border-b border-gray-100 p-3">
          <FilterTabs
            value={filter}
            onChange={setFilter}
            label="Conversation filter"
            tabs={[
              { id: "all", label: "All", count: counts.all },
              { id: "unread", label: "Unread", count: counts.unread },
              { id: "closed", label: "Closed", count: counts.closed },
            ]}
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 && <li className="p-6 text-center text-sm text-gray-500">No conversations here.</li>}
          {visible.map((c) => {
            const counterpart = c.side === "owner" ? c.customer : c.owner;
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  onClick={() => select(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition ${active ? "bg-brand-50" : "hover:bg-gray-50"}`}
                >
                  {c.property.image ? (
                    <img src={c.property.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-xl bg-gray-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>{counterpart?.name}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(c.lastMessageAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-brand-600">{c.property.title}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread ? "text-gray-800" : "text-gray-500"}`}>{c.lastMessage}</span>
                      {c.unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Open conversation */}
      <section className={`min-h-0 ${selectedId ? "block" : "hidden lg:block"}`}>
        {selectedId ? (
          <ChatThread key={selectedId} conversationId={selectedId} onBack={() => select(null)} onChanged={() => refresh().catch(() => {})} />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <MessageSquare className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">Select a conversation to read and reply.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default MessagesInbox;
