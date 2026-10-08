import AdminPageTitle from "../../components/admin/AdminPageTitle";
import MessagesInbox from "../../components/chat/MessagesInbox";
import { usePlatform } from "../../context/usePlatform";

const AdminMessages = () => {
  const { siteName } = usePlatform();
  return (
  <>
    <AdminPageTitle title="Messages" description={`Customer chats about ${siteName} listings. Agent conversations stay private to agents.`} />
    <MessagesInbox
      scope="admin"
      emptyTitle="No messages yet"
      emptyDescription={`Chats about ${siteName} listings will appear here.`}
    />
  </>
  );
};

export default AdminMessages;
