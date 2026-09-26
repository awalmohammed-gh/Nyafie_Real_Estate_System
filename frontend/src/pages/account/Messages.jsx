import { Link } from "react-router-dom";
import AccountShell from "../../components/account/AccountShell";
import MessagesInbox from "../../components/chat/MessagesInbox";

const Messages = () => (
  <AccountShell title="Messages" description="Your conversations with property owners.">
    <MessagesInbox
      scope="customer"
      emptyTitle="No messages yet"
      emptyDescription="Open a property and choose Chat with Owner to start a conversation."
      emptyAction={<Link to="/listings" className="btn btn-primary">Browse listings</Link>}
    />
  </AccountShell>
);

export default Messages;
