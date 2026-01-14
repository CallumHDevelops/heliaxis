import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  Sun, Battery, Lightbulb, Thermometer, Building2, Home, 
  Users, CheckCircle2, ArrowRight, Zap, Shield, Award,
  TrendingDown, Leaf, Clock, FileCheck, Building, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContactSection } from "@/components/ContactSection";

export const metadata: Metadata = {
  title: "Heliaxis | Renewable Energy Solutions Wales & South West England",
  description:
    "Energy That Revolves Around You. Heliaxis delivers renewable energy solutions for homes, businesses, local authorities and public sector organisations across Wales and the South West of England.",
};

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20">
        {/* Background Image */}
        <div className="absolute inset-0">
        <Image
            src="https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1920&h=1080&fit=crop"
            alt="Solar panels on residential rooftops"
            fill
          priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-4xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              Wales & South West England
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-tight mb-6">
              Energy That Revolves{" "}
              <span className="text-heliaxis-gold">around you</span>
          </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8 max-w-2xl">
              Heliaxis delivers renewable energy solutions for homes, businesses, local authorities 
              and public sector organisations across Wales and the South West of England. We design, 
              install and support energy systems that reduce costs, improve resilience and support 
              long-term decarbonisation goals.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg rounded-[5px]"
              >
                <Link href="/contact">
                  Get Your Free Quote
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-heliaxis-navy h-14 text-lg font-semibold px-8 transition-colors rounded-[5px]"
              >
                <Link href="/residential">Explore Solutions</Link>
              </Button>
            </div>
          </div>
        </div>
        {/* Decorative Elements */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-white" style={{ clipPath: "polygon(0 100%, 100% 100%, 100% 0, 0 100%)" }} />
      </section>

      {/* Trust Indicators */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-heliaxis-navy">MCS*</div>
              <div className="text-sm text-gray-600">Certified Installer</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-heliaxis-navy">10+</div>
              <div className="text-sm text-gray-600">Years Experience</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-heliaxis-navy">100%</div>
              <div className="text-sm text-gray-600">Quality Commitment</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-heliaxis-navy">Wales</div>
              <div className="text-sm text-gray-600">& South West England</div>
            </div>
          </div>
        </div>
      </section>

      {/* Introduction Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
            <div className="relative order-2 lg:order-1">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&h=600&fit=crop"
                  alt="Solar panels generating clean renewable energy"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -top-6 -left-6 w-32 h-32 rounded-[5px] bg-heliaxis-navy p-4 hidden md:flex flex-col justify-center items-center text-center shadow-xl">
                <Sun className="w-8 h-8 text-heliaxis-gold mb-2" />
                <span className="text-white text-xs font-medium">Clean Energy Solutions</span>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-heliaxis-navy mb-6">
                A practical, engineering-led approach to{" "}
                <span className="text-heliaxis-gold">renewable energy</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Energy is no longer a background consideration. Rising prices, grid constraints, 
                changing regulations and the transition to low-carbon technologies mean that energy 
                decisions now affect household finances, business competitiveness and public sector 
                accountability.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow bg-white">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Understanding First</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base leading-relaxed">
                  Every project begins with understanding. We look at how energy is currently used, 
                  where it is wasted, and where renewable technologies can make the biggest impact.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow bg-white">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Shield className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Quality Design</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base leading-relaxed">
                  We design systems that are proportionate, compliant and built to deliver long-term 
                  performance. Not generic packages. Not over-engineered solutions.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow bg-white">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Award className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Long-term Value</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base leading-relaxed">
                  Our approach applies equally to residential homes, commercial premises and public 
                  sector estates. Clarity, quality and long-term value guide everything we do.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Residential Solutions Section */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <Badge className="bg-heliaxis-navy text-white mb-4">For Homeowners</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Renewable energy solutions for your{" "}
                <span className="text-heliaxis-gold">home</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                For homeowners, renewable energy is about control, comfort and confidence. 
                Many households are looking for ways to reduce energy bills, protect themselves 
                from rising prices and make their homes more efficient — without taking on 
                unnecessary risk or complexity.
              </p>
              
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Sun className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-heliaxis-navy">Solar PV Systems</h3>
                    <p className="text-gray-600 text-sm">Generate clean electricity from daylight and significantly reduce grid imports.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Battery className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-heliaxis-navy">Battery Storage</h3>
                    <p className="text-gray-600 text-sm">Store surplus solar energy and use it when you need it most.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Thermometer className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-heliaxis-navy">Infrared Heating</h3>
                    <p className="text-gray-600 text-sm">Modern heating with targeted warmth and zoned control.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-heliaxis-navy">LED Lighting</h3>
                    <p className="text-gray-600 text-sm">Simple upgrades that significantly reduce electricity consumption.</p>
                  </div>
                </div>
              </div>

              <Button 
                asChild 
                className="bg-heliaxis-navy hover:bg-heliaxis-navy/90 text-white"
              >
                <Link href="/residential">
                  Explore Solar for your Home
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            
            <div className="relative">
              <div className="aspect-[4/3] rounded-[5px] bg-heliaxis-navy/5 overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800&h=600&fit=crop"
                  alt="Solar panels on a residential home roof"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-white rounded-[5px] p-6 shadow-xl max-w-xs hidden md:block">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-heliaxis-gold flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-heliaxis-navy" />
                  </div>
                  <div>
                    <div className="font-bold text-heliaxis-navy text-lg">Reduce Bills</div>
                    <div className="text-sm text-gray-600">Lower energy costs from day one</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Commercial & Public Sector Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="aspect-[4/3] rounded-[5px] bg-heliaxis-navy/5 overflow-hidden relative">
            <Image
                  src="https://images.unsplash.com/photo-1497440001374-f26997328c1b?w=800&h=600&fit=crop"
                  alt="Commercial building with solar installation"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-heliaxis-navy rounded-[5px] p-6 shadow-xl max-w-xs hidden md:block">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-heliaxis-gold flex items-center justify-center">
                    <Leaf className="w-6 h-6 text-heliaxis-navy" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-lg">Net Zero</div>
                    <div className="text-sm text-white/70">Support decarbonisation goals</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <Badge className="bg-heliaxis-gold text-heliaxis-navy mb-4">For Organisations</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Commercial & public sector{" "}
                <span className="text-heliaxis-gold">energy solutions</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                For businesses and public sector organisations, energy is a strategic consideration. 
                Decisions about energy infrastructure affect operating costs, resilience, compliance 
                and reputation. Renewable energy systems must therefore stand up to scrutiny and 
                deliver measurable value.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
                  <Building2 className="w-5 h-5 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
                  <span className="text-heliaxis-navy font-medium">SMEs & Large Businesses</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
                  <Building className="w-5 h-5 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
                  <span className="text-heliaxis-navy font-medium">Local Authorities</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
                  <Users className="w-5 h-5 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
                  <span className="text-heliaxis-navy font-medium">Housing Associations</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold hover:scale-105 transition-all duration-300 cursor-pointer group">
                  <Home className="w-5 h-5 text-heliaxis-gold group-hover:text-heliaxis-navy transition-colors" />
                  <span className="text-heliaxis-navy font-medium">Education Providers</span>
                </div>
              </div>

              <Button 
                asChild 
                className="bg-heliaxis-navy hover:bg-heliaxis-navy/90 text-white"
              >
                <Link href="/commercial">
                  Explore Commercial Solutions
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Our <span className="text-heliaxis-gold">renewable energy</span> services
            </h2>
            <p className="text-lg text-white/70 leading-relaxed">
              Heliaxis provides a comprehensive range of renewable energy and energy efficiency 
              solutions, each delivered with the same commitment to quality, transparency and 
              long-term value.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors group">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center mb-4 group-hover:bg-heliaxis-gold/30 transition-colors">
                  <Sun className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-white">Solar PV</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-white/70 text-base">
                  Solar photovoltaic systems for residential and commercial properties, 
                  designed to maximise self-consumption and long-term value.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors group">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center mb-4 group-hover:bg-heliaxis-gold/30 transition-colors">
                  <Battery className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-white">Battery Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-white/70 text-base">
                  Store surplus energy, reduce grid dependency and prepare for 
                  evolving tariffs and market changes.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors group">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center mb-4 group-hover:bg-heliaxis-gold/30 transition-colors">
                  <Thermometer className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-white">Infrared Heating</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-white/70 text-base">
                  Efficient heating solutions delivering targeted warmth and 
                  zoned control for improved comfort.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors group">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center mb-4 group-hover:bg-heliaxis-gold/30 transition-colors">
                  <Lightbulb className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-white">LED Lighting</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-white/70 text-base">
                  Cost-effective lighting upgrades that reduce consumption 
                  with some of the fastest payback periods.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How We Work */}
      <section className="py-20 lg:py-28 bg-white overflow-hidden">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                How we <span className="text-heliaxis-gold">work</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Every Heliaxis project follows a clear, structured process that ensures 
                projects are delivered smoothly, transparently and with outcomes that 
                meet expectations.
              </p>
            </div>
            <div className="relative">
              <div className="aspect-[16/10] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=500&fit=crop"
                  alt="Engineers discussing solar panel installation plans"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-[5px] bg-heliaxis-gold flex items-center justify-center hidden md:flex">
                <CheckCircle2 className="w-12 h-12 text-heliaxis-navy" />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="relative group">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden mb-4 relative">
                <Image
                  src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&h=300&fit=crop"
                  alt="Professional consultation meeting"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-heliaxis-navy/40 group-hover:bg-heliaxis-navy/50 transition-colors" />
                <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-lg font-bold">
                  1
                </div>
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-2">Consultation</h3>
              <p className="text-gray-600 text-sm">
                We begin by understanding your building, energy use and objectives 
                through detailed assessment.
              </p>
            </div>

            <div className="relative group">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden mb-4 relative">
                <Image
                  src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=300&fit=crop"
                  alt="Technical design and planning"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-heliaxis-navy/40 group-hover:bg-heliaxis-navy/50 transition-colors" />
                <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-lg font-bold">
                  2
                </div>
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-2">Design</h3>
              <p className="text-gray-600 text-sm">
                We develop a tailored system design with clear documentation 
                outlining scope, assumptions and options.
              </p>
            </div>

            <div className="relative group">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden mb-4 relative">
                <Image
                  src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=300&fit=crop"
                  alt="Professional solar panel installation"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-heliaxis-navy/40 group-hover:bg-heliaxis-navy/50 transition-colors" />
                <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-lg font-bold">
                  3
                </div>
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-2">Installation</h3>
              <p className="text-gray-600 text-sm">
                Installation is carried out to high electrical and structural 
                standards by qualified professionals.
              </p>
            </div>

            <div className="relative group">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden mb-4 relative">
                <Image
                  src="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop"
                  alt="Ongoing support and monitoring"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-heliaxis-navy/40 group-hover:bg-heliaxis-navy/50 transition-colors" />
                <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-lg font-bold">
                  4
                </div>
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-2">Support</h3>
              <p className="text-gray-600 text-sm">
                Commissioning, handover, documentation and ongoing support 
                where required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FIT & SEG Section */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Feed-in Tariff & Smart Export Guarantee{" "}
                <span className="text-heliaxis-gold">expertise</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Renewable energy projects often intersect with funding schemes and regulatory 
                frameworks. Understanding these correctly is essential to protecting value 
                and avoiding unintended consequences.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Many FIT systems can be upgraded to improve reliability and performance while 
                retaining eligibility, provided changes are planned and documented correctly. 
                We also help customers understand the Smart Export Guarantee, which pays for 
                exported renewable electricity under supplier-led tariffs.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  asChild 
                  className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold"
                >
                  <Link href="/seg">
                    Learn About SEG
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button 
                  asChild 
                  variant="outline" 
                  className="border-heliaxis-navy text-heliaxis-navy hover:bg-heliaxis-navy/5"
                >
                  <Link href="/funding">
                    Funding Options
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
            
            <div>
              {/* Cards Grid */}
              <div className="grid sm:grid-cols-2 gap-4">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <FileCheck className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">FIT Upgrades</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Specialist support for upgrading older solar systems while maintaining 
                    Feed-in Tariff eligibility.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Zap className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">SEG Guidance</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Clear guidance on Smart Export Guarantee eligibility, metering 
                    and tariff options.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Building className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">LA Funding</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Support with Local Authority funding routes and Shared Prosperity 
                    Fund programmes.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Clock className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Finance Options</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Finance options available through Selina Finance, subject to 
                    eligibility requirements.
                  </CardDescription>
                </CardContent>
              </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Heliaxis */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="relative">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&h=600&fit=crop"
                  alt="Professional team working on renewable energy project"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-heliaxis-gold rounded-[5px] p-6 shadow-xl max-w-[200px] hidden md:block">
                <div className="text-heliaxis-navy">
                  <div className="text-3xl font-bold">10+</div>
                  <div className="text-sm">Years of combined experience</div>
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Experience you can <span className="text-heliaxis-gold">trust</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Heliaxis is built on strong technical foundations. Our team brings together 
                decades of combined experience across household electrical installations, 
                commercial renewable systems and publicly funded decarbonisation projects.
              </p>
              
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold/5 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-heliaxis-navy mb-1">Quality First</h3>
                    <p className="text-gray-600 text-sm">
                      Quality, transparency and long-term support matter more than rapid sales 
                      or volume installs.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold/5 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-heliaxis-navy mb-1">Holistic Approach</h3>
                    <p className="text-gray-600 text-sm">
                      We understand not just the technology but the operational and financial 
                      context in which it sits.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-[5px] hover:bg-heliaxis-gold/5 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-heliaxis-gold/10 flex items-center justify-center flex-shrink-0">
                    <Award className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-heliaxis-navy mb-1">Proven Track Record</h3>
                    <p className="text-gray-600 text-sm">
                      Experience delivering projects within publicly funded and grant-supported 
                      frameworks including Welsh Government programmes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Experience Section */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Sectors we've <span className="text-heliaxis-gold">worked with</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Our team has delivered renewable energy projects across a diverse range of sectors, 
              bringing practical experience to every engagement.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            <div className="bg-white rounded-[5px] p-6 shadow-lg hover:shadow-xl transition-shadow group">
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-4">
                <Image
                  src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=225&fit=crop"
                  alt="Residential solar installation"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Residential Properties</h3>
              <p className="text-gray-600 text-sm">
                Solar PV, battery storage, and energy efficiency upgrades for homeowners across Wales.
              </p>
            </div>

            <div className="bg-white rounded-[5px] p-6 shadow-lg hover:shadow-xl transition-shadow group">
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-4">
                <Image
                  src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=225&fit=crop"
                  alt="Commercial building"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Commercial Buildings</h3>
              <p className="text-gray-600 text-sm">
                Office buildings, retail premises, and commercial estates seeking energy cost reduction.
              </p>
            </div>

            <div className="bg-white rounded-[5px] p-6 shadow-lg hover:shadow-xl transition-shadow group">
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-4">
                <Image
                  src="https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&h=225&fit=crop"
                  alt="School building"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Education Sector</h3>
              <p className="text-gray-600 text-sm">
                Schools, colleges, and educational facilities with daytime energy demands.
              </p>
            </div>

            <div className="bg-white rounded-[5px] p-6 shadow-lg hover:shadow-xl transition-shadow group">
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-4">
                <Image
                  src="https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=400&h=225&fit=crop"
                  alt="Housing estate"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Housing Associations</h3>
              <p className="text-gray-600 text-sm">
                Social housing providers delivering decarbonisation and fuel poverty reduction.
              </p>
            </div>

            <div className="bg-white rounded-[5px] p-6 shadow-lg hover:shadow-xl transition-shadow group">
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-4">
                <Image
                  src="https://images.unsplash.com/photo-1577495508048-b635879837f1?w=400&h=225&fit=crop"
                  alt="Local authority building"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Local Authorities</h3>
              <p className="text-gray-600 text-sm">
                Council buildings and public estates meeting net-zero commitments.
              </p>
            </div>

            <div className="bg-white rounded-[5px] p-6 shadow-lg hover:shadow-xl transition-shadow group">
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-4">
                <Image
                  src="https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=225&fit=crop"
                  alt="Industrial facility"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Industrial & Warehousing</h3>
              <p className="text-gray-600 text-sm">
                Manufacturing, logistics, and distribution facilities with high energy consumption.
              </p>
            </div>
          </div>

          <div className="bg-heliaxis-navy rounded-[5px] p-8 md:p-12">
            <div className="grid md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl md:text-5xl font-bold text-heliaxis-gold mb-2">10+</div>
                <div className="text-white/80">Years Combined Experience</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold text-heliaxis-gold mb-2">MCS*</div>
                <div className="text-white/80">Certified Installer</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold text-heliaxis-gold mb-2">100%</div>
                <div className="text-white/80">Quality Focus</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold text-heliaxis-gold mb-2">Wales</div>
                <div className="text-white/80">& South West Coverage</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <ContactSection />

      {/* MCS Accreditation Notice */}
      <section className="py-8 bg-gray-50">
        <div className="container mx-auto px-4 lg:px-8">
          <p className="text-sm text-gray-600 text-center">
            *MCS Accreditation pending
          </p>
        </div>
      </section>

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
              Whether you are a homeowner exploring solar and battery storage, a business 
              seeking to reduce operating costs, or a public sector organisation planning 
              decarbonisation, Heliaxis is ready to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
              >
                <Link href="/contact">
                  Request a Consultation
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-heliaxis-navy h-14 text-lg font-semibold px-8 transition-colors"
              >
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
    </div>
      </section>
    </>
  );
}
