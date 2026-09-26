import PageTitle from "../../components/agent/PageTitle";
import MessagesInbox from "../../components/chat/MessagesInbox";

const Messages = () => (
  <>
    <PageTitle title="Messages" description="Chats from customers about your listings." />
    <MessagesInbox
      scope="agent"
      emptyTitle="No messages yet"
      emptyDescription="When customers chat with you about your properties, their conversations appear here."
    />
  </>
);

export default Messages;
