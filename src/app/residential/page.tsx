import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  Sun, Battery, Lightbulb, Thermometer, Home, 
  CheckCircle2, ArrowRight, TrendingDown, Shield,
  Zap, Clock, FileCheck, ChevronRight, HelpCircle,
  PoundSterling, Gauge, Eye, Settings
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
  title: "Residential Solar & Battery Solutions",
  description:
    "Solar PV, battery storage, infrared heating and LED lighting solutions for homeowners across Wales. Reduce energy bills, protect against rising prices and make your home more sustainable.",
  keywords: [
    "residential solar panels Wales",
    "home battery storage",
    "solar PV for homes",
    "infrared heating homes",
    "LED lighting upgrade",
    "home energy efficiency",
    "solar installation Wales",
    "Feed-in Tariff upgrade",
    "Smart Export Guarantee",
  ],
};

export default function ResidentialPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&h=1080&fit=crop"
            alt="Solar panels on residential home rooftop"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              For Homeowners
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Renewable energy solutions for your{" "}
              <span className="text-heliaxis-gold">home</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8">
              Residential renewable energy has changed significantly in recent years. Modern systems 
              are more efficient, more flexible and easier to live with than ever before. Heliaxis 
              helps homeowners across Wales take control of their energy use through solar PV, 
              battery storage, infrared heating and LED lighting upgrades.
            </p>
            <Button 
              asChild 
              size="lg" 
              className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
            >
              <Link href="/contact">
                Get Your Free Quote
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Understanding Your Home */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Understanding how your home{" "}
                <span className="text-heliaxis-gold">uses energy</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Every home uses energy differently. Occupancy patterns, appliance usage, heating 
                systems, insulation levels and even lifestyle choices all influence how much 
                benefit renewable technologies can deliver.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Before recommending any system, Heliaxis looks at your specific circumstances to 
                ensure we recommend solutions that are correctly sized and realistically matched 
                to your household.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Clock className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">When you use electricity during the day</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Gauge className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">How much electricity you consume overall</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Thermometer className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">How heating and hot water are currently provided</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Settings className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">Future plans such as electric vehicles or home offices</span>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-square rounded-[5px] bg-heliaxis-navy/5 overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop"
                  alt="Modern home with energy efficient features"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Solar PV Section */}
      <section id="solar" className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800&h=600&fit=crop"
                  alt="Solar panels on residential roof"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-white rounded-[5px] p-6 shadow-xl max-w-xs hidden md:block">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-heliaxis-gold flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-heliaxis-navy" />
                  </div>
                  <div>
                    <div className="font-bold text-heliaxis-navy">Maximise Savings</div>
                    <div className="text-sm text-gray-600">Designed for self-consumption</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Sun className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">Solar PV for Homes</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Generate clean electricity from{" "}
                <span className="text-heliaxis-gold">daylight</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Solar photovoltaic (PV) panels generate electricity from daylight and allow you 
                to use renewable energy directly in your home. Even in Wales, modern solar panels 
                can produce a significant proportion of a household&apos;s annual electricity needs 
                when correctly designed.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                The greatest savings from solar PV come from using electricity as it is generated. 
                Heliaxis designs solar systems to maximise this self-consumption wherever possible.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <span className="text-gray-700">Reduce grid electricity imports</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <span className="text-gray-700">Protection from price rises</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <span className="text-gray-700">Clean, renewable energy</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <span className="text-gray-700">Increase property value</span>
                </div>
              </div>

              <div className="bg-heliaxis-navy/5 rounded-[5px] p-6">
                <h4 className="font-semibold text-heliaxis-navy mb-3">At handover, you will receive:</h4>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-heliaxis-gold" />
                    System documentation and warranties
                  </li>
                  <li className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-heliaxis-gold" />
                    Monitoring access to track generation and usage
                  </li>
                  <li className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-heliaxis-gold" />
                    Clear guidance on how the system operates
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Battery Storage Section */}
      <section id="battery" className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Battery className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">Battery Storage</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Store surplus energy and use it{" "}
                <span className="text-heliaxis-gold">when you need it</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Battery storage allows you to store surplus solar energy generated during the day 
                and use it later — typically in the evening when household demand is higher. This 
                significantly increases the proportion of solar energy you use yourself and reduces 
                reliance on grid electricity.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                For many homeowners, battery storage transforms solar PV from a partial solution 
                into a more complete energy system.
              </p>
              
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-[5px]">
                  <Zap className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Use more solar energy</h4>
                    <p className="text-sm text-gray-600">Increase self-consumption significantly</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-[5px]">
                  <TrendingDown className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Reduce grid imports</h4>
                    <p className="text-sm text-gray-600">Cut peak period electricity purchases</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-[5px]">
                  <Clock className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Future-proof flexibility</h4>
                    <p className="text-sm text-gray-600">Prepare for time-of-use tariffs</p>
                  </div>
                </div>
              </div>

              <div className="bg-heliaxis-navy text-white rounded-[5px] p-6">
                <h4 className="font-semibold mb-2">Retrofitting to existing systems</h4>
                <p className="text-white/80 text-sm">
                  In many cases, battery storage can be added to an existing solar PV system. If your 
                  system was installed under the Feed-in Tariff, additional care is required to ensure 
                  any upgrades are compliant and do not affect eligibility. Heliaxis assesses existing 
                  systems carefully.
                </p>
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?w=800&h=600&fit=crop"
                  alt="Home battery storage system"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infrared Heating Section */}
      <section id="infrared" className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
              <Thermometer className="w-5 h-5 text-heliaxis-gold" />
              <span className="font-medium text-heliaxis-navy">Infrared Heating</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Modern heating with targeted{" "}
              <span className="text-heliaxis-gold">warmth</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Infrared heating provides a modern alternative to traditional heating systems. Instead 
              of heating the air, infrared systems warm surfaces and objects, creating a comfortable 
              and even heat with zoned control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Home className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">Retrofit Properties</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Ideal for older properties where traditional upgrades would be disruptive
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Settings className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">Zoned Control</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Rooms can be heated independently, reducing wasted energy
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">Individual Rooms</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Perfect for specific rooms or zones requiring targeted heating
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">Honest Advice</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  We advise where infrared fits well and where alternatives may be better
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* LED Lighting Section */}
      <section id="led" className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="relative">
              <div className="aspect-[4/3] rounded-[5px] bg-heliaxis-navy/5 overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=800&h=600&fit=crop"
                  alt="Modern LED lighting in home"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            
            <div>
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Lightbulb className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">LED Lighting Upgrades</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Simple upgrades with{" "}
                <span className="text-heliaxis-gold">immediate impact</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                LED lighting upgrades are one of the simplest ways to reduce household energy 
                consumption. Compared to older lighting technologies, LEDs use significantly 
                less electricity and have a much longer lifespan.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Reduce Usage</h4>
                    <p className="text-sm text-gray-600">Lower electricity consumption for lighting</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Better Quality</h4>
                    <p className="text-sm text-gray-600">Improved light quality and consistency</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Less Maintenance</h4>
                    <p className="text-sm text-gray-600">Reduced bulb replacement needs</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-heliaxis-navy">Enhanced Comfort</h4>
                    <p className="text-sm text-gray-600">Better aesthetics throughout your home</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Finance Options */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
                Finance Available
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Finance options for{" "}
                <span className="text-heliaxis-gold">homeowners</span>
              </h2>
              <p className="text-lg text-white/80 leading-relaxed mb-6">
                We understand that upfront cost is an important consideration for many households. 
                To help make renewable energy more accessible, finance options may be available 
                for solar PV and battery storage systems through Selina Finance, subject to eligibility.
              </p>
              <p className="text-lg text-white/80 leading-relaxed mb-8">
                We provide clear quotations and documentation to support finance applications 
                and ensure that homeowners fully understand the costs, benefits and commitments involved.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-[5px]">
                  <PoundSterling className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-white">Spread costs over time</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-[5px]">
                  <TrendingDown className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-white">Immediate bill savings</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-[5px]">
                  <Clock className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-white">No need to delay</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-[5px]">
                  <FileCheck className="w-5 h-5 text-heliaxis-gold" />
                  <span className="text-white">Clear documentation</span>
                </div>
              </div>
            </div>
            
            <div className="grid gap-6">
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center mb-4">
                    <FileCheck className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-xl text-white">Feed-in Tariff Systems</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-white/70">
                    Many homes across Wales still operate solar systems installed under the 
                    Feed-in Tariff. We provide specialist support for FIT system owners, 
                    helping assess system health, inverter replacement options and compliant 
                    routes to add battery storage.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center mb-4">
                    <Zap className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-xl text-white">Smart Export Guarantee</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-white/70">
                    The Smart Export Guarantee (SEG) allows households to receive payments for 
                    exporting surplus renewable electricity to the grid. We help homeowners 
                    understand eligibility, metering and how export works alongside batteries.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* What Homeowners Value */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              What homeowners value most — and how we{" "}
              <span className="text-heliaxis-gold">deliver it</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              From working with homeowners across Wales, we understand that the most important 
              factors are trust, clarity and long-term support.
            </p>
          </div>

          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy">Trust in Installer</h3>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy">Honest Advice</h3>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy">Quality Work</h3>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <Gauge className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy">Realistic Expectations</h3>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                <HelpCircle className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="font-semibold text-heliaxis-navy">Ongoing Support</h3>
            </div>
          </div>
        </div>
      </section>

      {/* The Heliaxis Process */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              The Heliaxis residential{" "}
              <span className="text-heliaxis-gold">process</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Every residential project follows a clear, structured process designed to 
              ensure you get the right solution for your home.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-3">Initial Consultation</h3>
              <p className="text-gray-600 text-sm">
                Understand your home and goals through desktop review or site visit
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-3">Tailored Proposal</h3>
              <p className="text-gray-600 text-sm">
                Recommended options, expected outcomes and costs clearly outlined
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-3">Installation</h3>
              <p className="text-gray-600 text-sm">
                Carried out by qualified professionals to high standards
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                4
              </div>
              <h3 className="text-lg font-semibold text-heliaxis-navy mb-3">Handover & Support</h3>
              <p className="text-gray-600 text-sm">
                Commission, document and explain how everything works
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Residential <span className="text-heliaxis-gold">FAQs</span>
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Are solar panels worth it in Wales?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. Modern solar panels perform well in Wales and can significantly reduce 
                  electricity bills, especially when combined with battery storage. The key is 
                  good system design that accounts for your specific circumstances.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can I add a battery to my existing solar system?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  In many cases, yes. Compatibility depends on your inverter and system design. 
                  We assess this as part of our advice. If your system was installed under the 
                  Feed-in Tariff, additional care is required to ensure compliance.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do solar panels work in winter?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes, although output is lower during winter months. Systems are designed to 
                  perform across seasonal variation, and annual savings calculations account 
                  for this seasonal profile.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do I need a smart meter?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  A smart meter is usually required for export payments under the Smart Export 
                  Guarantee. It also helps you better understand and manage your energy use. 
                  We can advise on metering requirements as part of your consultation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Will renewable energy increase my home&apos;s value?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Well-designed renewable systems can improve the attractiveness and energy 
                  efficiency of a property. As energy costs remain a concern for buyers, 
                  homes with lower running costs may become increasingly desirable.
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
              Take the <span className="text-heliaxis-gold">next step</span>
            </h2>
            <p className="text-xl text-white/80 mb-8 leading-relaxed">
              If you are considering renewable energy for your home, Heliaxis is here to help 
              you make an informed decision.
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
                <Link href="/contact">Get a Tailored Quote</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

