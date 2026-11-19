import { CalendarCheck, Headphones, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { usePlatform } from "../../context/usePlatform";

const TrustBar = () => {
  const { settings, paths } = usePlatform();
  const benefits = [
    { Icon: ShieldCheck, title: settings.property.requireApproval ? "Verified listings" : "Detailed listings", text: settings.property.requireApproval ? "Authentic and approved properties" : "Explore photos and property details" },
    { Icon: UsersRound, title: "Trusted agents", text: "Work with approved professionals" },
    { Icon: CalendarCheck, title: "Book viewings online", text: "Pick a time, get a reminder", to: paths.listings },
    { Icon: Headphones, title: "Support when you need it", text: "Get help from our team", to: "/contact" },
  ];
  return <aside className="home-trust" aria-label="Why find a property with NyaFie"><div className="container-page">{benefits.map(({ Icon, title, text, to }) => {
    const body = <><Icon size={32} strokeWidth={1.6} aria-hidden="true" /><span><strong>{title}</strong><small>{text}</small></span></>;
    return to ? <Link key={title} to={to} className="home-trust-item">{body}</Link> : <div key={title} className="home-trust-item">{body}</div>;
  })}</div></aside>;
};

export default TrustBar;
