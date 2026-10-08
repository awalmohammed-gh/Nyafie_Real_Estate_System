import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { usePlatform } from "../context/usePlatform";

const NotFound = ({ message = "The page you're looking for doesn't exist or has been moved." }) => {
  const { paths } = usePlatform();
  return (
    <div className="grid min-h-[70vh] place-items-center bg-gray-50 px-4 py-20">
      <div className="max-w-md text-center">
        <p className="bg-linear-to-br from-brand-400 to-brand-800 bg-clip-text text-8xl font-extrabold tracking-tight text-transparent sm:text-9xl">
          404
        </p>
        <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">Nothing to see here</h1>
        <p className="mt-3 text-gray-600">{message}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="btn btn-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <Link to={paths.listings} className="btn btn-light">
            <Search className="h-4 w-4" />
            Browse Listings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
