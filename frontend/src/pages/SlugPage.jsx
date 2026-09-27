import { Navigate, useLocation, useParams } from 'react-router-dom';
import { usePlatform } from '../context/usePlatform';
import Properties from './Properties';
import Listings from './Listings';
import Agents from './Agents';
import PropertyPerPage from './PropertyPerPage';
import NotFound from './NotFound';
import PageLoader from '../components/ui/PageLoader';

const PAGES = { properties: Properties, listings: Listings, agents: Agents };
const DEFAULT_SLUGS = { properties: 'properties', listings: 'listings', agents: 'agents' };

/**
 * Top-level public pages whose URL is set in Admin Settings > SEO & URLs
 * (e.g. /properties could become /homes). /sale and /rent are fixed.
 * Old default URLs redirect to the configured ones so existing links keep working.
 */
const SlugPage = () => {
  const { slug = '' } = useParams();
  const { search } = useLocation();
  const { settings, settingsReady } = usePlatform();
  const key = slug.toLowerCase();

  const page = Object.keys(PAGES).find((name) => settings.slugs[name] === key);
  if (page) {
    const Page = PAGES[page];
    return <Page />;
  }
  if (key === 'sale' || key === 'rent') return <PropertyPerPage status={key} />;

  // Wait for the saved slugs before deciding a URL doesn't exist
  if (!settingsReady) return <PageLoader label="Loading..." />;

  const renamed = Object.keys(DEFAULT_SLUGS).find((name) => DEFAULT_SLUGS[name] === key);
  if (renamed) return <Navigate to={`/${settings.slugs[renamed]}${search}`} replace />;

  return <NotFound />;
};

export default SlugPage;
