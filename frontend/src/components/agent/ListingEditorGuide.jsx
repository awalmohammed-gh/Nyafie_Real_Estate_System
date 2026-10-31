import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Check, Eye, FileText, ImagePlus, MapPin, Phone, SlidersHorizontal, Tag } from "lucide-react";

const sections = {
  "chapter-basics": { label: "Overview", icon: Building2 },
  "chapter-photos": { label: "Photos", icon: ImagePlus },
  "chapter-story": { label: "Description", icon: FileText },
  "chapter-price": { label: "Pricing", icon: Tag },
  "chapter-rooms": { label: "Room types", icon: Tag },
  "chapter-location": { label: "Location", icon: MapPin },
  "chapter-details": { label: "Features", icon: SlidersHorizontal },
  "chapter-contact": { label: "Contact", icon: Phone },
};

const ListingEditorGuide = ({ isEdit, status, description, checklist, permissions, onJump, onPreview }) => {
  const completed = checklist.filter((item) => item.done).length;
  const next = checklist.find((item) => !item.done);
  const percent = Math.round(completed / checklist.length * 100);
  return (
    <div className="agpe-intro">
      <header className="agpe-heading">
        <div>
          <Link to="/agent/properties" className="agpe-back"><ArrowLeft size={15} aria-hidden="true" />My properties</Link>
          <p className="agpe-eyebrow">YOUR PROPERTY PORTFOLIO</p>
          <div className="agpe-title-row"><h1>{isEdit ? "Edit your property" : "Add a property"}</h1><span className="agpe-status"><span aria-hidden="true" />{status}</span></div>
          <p className="agpe-description">{description}</p>
        </div>
        <div className="agpe-header-tools">
          <div className="agpe-plan"><span><Building2 size={18} aria-hidden="true" /></span><div><strong>{permissions.plan?.name || "Your plan"}</strong><small>{permissions.activeCount} of {permissions.propertyLimit} listing slots used</small></div></div>
          <button type="button" onClick={onPreview} className="agpe-preview-button"><Eye size={16} aria-hidden="true" />Preview listing</button>
        </div>
      </header>

      <nav className="agpe-guide" aria-label="Listing sections">
        <div className="agpe-guide-top">
          <div className="agpe-progress-heading"><span className="agpe-progress-value">{percent}<small>%</small></span><div><h2>Build a listing that stands out</h2><p>{completed} of {checklist.length} sections ready · Save your progress as a draft.</p></div></div>
          {next ? <button type="button" className="agpe-next" onClick={() => onJump(next.id)}>Next: {sections[next.id].label}<ArrowRight size={15} aria-hidden="true" /></button> : <span className="agpe-ready"><Check size={15} aria-hidden="true" />Ready for your final check</span>}
        </div>
        <div className="agpe-progress-track" role="progressbar" aria-label="Listing completion" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={completed}><span style={{ width: `${percent}%` }} /></div>
        <ol className="agpe-section-links">
          {checklist.map((item, index) => {
            const { label, icon: Icon } = sections[item.id];
            return <li key={item.id}><button type="button" className={item.done ? "is-complete" : ""} onClick={() => onJump(item.id)}><span className="agpe-section-icon">{item.done ? <Check size={15} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}</span><span>{label}<small>{item.done ? "Complete" : `Section ${index + 1}`}</small></span><span className="sr-only">{item.done ? ", ready" : ", incomplete"}</span></button></li>;
          })}
        </ol>
      </nav>
    </div>
  );
};

export default ListingEditorGuide;
