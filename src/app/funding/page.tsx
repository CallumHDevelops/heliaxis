import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  Building2, Users, CheckCircle2, ArrowRight, 
  FileText, PoundSterling, Building, Zap,
  ClipboardCheck, FileCheck, AlertCircle, Shield,
  ChevronRight
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
  title: "Funding & Support for Renewable Energy Projects",
  description:
    "Support for funding-led renewable energy projects in Wales. Local Authority funding, Shared Prosperity Fund, Feed-in Tariff upgrades and finance options for businesses and public sector.",
  keywords: [
    "renewable energy funding Wales",
    "SPF funding solar",
    "local authority energy funding",
    "housing association energy grants",
    "Feed-in Tariff upgrades",
    "Smart Export Guarantee",
    "public sector energy funding",
    "renewable energy finance",
  ],
};

export default function FundingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1920&h=1080&fit=crop"
            alt="Financial planning and funding documentation"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              Funding & Support
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Funding and financial support for{" "}
              <span className="text-heliaxis-gold">renewable energy</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8">
              For many organisations, funding is the difference between ambition and action. 
              Heliaxis supports organisations across Wales by helping them understand funding 
              options, define technically robust project scopes and deliver compliant renewable 
              energy solutions.
            </p>
            <Button 
              asChild 
              size="lg" 
              className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
            >
              <Link href="/contact">
                Discuss Funding Options
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Why Funding-led Projects Require Specialist Support */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Why funding-led projects require{" "}
                <span className="text-heliaxis-gold">specialist support</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Funding programmes are designed to deliver outcomes — not just installations. 
                Whether the objective is carbon reduction, economic development, fuel poverty 
                mitigation or energy resilience, funders expect projects to demonstrate clear 
                alignment with programme goals.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Heliaxis helps mitigate risks by combining technical expertise with practical 
                delivery experience. We understand what funders look for and how projects must 
                be structured to succeed.
              </p>
              {/* Image */}
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative mb-8 lg:hidden">
                <Image
                  src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=450&fit=crop"
                  alt="Funding documentation and project planning"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            
            <div className="space-y-6">
              {/* Desktop Image */}
              <div className="aspect-[16/9] rounded-[5px] overflow-hidden relative hidden lg:block">
                <Image
                  src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=450&fit=crop"
                  alt="Funding documentation and project planning"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="bg-gray-50 rounded-[5px] p-8">
              <h4 className="font-semibold text-heliaxis-navy mb-6 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-heliaxis-gold" />
                Common challenges in funding-led projects:
              </h4>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-white rounded-[5px] shadow-sm">
                  <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Vague or overly broad project scopes</span>
                </div>
                <div className="flex items-start gap-3 p-4 bg-white rounded-[5px] shadow-sm">
                  <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Technologies selected without sufficient feasibility assessment</span>
                </div>
                <div className="flex items-start gap-3 p-4 bg-white rounded-[5px] shadow-sm">
                  <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Underestimation of grid, electrical or structural constraints</span>
                </div>
                <div className="flex items-start gap-3 p-4 bg-white rounded-[5px] shadow-sm">
                  <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Insufficient documentation for audit and reporting</span>
                </div>
                <div className="flex items-start gap-3 p-4 bg-white rounded-[5px] shadow-sm">
                  <ChevronRight className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Delivery timelines misaligned with funding windows</span>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Local Authority Funding */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                      <Building2 className="w-6 h-6 text-heliaxis-gold" />
                    </div>
                    <CardTitle className="text-lg text-heliaxis-navy">Public Buildings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Solar PV installations on council and public buildings
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                      <Shield className="w-6 h-6 text-heliaxis-gold" />
                    </div>
                    <CardTitle className="text-lg text-heliaxis-navy">Battery Storage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Improve resilience and efficiency across estates
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                      <Zap className="w-6 h-6 text-heliaxis-gold" />
                    </div>
                    <CardTitle className="text-lg text-heliaxis-navy">LED Lighting</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      LED lighting upgrades across public estates
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                      <Users className="w-6 h-6 text-heliaxis-gold" />
                    </div>
                    <CardTitle className="text-lg text-heliaxis-navy">Community Energy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Community or shared renewable energy initiatives
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <Building className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">Local Authority Funding</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Supporting local authority{" "}
                <span className="text-heliaxis-gold">renewable projects</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Local authorities play a central role in delivering decarbonisation across 
                public estates and local communities. Renewable energy projects within councils 
                often sit alongside broader objectives such as cost reduction, carbon compliance, 
                social value and long-term asset management.
              </p>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Early-stage technical input to shape project scope</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Feasibility assessments and options appraisal</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Clear definition of deliverables and assumptions</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Installation aligned with public sector standards</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Documentation suitable for audit and scrutiny</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Shared Prosperity Fund */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-heliaxis-gold/10 rounded-full px-4 py-2 mb-6">
                <PoundSterling className="w-5 h-5 text-heliaxis-gold" />
                <span className="font-medium text-heliaxis-navy">Shared Prosperity Fund</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                SPF-aligned renewable energy{" "}
                <span className="text-heliaxis-gold">delivery</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                The UK Shared Prosperity Fund (SPF) is designed to support local investment 
                priorities, including decarbonisation, energy efficiency and economic resilience. 
                SPF-funded projects often focus on delivering tangible outcomes within defined 
                geographic areas.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Because SPF programmes often involve tight timelines, early technical clarity 
                is essential. Heliaxis helps ensure that projects move from approval to delivery 
                without unnecessary delays.
              </p>
            </div>
            
            <div className="bg-heliaxis-navy rounded-[5px] p-8 text-white">
              <h4 className="font-semibold text-heliaxis-gold mb-6">How we support SPF projects:</h4>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Identifying appropriate renewable technologies for SPF objectives</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Developing project scopes achievable within funding timelines</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Providing technical narratives to support funding approval</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Delivering installations with appropriate documentation</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Supporting evidence and reporting requirements</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Housing Associations */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              Housing Associations
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Funding support for{" "}
              <span className="text-heliaxis-gold">housing associations</span>
            </h2>
            <p className="text-lg text-white/80 leading-relaxed">
              Housing associations often rely on a combination of funding sources to support 
              decarbonisation of housing stock. These may include government grants, regional 
              funding programmes and internal capital budgets.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white/5 rounded-[5px] p-6 border border-white/10">
              <h4 className="font-semibold text-white mb-4">Funding-led challenges:</h4>
              <ul className="space-y-3 text-white/80">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Diverse property types and conditions
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Tenant engagement and disruption considerations
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Compliance with safety and housing standards
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Reporting against carbon and social outcomes
                </li>
              </ul>
            </div>

            <div className="bg-white/5 rounded-[5px] p-6 border border-white/10">
              <h4 className="font-semibold text-white mb-4">How we help:</h4>
              <ul className="space-y-3 text-white/80">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Aligning funding requirements with practical delivery
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Advising on phased approaches
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Balancing ambition with feasibility
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-heliaxis-gold mt-1 flex-shrink-0" />
                  Supporting reporting and compliance
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Private Sector & Alignment */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-heliaxis-navy mb-6">
                Private sector funding & finance
              </h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                For commercial organisations, funding may take the form of internal capital 
                investment, asset finance, green finance products or grant support where available.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Heliaxis helps private sector clients by clarifying technical scope and expected 
                outcomes, supporting financial modelling assumptions, and ensuring systems are 
                designed to deliver realistic returns.
              </p>
              <p className="text-sm text-gray-500 italic">
                Our role is not to advise on financial products, but to ensure that the technical 
                foundations of projects support informed financial decision-making.
              </p>
            </div>

            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-heliaxis-navy mb-6">
                Aligning funding with technical delivery
              </h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                One of the most common reasons funding-led projects underperform is misalignment 
                between funding assumptions and technical reality.
              </p>
              <div className="bg-heliaxis-gold/5 rounded-[5px] p-6 border border-heliaxis-gold/20">
                <h4 className="font-semibold text-heliaxis-navy mb-4">Heliaxis ensures:</h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                    Feasibility assessments are realistic
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                    Constraints are identified early
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                    Scope reflects deliverable outcomes
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                    Risks are clearly communicated
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Documentation & Compliance */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Documentation, compliance and{" "}
                <span className="text-heliaxis-gold">reporting</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Funding bodies typically require robust documentation to demonstrate compliance 
                and outcomes. Heliaxis provides documentation suitable for audit and reporting 
                as part of our delivery process.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <FileText className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Technical specifications</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <ClipboardCheck className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Commissioning evidence</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <Zap className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Energy generation or savings data</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <FileCheck className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Carbon impact reporting</span>
                </div>
              </div>
            </div>
            
            <div className="bg-heliaxis-navy rounded-[5px] p-8 text-white">
              <h3 className="text-2xl font-bold mb-6">Feed-in Tariff & SEG</h3>
              <p className="text-white/80 mb-6">
                Many funded projects involve upgrading or interacting with existing systems, 
                including those installed under the Feed-in Tariff. These systems require 
                careful handling to ensure continued eligibility.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Assessing existing FIT systems</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Identifying compliant upgrade routes</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Documenting changes appropriately</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Avoiding unintended impacts on eligibility</span>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-white/10">
                <Link 
                  href="/seg" 
                  className="inline-flex items-center gap-2 text-heliaxis-gold hover:text-heliaxis-gold/80 transition-colors"
                >
                  Learn about Smart Export Guarantee
                  <ArrowRight className="w-4 h-4" />
                </Link>
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
                Funding & Support <span className="text-heliaxis-gold">FAQs</span>
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can you help at the funding application stage?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  We can support technical scoping and options appraisal to inform funding 
                  applications, although we do not act as grant writers. Our input helps 
                  ensure that applications are based on technically sound and deliverable scopes.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you support reporting after installation?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. We provide commissioning and evidence documentation suitable for 
                  funder reporting. Our documentation approach is designed to meet the 
                  requirements of funded projects from the outset.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can funding be combined with private finance?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  In some cases, yes. This depends on programme rules and project structure. 
                  We can advise on technical considerations, but recommend seeking specialist 
                  financial advice for funding combinations.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you work with multiple stakeholders?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. We regularly coordinate with councils, housing associations, consultants 
                  and funders. Clear communication and structured documentation help ensure 
                  all stakeholders are aligned throughout the project.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  What happens if constraints are identified during delivery?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  We communicate constraints early and work collaboratively to adjust scope 
                  where necessary. Our approach to early identification and transparent 
                  communication helps minimise disruption to funded programmes.
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
              If your organisation is considering a funding-led renewable energy or 
              decarbonisation project, Heliaxis can help you move from idea to delivery 
              with confidence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
              >
                <Link href="/contact">
                  Discuss Funding Options
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-heliaxis-navy h-14 text-lg font-semibold px-8 transition-colors"
              >
                <Link href="/seg">Smart Export Guarantee</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

