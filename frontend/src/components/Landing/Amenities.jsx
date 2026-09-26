import { Activity, ArrowUp, Droplet, Dumbbell, Shield, Sun, Truck, Zap } from "lucide-react";
import SectionHeading from "../ui/SectionHeading";
import Reveal from "../ui/Reveal";

const buildingAmenities = [
  { name: "Swimming Pool", icon: Droplet, description: "Relax and unwind in our pristine pool" },
  { name: "Gym / Fitness Center", icon: Dumbbell, description: "State-of-the-art equipment for your workout" },
  { name: "24/7 Security", icon: Shield, description: "Round-the-clock surveillance and protection" },
  { name: "Parking Space", icon: Truck, description: "Secure and ample parking for residents" },
  { name: "Elevator", icon: ArrowUp, description: "Modern elevators for easy access" },
  { name: "Playground", icon: Activity, description: "Safe and fun area for children" },
  { name: "Roof Terrace", icon: Sun, description: "Breathtaking views and relaxation space" },
  { name: "Laundry Room", icon: Zap, description: "Convenient on-site laundry facilities" },
];

const Amenities = () => {
  return (
    <section className="bg-gray-950 py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          dark
          eyebrow="Our Amenities"
          title="Building"
          highlight="Amenities"
          description="Experience luxury living with our premium amenities designed for your comfort and convenience"
        />

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {buildingAmenities.map((amenity, index) => (
            <Reveal key={amenity.name} delay={(index % 4) * 0.06} className="h-full">
              <div className="group h-full rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:bg-white/10">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <amenity.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-bold text-white">{amenity.name}</h3>
                <p className="mt-1.5 text-sm text-gray-400">{amenity.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Amenities;
