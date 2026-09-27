import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, Mail, Phone, Send, XCircle } from "lucide-react";
import { chatApi } from "../../frontApi";
import { useAuth } from "../../context/useAuth";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import ConfirmDialog from "../ui/ConfirmDialog";
import { formatRelative, formatTime } from "../../utils/date";

const POLL_MS = 8000;
const MAX = 2000;

// One conversation: messages, composer and actions. Refreshes by polling while open;
// the fetch function is the only thing to swap if real-time updates are added later.
const ChatThread = ({ conversationId, onBack, onChanged }) => {
  const { user } = useAuth();
  const run = useAsyncAction();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const bottomRef = useRef(null);
  const lastCount = useRef(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await chatApi.getConversationById(conversationId);
        if (!active) return;
        setData(next);
        setError("");
        if (next.conversation.unread > 0) {
          await chatApi.markConversationAsRead(conversationId);
          onChanged?.();
        }
      } catch (err) {
        if (active) setError(err.message);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // onChanged is a callback from the parent; reloading on its identity is not needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Keep the newest message in view
  useEffect(() => {
    const count = data?.messages.length || 0;
    if (count !== lastCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: lastCount.current ? "smooth" : "auto", block: "end" });
      lastCount.current = count;
    }
  }, [data]);

  const send = async (e) => {
    e?.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    const { ok, result } = await run(chatApi.sendMessage(conversationId, message));
    if (ok) {
      setText("");
      setData((prev) => ({ ...prev, messages: [...prev.messages, result] }));
      onChanged?.();
    }
    setSending(false);
  };

  const close = async () => {
    setConfirmClose(false);
    const { ok, result } = await run(chatApi.closeConversation(conversationId), { success: "Conversation closed", type: "info" });
    if (ok) {
      setData((prev) => ({ ...prev, conversation: { ...prev.conversation, status: result.status } }));
      onChanged?.();
    }
  };

  if (error && !data) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!data) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const { conversation, messages, offer } = data;
  const isOwnerSide = conversation.side === "owner";
  const counterpart = isOwnerSide ? conversation.customer : conversation.owner;
  const closed = conversation.status === "closed";
  const unavailable = ["Sold", "Rented"].includes(conversation.property.availability);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 p-3 sm:p-4">
        {onBack && (
          <button onClick={onBack} aria-label="Back to conversations" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-gray-100 lg:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {conversation.property.image && <img src={conversation.property.image} alt="" className="h-11 w-14 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{counterpart?.name}</p>
          <Link to={`/house/${conversation.property.id}`} className="block truncate text-sm text-brand-600 hover:underline">
            {conversation.property.title}
          </Link>
          {offer && (
            <p className="truncate text-xs text-gray-500">
              Offer: <span className="font-semibold text-gray-900">₵{offer.amount.toLocaleString()}</span>
              {offer.counterAmount && offer.status === "countered" && ` · Counter ₵${offer.counterAmount.toLocaleString()}`}
              {` · ${offer.status}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isOwnerSide && counterpart?.phone && (
            <a href={`tel:${counterpart.phone.replace(/\s+/g, "")}`} aria-label={`Call ${counterpart.name}`} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
              <Phone className="h-4 w-4" />
            </a>
          )}
          {isOwnerSide && counterpart?.email && (
            <a href={`mailto:${counterpart.email}`} aria-label={`Email ${counterpart.name}`} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
              <Mail className="h-4 w-4" />
            </a>
          )}
          {!closed && (
            <button onClick={() => setConfirmClose(true)} aria-label="Close conversation" title="Close conversation" className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {unavailable && (
        <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
          This property is marked {conversation.property.availability.toLowerCase()}.
        </p>
      )}

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50/60 p-4">
        {messages.map((m, i) => {
          const mine = m.senderId === user?.id;
          const newDay = i === 0 || new Date(m.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString();
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-xs font-medium text-gray-400">{formatRelative(m.createdAt)}</p>}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%] ${mine ? "rounded-br-md bg-brand-500 text-white" : "rounded-bl-md bg-white text-gray-800 ring-1 ring-gray-200"}`}>
                  <p className="whitespace-pre-line break-words">{m.message}</p>
                  <p className={`mt-1 text-right text-[11px] ${mine ? "text-brand-100" : "text-gray-400"}`}>
                    {formatTime(m.createdAt)}
                    {mine && (m.read ? " · Read" : "")}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {closed ? (
        <p className="flex items-center justify-center gap-2 border-t border-gray-100 p-4 text-sm text-gray-500">
          <Lock className="h-4 w-4" />
          This conversation is closed.
          {!isOwnerSide && " Start a new chat from the property page."}
        </p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) send(e);
              }}
              rows={1}
              placeholder="Write a message..."
              className="field max-h-32 min-h-11 resize-none py-2.5"
            />
          </label>
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send message" className="btn btn-primary h-11 w-11 shrink-0 p-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={close}
        tone="primary"
        title="Close this conversation?"
        description="No new messages can be sent in a closed conversation. The history stays available."
        confirmLabel="Close conversation"
      />
    </div>
  );
};

export default ChatThread;
