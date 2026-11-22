import PopularRoutes from "@/components/flights/PopularRoutes";
import Hero from "@/components/Hero";
import Partners from "@/components/Partners";
import PopularDestinations from "@/components/PopularDestinations";

export default function Home() {
  return (
    <div className="overflow-x-hidden bg-bg text-navy">
      <Hero />
      <PopularRoutes />
      <Partners />
      <PopularDestinations />
    </div>
  );
}
