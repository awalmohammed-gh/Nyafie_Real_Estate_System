import AdminPageTitle from "../../components/admin/AdminPageTitle";
import MessagesInbox from "../../components/chat/MessagesInbox";

const AdminMessages = () => (
  <>
    <AdminPageTitle title="Messages" description="Customer chats about HomeBase listings. Agent conversations stay private to agents." />
    <MessagesInbox
      scope="admin"
      emptyTitle="No messages yet"
      emptyDescription="Chats about HomeBase listings will appear here."
    />
  </>
);

export default AdminMessages;
