import About from "../components/Landing/About"
import Amenities from "../components/Landing/Amenities"
import ApartmentPlans from "../components/Landing/ApartmentPlans"
import FeatureListings from "../components/Landing/FeatureListings"
import Hero from "../components/Landing/Hero"
import Neighbourhoods from "../components/Landing/Neighbourhoods"
import OurServices from "../components/Landing/OurServices"
import CtaBanner from "../components/ui/CtaBanner"

const Home = () => {
  return (
    <>
      <Hero />
      <About />
      <OurServices />
      <FeatureListings />
      <Neighbourhoods />
      <ApartmentPlans />
      <Amenities />
      <CtaBanner />
    </>
  )
}

export default Home
