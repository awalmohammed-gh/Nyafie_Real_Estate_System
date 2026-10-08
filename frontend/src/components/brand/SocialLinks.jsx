import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaXTwitter, FaYoutube } from "react-icons/fa6";

const NETWORKS = [
  { key: "facebook", label: "Facebook", icon: FaFacebookF },
  { key: "instagram", label: "Instagram", icon: FaInstagram },
  { key: "x", label: "X", icon: FaXTwitter },
  { key: "linkedin", label: "LinkedIn", icon: FaLinkedinIn },
  { key: "youtube", label: "YouTube", icon: FaYoutube },
  { key: "tiktok", label: "TikTok", icon: FaTiktok },
];

// Social profiles from Admin Settings > Contact & Business; only the ones filled in are shown
const SocialLinks = ({ social, tone = "dark", className = "" }) => {
  const links = NETWORKS.filter((n) => social?.[n.key]);
  if (!links.length) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {links.map(({ key, label, icon: Icon }) => (
        <li key={key}>
          <a
            href={social[key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className={`grid h-9 w-9 place-items-center rounded-full transition ${
              tone === "dark" ? "bg-white/10 text-gray-300 hover:bg-brand-500 hover:text-white" : "bg-gray-100 text-gray-600 hover:bg-brand-500 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
          </a>
        </li>
      ))}
    </ul>
  );
};

export default SocialLinks;
