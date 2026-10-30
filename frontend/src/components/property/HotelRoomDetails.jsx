import { useState } from "react";
import { Bed, Check, Maximize2, Users } from "lucide-react";
import Modal from "../ui/Modal";
import { roomPrice } from "../../utils/hotel";

const Gallery = ({ room }) => {
  const [index, setIndex] = useState(0);
  if (!room.images.length)
    return (
      <div className="grid aspect-video place-items-center rounded-xl bg-gray-100 text-gray-500">
        Room photos coming soon
      </div>
    );
  return (
    <div>
      <img
        src={room.images[index]}
        alt={`${room.name} photo ${index + 1}`}
        className="aspect-video w-full rounded-xl object-cover"
      />
      {room.images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {room.images.map((src, i) => (
            <button
              type="button"
              key={`${src}-${i}`}
              aria-label={`Show room photo ${i + 1}`}
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
              className={`shrink-0 overflow-hidden rounded-lg border-2 ${index === i ? "border-brand-600" : "border-transparent"}`}
            >
              <img src={src} alt="" className="h-16 w-24 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
const HotelRoomDetails = ({
  room,
  currency = "GHS",
  onClose,
  onSelect,
  availability,
}) => (
  <Modal
    open={Boolean(room)}
    onClose={onClose}
    title={room?.name || "Room details"}
    description="Room amenities and details"
    size="lg"
    footer={
      onSelect && (
        <button
          type="button"
          onClick={() => onSelect(room)}
          disabled={availability === 0}
          className="btn btn-primary"
        >
          {availability === 0 ? "Unavailable for these dates" : "Select Room"}
        </button>
      )
    }
  >
    {room && (
      <div className="space-y-5">
        <Gallery key={room.id} room={room} />
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold text-gray-900">{room.name}</h3>
          <p className="font-semibold text-brand-700">
            {roomPrice(room.pricePerNight, currency)}
            <span className="text-sm font-normal text-gray-500"> / night</span>
          </p>
        </div>
        <p className="text-sm leading-6 whitespace-pre-line text-gray-600">
          {room.description}
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Up to {room.maxGuests} guests
          </span>
          <span className="flex items-center gap-1.5">
            <Bed className="h-4 w-4" />
            {room.beds} bed(s) · {room.bedType}
          </span>
          {room.size > 0 && (
            <span className="flex items-center gap-1.5">
              <Maximize2 className="h-4 w-4" />
              {room.size} {room.sizeUnit}
            </span>
          )}
        </div>
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
          {availability != null
            ? `${availability} rooms available for your dates`
            : `${room.quantity} rooms in this category. Choose dates to check availability.`}
        </p>
        <section>
          <h3 className="font-semibold text-gray-900">
            What's inside this room
          </h3>
          {room.amenities.length ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {room.amenities.map((a) => (
                <li
                  key={a}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <Check className="h-4 w-4 shrink-0 text-brand-600" />
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Contact the hotel for included room amenities.
            </p>
          )}
        </section>
      </div>
    )}
  </Modal>
);
export default HotelRoomDetails;
