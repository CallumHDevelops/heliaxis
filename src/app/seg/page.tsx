import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  Zap, CheckCircle2, ArrowRight, Battery, Sun, 
  FileText, AlertCircle, HelpCircle, Settings, 
  Gauge, ChevronRight, XCircle
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
  title: "Smart Export Guarantee (SEG) Explained",
  description:
    "Understand the Smart Export Guarantee for solar PV systems. Learn about SEG eligibility, export payments, metering requirements and how SEG works with battery storage.",
  keywords: [
    "Smart Export Guarantee",
    "SEG Wales",
    "solar export payments",
    "SEG tariff",
    "Feed-in Tariff vs SEG",
    "export metering",
    "solar battery SEG",
    "renewable energy export",
  ],
};

export default function SEGPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1558449028-b53a39d100fc?w=1920&h=1080&fit=crop"
            alt="Solar panels exporting clean energy to the grid"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              Export Payments
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Smart Export Guarantee{" "}
              <span className="text-heliaxis-gold">explained clearly</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8">
              The Smart Export Guarantee (SEG) is a UK government-backed framework that allows 
              households and organisations to receive payments for exporting surplus renewable 
              electricity back to the national grid. Heliaxis helps you understand how SEG works 
              and how it fits into your wider energy strategy.
            </p>
            <Button 
              asChild 
              size="lg" 
              className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
            >
              <Link href="/contact">
                Discuss Your Options
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Why SEG Exists */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Why the Smart Export Guarantee{" "}
                <span className="text-heliaxis-gold">exists</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                SEG was introduced to replace the export element of the Feed-in Tariff for new 
                renewable installations. Unlike FIT, SEG does not offer fixed, government-set 
                payments. Instead, licensed electricity suppliers are required to offer at least 
                one export tariff to eligible generators.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                However, SEG is not designed to be a primary revenue stream. It is best understood 
                as a supplementary benefit that rewards surplus generation after on-site energy 
                needs have been met.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Sun className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">Encourage small-scale renewable generation</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Zap className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">Reward export of clean electricity</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-heliaxis-gold/5 rounded-[5px] border-l-4 border-heliaxis-gold">
                  <Settings className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-heliaxis-navy">Support flexible, decentralised energy system</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              {/* Image */}
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=800&h=450&fit=crop"
                  alt="Smart meter displaying energy export data"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="bg-heliaxis-navy rounded-[5px] p-8 text-white">
              <h3 className="text-2xl font-bold mb-6">How SEG works</h3>
              <p className="text-white/80 mb-6">
                At its core, SEG is straightforward:
              </p>
              <ol className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center font-bold text-sm flex-shrink-0">
                    1
                  </div>
                  <span className="text-white/90">You generate electricity using a renewable system such as solar PV</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center font-bold text-sm flex-shrink-0">
                    2
                  </div>
                  <span className="text-white/90">You use electricity on site as needed</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center font-bold text-sm flex-shrink-0">
                    3
                  </div>
                  <span className="text-white/90">Any surplus electricity is exported to the grid</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center font-bold text-sm flex-shrink-0">
                    4
                  </div>
                  <span className="text-white/90">Your export is metered and recorded</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center font-bold text-sm flex-shrink-0">
                    5
                  </div>
                  <span className="text-white/90">Your electricity supplier pays you for the exported energy</span>
                </li>
              </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Eligibility */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Who is eligible for{" "}
              <span className="text-heliaxis-gold">SEG?</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Eligibility for SEG depends on several factors. While supplier requirements may 
              vary slightly, the core eligibility criteria generally include:
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Sun className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">Eligible System</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  An eligible renewable generation system such as solar PV
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">MCS* Certification</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Installation certified under the Microgeneration Certification Scheme
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Gauge className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">Export Metering</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Export metering capable of recording half-hourly export data
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg text-center">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-lg text-heliaxis-navy">SEG Registration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Registration with an electricity supplier offering a SEG tariff
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <div className="max-w-3xl mx-auto mt-12">
            <div className="bg-white rounded-[5px] p-6 shadow-lg border-l-4 border-heliaxis-gold">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-heliaxis-navy mb-2">Smart Meter Requirement</h4>
                  <p className="text-gray-600">
                    In most cases, participation in SEG requires export metering capable of half-hourly 
                    readings. For most customers, this means having a smart meter installed with an 
                    export MPAN. Heliaxis advises customers early on whether metering upgrades are 
                    likely to be required.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEG vs FIT */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                SEG vs Feed-in Tariff:{" "}
                <span className="text-heliaxis-gold">key differences</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                One of the most common sources of confusion is the relationship between SEG 
                and the Feed-in Tariff.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-gray-50 rounded-[5px] p-8">
                <h3 className="text-xl font-bold text-heliaxis-navy mb-6 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-navy text-white flex items-center justify-center text-sm">
                    FIT
                  </div>
                  Feed-in Tariff
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-navy mt-0.5 flex-shrink-0" />
                    Fixed, long-term generation payments set at installation
                  </li>
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-navy mt-0.5 flex-shrink-0" />
                    Includes both generation and export elements
                  </li>
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-navy mt-0.5 flex-shrink-0" />
                    Government-guaranteed rates
                  </li>
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-navy mt-0.5 flex-shrink-0" />
                    Closed to new applicants since 2019
                  </li>
                </ul>
              </div>

              <div className="bg-heliaxis-gold/10 rounded-[5px] p-8">
                <h3 className="text-xl font-bold text-heliaxis-navy mb-6 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-sm">
                    SEG
                  </div>
                  Smart Export Guarantee
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Variable export payments set by suppliers
                  </li>
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Applies only to exported electricity
                  </li>
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Supplier-led tariffs that can vary
                  </li>
                  <li className="flex items-start gap-3 text-gray-700">
                    <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    Available for new installations
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 bg-heliaxis-navy rounded-[5px] p-6 text-white">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-2">Important: FIT and SEG cannot be combined</h4>
                  <p className="text-white/80 text-sm">
                    If you are receiving FIT export payments, you cannot receive SEG export payments 
                    for the same electricity. However, FIT generation payments may continue independently.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Battery Storage and SEG */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Battery storage and{" "}
                <span className="text-heliaxis-gold">SEG</span>
              </h2>
              <p className="text-lg text-white/80 leading-relaxed mb-6">
                Battery storage changes how SEG fits into an energy system. By storing surplus 
                electricity, batteries reduce export volumes but increase on-site consumption.
              </p>
              <p className="text-lg text-white/80 leading-relaxed mb-8">
                This creates an important trade-off: exporting electricity earns SEG payments, 
                but using electricity on site avoids buying electricity at retail rates.
              </p>
              
              <div className="bg-white/5 rounded-[5px] p-6 border border-white/10">
                <p className="text-heliaxis-gold font-semibold mb-4">
                  In most cases, using energy on site is more valuable than exporting it.
                </p>
                <p className="text-white/70 text-sm">
                  Battery storage therefore tends to reduce SEG income while increasing overall 
                  savings. Heliaxis helps customers understand this balance and design systems 
                  that prioritise the most beneficial outcomes.
                </p>
              </div>
            </div>
            
            <div>
              <Card className="bg-white border-none shadow-xl">
                <CardHeader>
                  <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Battery className="w-7 h-7 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-xl text-heliaxis-navy">The Trade-off</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-[5px]">
                    <Zap className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-heliaxis-navy">Exporting electricity</h4>
                      <p className="text-sm text-gray-600">Earns SEG payments (typically lower rate)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-heliaxis-gold/10 rounded-[5px]">
                    <Battery className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-heliaxis-navy">Using on site</h4>
                      <p className="text-sm text-gray-600">Avoids retail electricity costs (typically higher value)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* What SEG Is Not */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                What SEG is <span className="text-heliaxis-gold">not</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                To avoid misunderstanding, it is important to be clear about what SEG does not provide:
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-[5px]">
                <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <span className="text-gray-700">It is not a guaranteed long-term income stream</span>
              </div>
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-[5px]">
                <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <span className="text-gray-700">It does not replace the Feed-in Tariff</span>
              </div>
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-[5px]">
                <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <span className="text-gray-700">It does not remove the need for good system design</span>
              </div>
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-[5px]">
                <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <span className="text-gray-700">It does not eliminate the value of battery storage</span>
              </div>
            </div>

            <div className="mt-8 bg-heliaxis-gold/10 rounded-[5px] p-6 border border-heliaxis-gold/20">
              <div className="flex items-start gap-4">
                <HelpCircle className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-heliaxis-navy mb-2">Our guidance</h4>
                  <p className="text-gray-600 text-sm">
                    SEG should never be the sole driver of system design. Heliaxis provides guidance 
                    based on delivery experience, ensuring that SEG is considered as one component 
                    of a wider energy strategy, not as a standalone incentive.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEG for Different Audiences */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Integrating SEG into your{" "}
              <span className="text-heliaxis-gold">energy strategy</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              The most successful renewable energy systems are designed holistically. Solar PV, 
              battery storage, heating systems and tariffs all interact.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl text-heliaxis-navy">For Homeowners</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  SEG provides a modest financial return on surplus solar energy that cannot be 
                  used on site. While SEG payments are typically lower than the cost of buying 
                  electricity from the grid, they still contribute to overall system value.
                </p>
                <p className="text-sm text-gray-500">
                  SEG works best when solar PV systems are sized to prioritise self-consumption, 
                  with battery storage used to maximise on-site use.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl text-heliaxis-navy">For Organisations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  For businesses and public sector organisations, SEG can form part of a broader 
                  energy strategy, particularly where generation exceeds on-site demand at certain times.
                </p>
                <p className="text-sm text-gray-500">
                  In some cases, SEG payments may be relatively small compared to on-site savings. 
                  In others, particularly where export volumes are significant, SEG can contribute 
                  meaningfully to overall project economics.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="max-w-3xl mx-auto mt-12">
            <div className="bg-white rounded-[5px] p-8 shadow-lg">
              <h3 className="text-xl font-bold text-heliaxis-navy mb-6 text-center">
                Heliaxis ensures SEG is considered correctly
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-gray-700">Lower energy bills</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-gray-700">Improved resilience</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-gray-700">Realistic returns</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span className="text-gray-700">Long-term flexibility</span>
                </div>
              </div>
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
                Smart Export Guarantee <span className="text-heliaxis-gold">FAQs</span>
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do I automatically receive SEG payments with solar panels?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  No. You must apply to a supplier offering a SEG tariff and meet eligibility 
                  requirements including MCS* certification and appropriate export metering. 
                  SEG registration is a separate process from solar installation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do I need a smart meter for SEG?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  In most cases, yes. Export metering capable of half-hourly readings is usually 
                  required for SEG participation. This typically means having a smart meter with 
                  an export MPAN. We can advise on metering requirements as part of your consultation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can I receive SEG if I am on the Feed-in Tariff?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  You cannot receive SEG export payments if you are receiving FIT export payments 
                  for the same electricity. However, FIT generation payments may continue 
                  independently. This distinction is important when considering system upgrades.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Is SEG worth it?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  SEG can add value, but it is best viewed as a supplementary benefit rather than 
                  a primary return. The greatest value from renewable energy typically comes from 
                  using energy on site rather than exporting it. SEG captures value from surplus 
                  that would otherwise be given away.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Does battery storage affect SEG?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. Batteries typically reduce export volumes while increasing on-site use. 
                  Since using energy on site is usually more valuable than exporting, this trade-off 
                  generally works in the homeowner&apos;s favour, even though SEG income may reduce.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
              If you are considering solar PV, battery storage or upgrading an existing system 
              and want to understand how the Smart Export Guarantee fits into your energy plans, 
              Heliaxis can help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
              >
                <Link href="/contact">
                  Discuss Your Options
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-heliaxis-navy h-14 text-lg font-semibold px-8 transition-colors"
              >
                <Link href="/residential">Solar for your Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

