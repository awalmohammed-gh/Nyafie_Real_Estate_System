import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useRealEstate } from '../context/useRealEstate';
import AgentCard from '../components/card/AgentCard';
import PageHeader from '../components/ui/PageHeader';
import CtaBanner from '../components/ui/CtaBanner';
import Reveal from '../components/ui/Reveal';
import SkeletonGrid from '../components/ui/SkeletonGrid';

const Agents = () => {
  const { agents, propertiesLoading } = useRealEstate();
  const [searchTerm, setSearchTerm] = useState('');

  const term = searchTerm.trim().toLowerCase();
  const filteredAgents = agents.filter((agent) =>
    [agent.name, agent.email, ...agent.locations].join(' ').toLowerCase().includes(term)
  );

  return (
    <>
      <PageHeader
        title="Meet Our Real Estate Experts"
        description="Discover our team of trusted and experienced real estate agents ready to help you buy, sell, or rent with confidence. Each agent brings local market knowledge, professional guidance, and a commitment to helping you find the perfect property or secure the best deal."
        image="/agentBg.jpg"
        crumbs={[{ label: 'Agents' }]}
      />

      <section className="container-page py-12 sm:py-16">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-gray-600">
            <Users className="h-5 w-5 text-brand-500" />
            <span><span className="font-bold text-gray-900">{filteredAgents.length}</span> agents available</span>
          </p>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email or area..."
              aria-label="Search agents"
              className="field rounded-full py-3.5 pl-12"
            />
          </div>
        </div>

        {propertiesLoading ? (
          <SkeletonGrid count={3} />
        ) : filteredAgents.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAgents.map((agent, index) => (
              <Reveal key={agent.id} delay={index * 0.08} className="h-full">
                <AgentCard agent={agent} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-gray-50 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-gray-900">No agents found</p>
            <p className="mt-1 text-gray-500">Try a different name or area.</p>
          </div>
        )}
      </section>

      <CtaBanner />
    </>
  );
};

export default Agents;
