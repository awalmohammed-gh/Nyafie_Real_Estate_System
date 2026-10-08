import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePageSeo } from "../../context/pageSeo";

const PageMetadata = ({ title, description, image }) => {
  const { pathname } = useLocation();
  const { setMetadata } = usePageSeo();
  useLayoutEffect(() => {
    setMetadata({ pathname, title, description, image });
    return () => setMetadata((current) => current?.pathname === pathname ? null : current);
  }, [pathname, title, description, image, setMetadata]);
  return null;
};
export default PageMetadata;
