import PageTitle from "../../components/agent/PageTitle";
import MessagesInbox from "../../components/chat/MessagesInbox";
import LockedFeature from "../../components/ui/LockedFeature";
import { useAgentPermissions } from "../../hooks/useAgentPermissions";
import { lockCopy } from "../../utils/permissions";

// Without NyaFie chat on the plan, earlier conversations (and offer/rental notes) stay readable
const Messages = () => {
  const perms = useAgentPermissions();
  return (
    <>
      <PageTitle title="Messages" description="Chats from customers about your listings." />
      {!perms.canUseChat && <LockedFeature compact className="mb-6" {...lockCopy(perms, "chat")} to={perms.upgradePath} />}
      <MessagesInbox
        scope="agent"
        emptyTitle="No messages yet"
        emptyDescription={perms.canUseChat ? "When customers chat with you about your properties, their conversations appear here." : "Customers reach you through inquiries, calls, email and WhatsApp on your current plan."}
      />
    </>
  );
};

export default Messages;
