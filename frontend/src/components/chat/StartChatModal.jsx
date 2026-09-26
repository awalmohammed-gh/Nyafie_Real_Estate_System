import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import Modal from "../ui/Modal";
import { chatApi } from "../../frontApi";

// Opens (or continues) a website chat with the owner of a property
const StartChatModal = ({ property, ownerName, open, onClose }) => {
  const navigate = useNavigate();
  const [message, setMessage] = useState(`Hi, is "${property.title}" still available?`);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      const conversation = await chatApi.createConversation(property.id, message.trim());
      onClose();
      navigate(`/account/messages?c=${conversation.id}`);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Chat with ${ownerName}`} description={`About ${property.title}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Your message</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 2000))} rows={4} required className="field resize-none" />
        </label>
        <p className="text-xs text-gray-500">Replies appear in your Messages, and you can continue the conversation there.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={sending || !message.trim()} className="btn btn-primary w-full py-3.5">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send message
        </button>
      </form>
    </Modal>
  );
};

export default StartChatModal;
