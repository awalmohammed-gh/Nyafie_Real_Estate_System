import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/useAuth";
import { useRealEstate } from "../../context/useRealEstate";
import { formatRelative } from "../../utils/date";
import { formatPrice } from "../../utils/property";
import { usePlatform } from "../../context/usePlatform";

const statusHelp = {
  New: "Waiting for the agent to respond",
  Contacted: "The agent has been in touch",
  Closed: "This conversation is closed",
};

const MyInquiries = () => {
  const { paths } = usePlatform();
  const { user } = useAuth();
  const { inquiries, findProperty } = useRealEstate();
  const mine = inquiries
    .filter((inq) => inq.userId === user.id || inq.email.toLowerCase() === user.email.toLowerCase())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <AccountShell title="My Inquiries" description="Messages you've sent about properties.">
      {mine.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="You haven't sent any inquiries"
          description="Open a property and use “Send inquiry” to contact the agent. Your messages will be tracked here."
          action={<Link to={paths.listings} className="btn btn-primary">Find a property</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {mine.map((inquiry) => {
            const property = findProperty(inquiry.propertyId);
            return (
              <li key={inquiry.id} className="flex flex-col gap-4 rounded-3xl bg-white p-4 ring-1 ring-gray-200 sm:flex-row sm:p-5">
                {property ? (
                  <Link to={`/house/${property.id}`} className="shrink-0">
                    <img src={property.media.images[0]} alt="" className="aspect-16/9 w-full rounded-2xl object-cover sm:h-24 sm:w-36" />
                  </Link>
                ) : (
                  <div className="grid h-24 w-36 shrink-0 place-items-center rounded-2xl bg-gray-100 text-xs text-gray-400">Removed</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{property?.title || "Property no longer listed"}</p>
                      {property && <p className="text-sm text-gray-500">{formatPrice(property)} · {property.location.name}</p>}
                    </div>
                    <StatusBadge status={inquiry.status} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-gray-600">“{inquiry.message}”</p>
                  <p className="mt-2 text-xs text-gray-400">
                    Sent {formatRelative(inquiry.createdAt)} · {statusHelp[inquiry.status]}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
};

export default MyInquiries;
