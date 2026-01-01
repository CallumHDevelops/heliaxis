import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  Sun, Battery, Lightbulb, Thermometer, Building2, Home, 
  Users, CheckCircle2, ArrowRight, Zap, Shield, Award,
  TrendingDown, Leaf, Clock, FileCheck, Building, ChevronRight,
  Factory, GraduationCap, Warehouse, BarChart3, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContactSection } from "@/components/ContactSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Commercial & Public Sector Renewable Energy Solutions",
  description:
    "Renewable energy solutions for businesses, local authorities, housing associations and public sector organisations across Wales. Commercial solar PV, battery storage, LED lighting and decarbonisation support.",
  keywords: [
    "commercial solar Wales",
    "business solar panels",
    "local authority renewable energy",
    "housing association decarbonisation",
    "public sector energy",
    "commercial battery storage",
    "LED lighting retrofit",
    "industrial solar",
    "school solar panels",
    "warehouse solar installation",
  ],
};

export default function CommercialPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1497440001374-f26997328c1b?w=1920&h=1080&fit=crop"
            alt="Commercial solar installation on industrial building"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              For Organisations
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Commercial and public sector{" "}
              <span className="text-heliaxis-gold">energy solutions</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8">
              For businesses and public sector organisations, energy is no longer a fixed overhead. 
              It is a strategic variable that affects operating costs, resilience, compliance, 
              reputation and long-term asset value. Heliaxis combines engineering-led design with 
              real-world delivery experience.
            </p>
            <Button 
              asChild 
              size="lg" 
              className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
            >
              <Link href="/contact">
                Discuss Your Project
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Energy as Strategic Consideration */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Energy as a{" "}
              <span className="text-heliaxis-gold">strategic consideration</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Rising energy prices, grid constraints, carbon reporting requirements and the 
              electrification of heat and transport have fundamentally changed how organisations 
              must think about energy.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <TrendingDown className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Reduced Price Exposure</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Lower exposure to volatile energy prices and improved cost predictability 
                  over the long term.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Shield className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Enhanced Resilience</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Improved operational continuity with on-site generation and storage capacity.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Leaf className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">ESG & Net Zero</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Progress towards ESG and net-zero commitments with tangible carbon 
                  reduction outcomes.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Who We Work With */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Who we <span className="text-heliaxis-gold">work with</span>
              </h2>
              <p className="text-lg text-gray-600">
                Heliaxis supports a wide range of commercial and public sector clients, 
                each with different challenges in terms of load profiles, procurement 
                requirements and compliance.
              </p>
            </div>
            <div className="relative">
              <div className="aspect-[16/10] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=500&fit=crop"
                  alt="Commercial building and industrial facility"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4 p-6 bg-white rounded-[5px] shadow-sm hover:shadow-xl hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
              <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 group-hover:bg-heliaxis-navy/10 flex items-center justify-center flex-shrink-0 transition-colors">
                <Building2 className="w-6 h-6 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-heliaxis-navy">SMEs & Large Businesses</h3>
                <p className="text-sm text-gray-600 group-hover:text-heliaxis-navy/80 transition-colors">Commercial organisations of all sizes</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-6 bg-white rounded-[5px] shadow-sm hover:shadow-xl hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
              <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 group-hover:bg-heliaxis-navy/10 flex items-center justify-center flex-shrink-0 transition-colors">
                <Factory className="w-6 h-6 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-heliaxis-navy">Industrial Sites</h3>
                <p className="text-sm text-gray-600 group-hover:text-heliaxis-navy/80 transition-colors">Manufacturing and processing facilities</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-6 bg-white rounded-[5px] shadow-sm hover:shadow-xl hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
              <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 group-hover:bg-heliaxis-navy/10 flex items-center justify-center flex-shrink-0 transition-colors">
                <Warehouse className="w-6 h-6 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-heliaxis-navy">Warehousing & Logistics</h3>
                <p className="text-sm text-gray-600 group-hover:text-heliaxis-navy/80 transition-colors">Distribution and storage operations</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-6 bg-white rounded-[5px] shadow-sm hover:shadow-xl hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
              <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 group-hover:bg-heliaxis-navy/10 flex items-center justify-center flex-shrink-0 transition-colors">
                <GraduationCap className="w-6 h-6 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-heliaxis-navy">Education Providers</h3>
                <p className="text-sm text-gray-600 group-hover:text-heliaxis-navy/80 transition-colors">Schools, colleges and education estates</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-6 bg-white rounded-[5px] shadow-sm hover:shadow-xl hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
              <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 group-hover:bg-heliaxis-navy/10 flex items-center justify-center flex-shrink-0 transition-colors">
                <Building className="w-6 h-6 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-heliaxis-navy">Local Authorities</h3>
                <p className="text-sm text-gray-600 group-hover:text-heliaxis-navy/80 transition-colors">Public sector bodies and councils</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-6 bg-white rounded-[5px] shadow-sm hover:shadow-xl hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
              <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 group-hover:bg-heliaxis-navy/10 flex items-center justify-center flex-shrink-0 transition-colors">
                <Users className="w-6 h-6 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-heliaxis-navy">Housing Associations</h3>
                <p className="text-sm text-gray-600 group-hover:text-heliaxis-navy/80 transition-colors">Registered social landlords</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Commercial Solar PV */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Sun className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">Commercial Solar PV</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Reduce grid imports during{" "}
                <span className="text-heliaxis-gold">operating hours</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Commercial solar PV systems are typically designed to reduce grid electricity 
                imports during operating hours, when energy demand is highest. When properly 
                designed, solar PV can deliver strong returns on investment and long-term 
                cost stability.
              </p>
              
              <div className="space-y-4 mb-8">
                <h4 className="font-semibold text-heliaxis-navy">Key design considerations:</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-heliaxis-gold flex-shrink-0" />
                    <span className="text-sm">Load profiles and operating hours</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-heliaxis-gold flex-shrink-0" />
                    <span className="text-sm">Roof structure and available space</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-heliaxis-gold flex-shrink-0" />
                    <span className="text-sm">Electrical infrastructure capacity</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-heliaxis-gold flex-shrink-0" />
                    <span className="text-sm">Grid connection constraints</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-heliaxis-gold flex-shrink-0" />
                    <span className="text-sm">Future expansion or electrification</span>
                  </div>
                </div>
              </div>

              <div className="bg-heliaxis-navy/5 rounded-[5px] p-6">
                <h4 className="font-semibold text-heliaxis-navy mb-3">Commercial benefits:</h4>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-start gap-2">
                    <TrendingDown className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                    Reduced operating expenditure through lower imported electricity
                  </li>
                  <li className="flex items-start gap-2">
                    <BarChart3 className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                    Improved long-term energy cost predictability
                  </li>
                  <li className="flex items-start gap-2">
                    <Leaf className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                    Reduced carbon emissions and improved ESG metrics
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1497440001374-f26997328c1b?w=800&h=600&fit=crop"
                  alt="Commercial building with solar installation"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Battery Storage for Commercial */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?w=800&h=600&fit=crop"
                  alt="Commercial battery storage system"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/20 rounded-full px-4 py-2 mb-6">
                <Battery className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-gold">Commercial Battery Storage</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Flexibility and control for your{" "}
                <span className="text-heliaxis-gold">energy strategy</span>
              </h2>
              <p className="text-lg text-white/80 leading-relaxed mb-8">
                Battery storage adds an additional layer of flexibility and control to commercial 
                energy systems. While solar PV reduces daytime imports, battery storage allows 
                organisations to manage when and how electricity is used.
              </p>
              
              <div className="space-y-4 mb-8">
                <h4 className="font-semibold text-white">Strategic use cases:</h4>
                <div className="grid gap-3">
                  <div className="flex items-start gap-3 p-4 bg-white/5 rounded-[5px]">
                    <Zap className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                    <div>
                      <h5 className="font-medium text-white">Peak Shaving</h5>
                      <p className="text-sm text-white/70">Manage demand-related costs effectively</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-white/5 rounded-[5px]">
                    <Clock className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                    <div>
                      <h5 className="font-medium text-white">Load Shifting</h5>
                      <p className="text-sm text-white/70">Optimise energy usage patterns throughout the day</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-white/5 rounded-[5px]">
                    <Shield className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                    <div>
                      <h5 className="font-medium text-white">Improved Resilience</h5>
                      <p className="text-sm text-white/70">Enhanced continuity for critical operations</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LED & Infrared */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Lightbulb className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">LED Lighting Retrofits</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-heliaxis-navy mb-4">
                Fastest payback periods available
              </h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                LED lighting retrofits remain one of the most cost-effective energy efficiency 
                measures available to commercial and public sector organisations. In many cases, 
                they deliver some of the fastest payback periods of any energy upgrade.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Significant electricity consumption reduction</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Improved lighting quality and consistency</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Reduced maintenance due to longer service life</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Enhanced safety and working conditions</span>
                </div>
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Thermometer className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">Infrared Heating</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-heliaxis-navy mb-4">
                Efficient heating for commercial spaces
              </h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                Infrared heating can be effective in large or intermittently used spaces where 
                traditional heating systems are inefficient. By delivering targeted warmth and 
                zoned control, infrared systems can reduce wasted energy while improving comfort.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Large open spaces</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Buildings with intermittent occupancy</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Retrofit scenarios</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-gray-700">Zoned or localised heating requirements</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Public Sector & Housing Associations */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <Badge className="bg-heliaxis-navy text-white mb-6">
                Public Sector Experience
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Local authority & housing association{" "}
                <span className="text-heliaxis-gold">expertise</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Public sector organisations face additional scrutiny when delivering renewable 
                energy projects. Value for money, transparency, compliance and reporting are 
                as important as technical performance.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Heliaxis has experience delivering projects within publicly funded and grant-supported 
                frameworks, including Welsh Government backed programmes. We understand the additional 
                requirements that come with public sector delivery.
              </p>
              
              <div className="bg-white rounded-[5px] p-6 shadow-lg mb-8">
                <h4 className="font-semibold text-heliaxis-navy mb-4">We support public sector clients with:</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-gray-600">
                    <FileCheck className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Clear technical scope definition
                  </li>
                  <li className="flex items-start gap-3 text-gray-600">
                    <FileCheck className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Procurement-ready documentation
                  </li>
                  <li className="flex items-start gap-3 text-gray-600">
                    <FileCheck className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Compliance with electrical and renewable standards
                  </li>
                  <li className="flex items-start gap-3 text-gray-600">
                    <FileCheck className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Commissioning evidence and handover packs
                  </li>
                  <li className="flex items-start gap-3 text-gray-600">
                    <FileCheck className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Support for funder and stakeholder reporting
                  </li>
                </ul>
              </div>
            </div>
            
            <div>
              <Card className="border-none shadow-xl mb-6">
                <CardHeader>
                  <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Users className="w-7 h-7 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-xl text-heliaxis-navy">Housing Associations</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 text-base leading-relaxed">
                    Housing associations face complex challenges when decarbonising housing stock. 
                    Diverse property types, tenant needs, safety considerations and funding constraints 
                    require a structured and phased approach. Heliaxis supports housing associations 
                    with both advisory services and practical delivery.
                  </CardDescription>
                </CardContent>
              </Card>

              <div className="bg-heliaxis-navy rounded-[5px] p-6 text-white">
                <h4 className="font-semibold mb-4">Typical housing association challenges:</h4>
                <ul className="space-y-2 text-white/80">
                  <li className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-heliaxis-gold" />
                    Mixed-age and mixed-type housing stock
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-heliaxis-gold" />
                    Varying energy performance across properties
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-heliaxis-gold" />
                    Tenant engagement and disruption management
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-heliaxis-gold" />
                    Funding alignment and reporting requirements
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Heliaxis */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Why organisations choose{" "}
              <span className="text-heliaxis-gold">Heliaxis</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Organisations choose Heliaxis because we combine technical expertise with 
              commercial and public sector awareness. We are not a volume-driven installer 
              — we are a delivery partner focused on outcomes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="text-center p-6 rounded-[5px] bg-gray-50 hover:bg-heliaxis-gold/5 transition-colors">
              <div className="w-14 h-14 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <Settings className="w-7 h-7 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy mb-2">Engineering-led</h3>
              <p className="text-sm text-gray-600">Evidence-based approach to every project</p>
            </div>

            <div className="text-center p-6 rounded-[5px] bg-gray-50 hover:bg-heliaxis-gold/5 transition-colors">
              <div className="w-14 h-14 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <FileCheck className="w-7 h-7 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy mb-2">Clear Documentation</h3>
              <p className="text-sm text-gray-600">Comprehensive communication at every stage</p>
            </div>

            <div className="text-center p-6 rounded-[5px] bg-gray-50 hover:bg-heliaxis-gold/5 transition-colors">
              <div className="w-14 h-14 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <Award className="w-7 h-7 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy mb-2">Proven Experience</h3>
              <p className="text-sm text-gray-600">Commercial and funded project track record</p>
            </div>

            <div className="text-center p-6 rounded-[5px] bg-gray-50 hover:bg-heliaxis-gold/5 transition-colors">
              <div className="w-14 h-14 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy mb-2">Long-term Focus</h3>
              <p className="text-sm text-gray-600">Performance and support that matters</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Commercial & Public Sector <span className="text-heliaxis-gold">FAQs</span>
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-white rounded-[5px] px-6 border-none shadow-sm">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  What return on investment can we expect from commercial solar?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Returns vary by site and usage patterns, but well-designed systems typically 
                  deliver strong long-term savings and cost predictability. We provide detailed 
                  feasibility assessments that include realistic ROI projections based on your 
                  specific circumstances.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-white rounded-[5px] px-6 border-none shadow-sm">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you support multi-site organisations?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. We can support multi-site rollouts with consistent design principles 
                  and site-specific adaptations. This approach ensures quality and performance 
                  across your portfolio while accommodating the unique characteristics of each location.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-white rounded-[5px] px-6 border-none shadow-sm">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can you work within procurement frameworks?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. We are experienced in delivering projects aligned with public sector 
                  procurement and compliance requirements. We understand the documentation 
                  and process requirements that come with publicly funded work.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-white rounded-[5px] px-6 border-none shadow-sm">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you offer consultancy without installation?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. Advisory and feasibility-only engagements are available where appropriate. 
                  This can be valuable for organisations in the early planning stages or those 
                  requiring independent technical input.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-white rounded-[5px] px-6 border-none shadow-sm">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can you support carbon reporting?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  We can provide energy and generation data suitable for carbon reporting and 
                  stakeholder communication. Our monitoring and documentation approach supports 
                  the evidence requirements of carbon disclosure frameworks.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <ContactSection />

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-heliaxis-gold blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-heliaxis-gold blur-3xl" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
              Start the <span className="text-heliaxis-gold">conversation</span>
            </h2>
            <p className="text-xl text-white/80 mb-8 leading-relaxed">
              If your organisation is exploring renewable energy, energy efficiency or 
              decarbonisation, Heliaxis can help you make informed, defensible decisions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
              >
                <Link href="/contact">
                  Request a Feasibility Review
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-heliaxis-navy h-14 text-lg font-semibold px-8 transition-colors"
              >
                <Link href="/consultation">Advisory Services</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

