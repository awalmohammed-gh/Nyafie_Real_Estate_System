import { ArrowUpRight, BadgeCheck, Building2, Mail, MapPin, Phone, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/usePlatform';
import AgentAvatar from '../agent/AgentAvatar';

const AgentCard = ({ agent }) => {
  const { siteName } = usePlatform();
  const areas = agent.locations.filter(Boolean).slice(0, 3);
  const more = agent.locations.filter(Boolean).length - areas.length;
  const listings = agent.propertyCount;
  const image = agent.coverImage || agent.properties.find((property) => property.media?.images?.[0])?.media.images[0];
  const profileHref = `/agents/${agent.id}`;

  return (
    <article className="agent-card">
      <div className={`agent-card-cover${image ? '' : ' agent-card-cover-empty'}`}>
        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <Building2 size={46} strokeWidth={1.2} aria-hidden="true" />}
        <span className="agent-listing-badge"><Building2 size={14} aria-hidden="true" />{listings} {listings === 1 ? 'home listed' : 'homes listed'}</span>
      </div>
      <div className="agent-card-body">
        <div className="agent-card-top">
          <AgentAvatar name={agent.name} image={agent.profileImage} />
          {agent.rating != null && <span className="agent-rating" aria-label={`Average property rating ${agent.rating.toFixed(1)} out of 5`}><Star size={14} aria-hidden="true" /><strong>{agent.rating.toFixed(1)}</strong><span>Property rating</span></span>}
        </div>
        <h3><Link to={profileHref}>{agent.name}</Link></h3>
        {agent.verified && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700"><BadgeCheck size={14} aria-hidden="true" />Approved agent</p>}
        <p className="agent-card-meta">{agent.joinedAt ? `On ${siteName} since ${new Date(agent.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : 'Real estate agent'}</p>
        <div className="agent-areas">
          <MapPin size={15} aria-hidden="true" />
          {areas.length ? <ul aria-label="Areas with listings">{areas.map((area) => <li key={area}>{area}</li>)}{more > 0 && <li className="is-more">+{more} more</li>}</ul> : <span>First listings coming soon</span>}
        </div>
        <dl className="agent-stats">
          <div><dt>Homes listed</dt><dd>{listings}</dd></div><div><dt>For sale</dt><dd>{agent.saleCount}</dd></div><div><dt>To rent</dt><dd>{agent.rentCount}</dd></div>
        </dl>
        <div className="agent-card-actions">
          <Link to={profileHref} className="agent-card-cta" aria-label={`View ${agent.name}'s profile`}>View profile <ArrowUpRight size={17} aria-hidden="true" /></Link>
          {agent.phone && <a href={`tel:${agent.phone.replace(/[^\d+]/g, '')}`} className="agent-icon-button" aria-label={`Call ${agent.name}`} title={`Call ${agent.phone}`}><Phone size={17} aria-hidden="true" /></a>}
          {agent.email && <a href={`mailto:${agent.email}`} className="agent-icon-button" aria-label={`Email ${agent.name}`} title={`Email ${agent.email}`}><Mail size={17} aria-hidden="true" /></a>}
        </div>
      </div>
    </article>
  );
};

export default AgentCard;
