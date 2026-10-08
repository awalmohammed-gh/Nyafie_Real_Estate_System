import { FaWhatsapp } from "react-icons/fa";

// WhatsApp brand icon from react-icons (lucide-react has no brand icons)
const WhatsAppIcon = ({ className = "h-4 w-4" }) => <FaWhatsapp aria-hidden="true" className={className} />;

export default WhatsAppIcon;
