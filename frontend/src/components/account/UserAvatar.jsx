import { useState } from "react";
import { getInitials } from "../../utils/property";
import { cloudImage } from "../../utils/cloudImage";

const UserAvatar = ({ user, className = "", label }) => {
  const [failedImage, setFailedImage] = useState(null);
  return (
    <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700 ${className}`}>
      {user.profileImage && failedImage !== user.profileImage ? <img src={cloudImage(user.profileImage, 96)} alt="" referrerPolicy="no-referrer" onError={() => setFailedImage(user.profileImage)} className="absolute inset-0 h-full w-full object-cover" /> : getInitials(user.name)}
    </span>
  );
};

export default UserAvatar;
