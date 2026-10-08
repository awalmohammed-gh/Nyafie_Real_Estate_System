import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Building2, ChevronDown, ChevronRight, MapPin, Search, Users, X } from 'lucide-react';
import { useRealEstate } from '../context/useRealEstate';
import { usePlatform } from '../context/usePlatform';
import AgentCard from '../components/card/AgentCard';
import AgentAvatar from '../components/agent/AgentAvatar';
import NavOverlay from '../components/nav/NavOverlay';
import './agents.css';

const SORTS = [
  { value: 'listings', label: 'Most listings', compare: (a, b) => b.propertyCount - a.propertyCount || a.name.localeCompare(b.name) },
  { value: 'rating', label: 'Highest property rating', compare: (a, b) => (b.rating || 0) - (a.rating || 0) || b.propertyCount - a.propertyCount },
  { value: 'newest', label: 'Recently joined', compare: (a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0) },
  { value: 'name', label: 'Name A–Z', compare: (a, b) => a.name.localeCompare(b.name) },
];

const AgentSkeleton = () => (
  <div className="agent-card agent-card-skeleton" aria-hidden="true">
    <div className="agent-card-cover" />
    <div className="agent-card-body"><span className="agent-avatar" /><span /><span /><div className="agent-stats" /><span /></div>
  </div>
);

const Agents = () => {
  const { agents, agentsLoading } = useRealEstate();
  const { siteName, settings } = usePlatform();
  const [searchTerm, setSearchTerm] = useState('');
  const [area, setArea] = useState('');
  const [sort, setSort] = useState('listings');
  const [listingType, setListingType] = useState('all');

  const areas = useMemo(() => {
    const counts = new Map();
    agents.forEach((agent) => agent.locations.filter(Boolean).forEach((name) => counts.set(name, (counts.get(name) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [agents]);
  const listingTotal = agents.reduce((sum, agent) => sum + agent.propertyCount, 0);
  const term = searchTerm.trim().toLowerCase();
  const visible = agents
    .filter((agent) => (!area || agent.locations.includes(area))
      && (listingType === 'all' || (listingType === 'sale' ? agent.saleCount : agent.rentCount) > 0)
      && [agent.name, agent.email, ...agent.locations].join(' ').toLowerCase().includes(term))
    .sort(SORTS.find((item) => item.value === sort).compare);
  const filtered = Boolean(term || area || listingType !== 'all');
  const clearFilters = () => { setSearchTerm(''); setArea(''); setListingType('all'); };
  const contactHref = settings.contact.email
    ? `mailto:${settings.contact.email}?subject=${encodeURIComponent('Help finding a local agent')}`
    : settings.contact.phone ? `tel:${settings.contact.phone.replace(/[^\d+]/g, '')}` : '/contact';

  return (
    <div className="agents-page">
      <header className="agents-header">
        <NavOverlay />
        <div className="container-page">
          <nav aria-label="Breadcrumb" className="agents-breadcrumb">
            <Link to="/">Home</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">Agents</span>
          </nav>
          <div className="agents-header-grid">
            <div className="agents-hero-copy">
              <p className="agents-eyebrow"><span aria-hidden="true" />Local knowledge. Personal guidance.</p>
              <h1>Your next chapter.<br /><span>The right agent.</span></h1>
              <p className="agents-intro">Great moves start with good people. Find an agent who knows your neighbourhood and helps you feel at home.</p>
              <a href="#agent-directory" className="agents-button agents-button-primary">Explore our agents <ArrowDown size={17} aria-hidden="true" /></a>
              {!agentsLoading && agents.length > 0 && (
                <div className="agents-hero-people">
                  <div className="agents-avatar-stack" aria-hidden="true">{agents.slice(0, 3).map((agent) => <AgentAvatar key={agent.id} name={agent.name} />)}</div>
                  <p><strong>People, not just properties.</strong><span>Meet the local agents on {siteName}.</span></p>
                </div>
              )}
            </div>
            <div className="agents-hero-visual">
              <img src="/agentBg.jpg" alt="" fetchPriority="high" width="736" height="913" />
              <div className="agents-visual-caption">
                <span className="agents-visual-icon"><MapPin size={23} aria-hidden="true" /></span>
                <div><p>A local perspective.</p><strong>A better way home.</strong></div>
              </div>
              <span className="agents-image-label"><Building2 size={15} aria-hidden="true" />Spaces to call your own</span>
            </div>
          </div>
          <dl className="agents-stats" aria-label="Directory at a glance" aria-busy={agentsLoading}>
            {[{ icon: Users, value: agents.length, label: 'Local agents' }, { icon: Building2, value: listingTotal, label: 'Homes listed' }, { icon: MapPin, value: areas.length, label: 'Neighbourhoods covered' }].map(({ icon: Icon, value, label }) => (
              <div key={label}><Icon size={22} aria-hidden="true" /><div><dt>{label}</dt><dd>{agentsLoading ? '—' : value.toLocaleString()}</dd></div></div>
            ))}
          </dl>
        </div>
      </header>

      <section id="agent-directory" className="container-page agents-directory" aria-labelledby="agents-directory-title" aria-busy={agentsLoading}>
        <div className="agents-section-heading">
          <div><p className="agents-eyebrow">Find your person</p><h2 id="agents-directory-title">Local expertise, a click away.</h2></div>
          <p>Browse. Connect. Make your move.</p>
        </div>
        <div className="agents-filter-panel">
          <div className="agents-toolbar">
            <form role="search" onSubmit={(event) => event.preventDefault()} className="agents-search">
              <Search size={20} aria-hidden="true" />
              <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Name or neighbourhood" aria-label="Search agents by name or neighbourhood" />
              {searchTerm && <button type="button" aria-label="Clear search" onClick={() => setSearchTerm('')}><X size={16} aria-hidden="true" /></button>}
            </form>
            <div className="agents-select agents-area-select">
              <MapPin size={18} aria-hidden="true" />
              <select aria-label="Filter agents by neighbourhood" value={area} onChange={(event) => setArea(event.target.value)}>
                <option value="">All neighbourhoods</option>{areas.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
            <div className="agents-select agents-sort">
              <select aria-label="Sort agents" value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="agents-filter-bottom">
            <div className="agents-segments" role="group" aria-label="Filter agents by listing type">
              {[{ value: 'all', label: 'All agents' }, { value: 'sale', label: 'Homes for sale' }, { value: 'rent', label: 'Homes to rent' }].map(({ value, label }) => (
                <button key={value} type="button" aria-pressed={listingType === value} onClick={() => setListingType(value)} className={listingType === value ? 'is-active' : ''}>{label}</button>
              ))}
            </div>
            {areas.length > 0 && (
              <div className="agents-areas" role="group" aria-label="Popular neighbourhoods">
                <span>Popular:</span>{areas.slice(0, 3).map((name) => (
                  <button key={name} type="button" aria-pressed={area === name} className={area === name ? 'is-active' : ''} onClick={() => setArea(area === name ? '' : name)}>{name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="agents-results-heading" role="status" aria-live="polite" aria-atomic="true">
          <p>{agentsLoading ? 'Finding local agents…' : <><strong>{visible.length}</strong> {visible.length === 1 ? 'agent' : 'agents'}{area ? ` in ${area}` : ''}{term ? ` matching “${searchTerm.trim()}”` : ''}{listingType !== 'all' ? ` with homes ${listingType === 'sale' ? 'for sale' : 'to rent'}` : ''}</>}</p>
          {filtered && <button type="button" onClick={clearFilters}>Clear filters <X size={14} aria-hidden="true" /></button>}
        </div>
        {agentsLoading ? (
          <div className="agents-grid">{Array.from({ length: 3 }, (_, i) => <AgentSkeleton key={i} />)}</div>
        ) : visible.length > 0 ? (
          <div className="agents-grid">{visible.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
        ) : (
          <div className="agents-empty">
            <span className="agents-empty-icon"><Search size={26} aria-hidden="true" /></span>
            <h3>{agents.length ? 'Let’s try another search.' : 'Your next connection is coming soon.'}</h3>
            <p>{agents.length ? 'Try a different name, area or listing type to find your agent.' : `Our ${siteName} team can help you explore homes while our agent directory grows.`}</p>
            {filtered ? <button type="button" className="agents-button agents-button-primary" onClick={clearFilters}>Show all agents</button> : <Link to="/contact" className="agents-button agents-button-primary">Contact our team <ArrowUpRight size={17} aria-hidden="true" /></Link>}
          </div>
        )}
      </section>

      <section className="container-page agents-cta-wrap" aria-labelledby="agents-cta-title">
        <div className="agents-cta">
          <div><p className="agents-eyebrow">A little guidance goes a long way</p><h2 id="agents-cta-title">Not sure where to start?</h2><p>Tell our team what home looks like to you. We’ll help you take the next step.</p></div>
          <div className="agents-cta-actions">
            <a href={contactHref} className="agents-button agents-button-light">Talk to our team <ArrowUpRight size={18} aria-hidden="true" /></a>
            <Link to="/agent/plans" className="agents-cta-secondary">Are you an agent? Join {siteName} <ChevronRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Agents;
