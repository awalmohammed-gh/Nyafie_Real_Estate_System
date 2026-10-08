import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BadgeCheck, Building2, ChevronRight, Mail, MapPin, Phone, Star } from 'lucide-react';
import WhatsAppIcon from '../components/ui/WhatsAppIcon';
import { toWhatsAppNumber } from '../utils/whatsapp';
import { useRealEstate } from '../context/useRealEstate';
import { usePlatform } from '../context/usePlatform';
import AgentAvatar from '../components/agent/AgentAvatar';
import HouseCard from '../components/card/HouseCard';
import NotFound from './NotFound';
import PageLoader from '../components/ui/PageLoader';
import './agents.css';
import './agent/workspace.css';

const CATEGORIES = [{ label: 'All homes', value: 'All' }, { label: 'For sale', value: 'Sale' }, { label: 'To rent', value: 'Rent' }];

const AgentProfile = ({ agent }) => {
  const { paths, siteName } = usePlatform();
  const [category, setCategory] = useState('All');
  const listings = agent.properties.filter((property) => category === 'All' || property.property.status === category);
  const areas = agent.locations.filter(Boolean);
  const firstName = agent.name.split(' ')[0];

  return (
    <div className="agents-page agent-profile-page">
      <header className="agent-profile-header">
        <div className="container-page">
          <nav aria-label="Breadcrumb" className="agents-breadcrumb">
            <Link to="/">Home</Link><ChevronRight size={14} aria-hidden="true" /><Link to={paths.agents}>Agents</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{agent.name}</span>
          </nav>
          <div className="agent-profile-heading">
            <div className="agent-profile-identity">
              <AgentAvatar name={agent.name} image={agent.profileImage} large />
              <div><p className="agents-eyebrow">Your local connection</p><h1>{agent.name}</h1><p className="agent-profile-subtitle">{agent.agentType === 'agency' && agent.companyName ? agent.companyName : 'Independent real estate agent'}{agent.joinedAt ? ` · On ${siteName} since ${new Date(agent.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}</p></div>
            </div>
            {agent.verified && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700"><BadgeCheck size={17} aria-hidden="true" />Approved agent</span>}
            <Link to={paths.agents} className="agents-back-link"><ArrowLeft size={16} aria-hidden="true" />All agents</Link>
          </div>
          <dl className="agent-profile-stats">
            {[{ value: agent.properties.length, label: 'Homes listed' }, { value: agent.saleCount, label: 'For sale' }, { value: agent.rentCount, label: 'To rent' }, { value: areas.length, label: 'Neighbourhoods' }].map(({ value, label }) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}
          </dl>
        </div>
      </header>

      <div className="container-page agent-profile-layout">
        <aside className="agent-contact-panel" aria-labelledby="agent-contact-title">
          <p className="agents-eyebrow">Make the connection</p><h2 id="agent-contact-title">Let’s talk about home.</h2>
          <p>Interested in a listing? Contact {firstName} directly to ask a question or arrange a viewing.</p>
          <div className="agent-contact-actions">
            {agent.phone && <a href={`tel:${agent.phone.replace(/[^\d+]/g, '')}`} className="agents-button agents-button-primary"><Phone size={17} aria-hidden="true" /><span>{agent.phone}</span></a>}
            {agent.email && <a href={`mailto:${agent.email}`} className="agents-button agents-button-outline"><Mail size={17} aria-hidden="true" />Email {firstName}<ArrowUpRight size={16} aria-hidden="true" /></a>}
            {toWhatsAppNumber(agent.whatsapp || agent.phone) && <a href={`https://wa.me/${toWhatsAppNumber(agent.whatsapp || agent.phone)}?text=${encodeURIComponent(`Hello ${agent.name}, I'd like to discuss your property listings on ${siteName}.`)}`} target="_blank" rel="noopener noreferrer" className="agents-button agents-button-outline"><WhatsAppIcon />WhatsApp {firstName}</a>}
          </div>
          <div className="agent-contact-areas">
            <h3><MapPin size={16} aria-hidden="true" />Neighbourhoods with listings</h3>
            {areas.length ? <ul>{areas.map((area) => <li key={area}>{area}</li>)}</ul> : <p>Neighbourhoods will appear with the first listing.</p>}
          </div>
          {agent.rating != null && <div className="agent-profile-rating"><Star size={18} aria-hidden="true" /><div><strong>{agent.rating.toFixed(1)} <span>/ 5</span></strong><p>Average rating across reviewed properties</p></div></div>}
        </aside>

        <section className="agent-profile-listings" aria-labelledby="agent-listings-title">
          {(agent.bio || agent.city || agent.companyName) && <section className="agent-public-about" aria-labelledby="agent-about-title"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="agent-about-title">About {firstName}</h2>{agent.agencyLogo && <img src={agent.agencyLogo} alt={`${agent.companyName || 'Agency'} logo`} className="h-12 w-12 rounded-lg object-contain" />}</div>{agent.bio && <p>{agent.bio}</p>}<div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">{(agent.city || agent.region) && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{[agent.city, agent.region].filter(Boolean).join(', ')}</span>}{agent.yearsExperience > 0 && <span>{agent.yearsExperience} {agent.yearsExperience === 1 ? 'year' : 'years'} of experience</span>}</div></section>}
          <div className="agents-section-heading"><div><p className="agents-eyebrow">Find your next place</p><h2 id="agent-listings-title">Homes with {firstName}</h2></div></div>
          <div className="agent-profile-listing-toolbar">
            <div className="agents-segments" role="group" aria-label="Filter homes by listing type">
              {CATEGORIES.map(({ label, value }) => <button key={value} type="button" aria-pressed={category === value} className={category === value ? 'is-active' : ''} onClick={() => setCategory(value)}>{label} <span>{value === 'All' ? agent.properties.length : value === 'Sale' ? agent.saleCount : agent.rentCount}</span></button>)}
            </div>
            <p role="status" aria-live="polite" aria-atomic="true">{listings.length} {listings.length === 1 ? 'home' : 'homes'}</p>
          </div>
          {listings.length > 0 ? (
            <div className="agent-homes-grid">{listings.map((property) => <HouseCard key={property.id} house={property} />)}</div>
          ) : (
            <div className="agents-empty">
              <span className="agents-empty-icon"><Building2 size={27} aria-hidden="true" /></span>
              <h3>{category === 'All' ? 'A new chapter is on the way.' : 'No homes in this category yet.'}</h3>
              <p>{category === 'All' ? `${firstName} has no published homes right now. Get in touch to discuss what you’re looking for.` : 'Explore all homes or contact the agent about your search.'}</p>
              {category !== 'All' && <button type="button" className="agents-button agents-button-primary" onClick={() => setCategory('All')}>Explore all homes</button>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const AgentDetailsPage = () => {
  const { id } = useParams();
  const { agents, agentsLoading } = useRealEstate();
  const agent = agents.find((item) => item.id === id);
  if (!agent && agentsLoading) return <PageLoader label="Loading agent…" />;
  if (!agent) return <NotFound message="We couldn't find this agent." />;
  return <AgentProfile key={agent.id} agent={agent} />;
};

export default AgentDetailsPage;
