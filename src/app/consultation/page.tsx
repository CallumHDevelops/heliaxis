import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  Building2, Home, Users, CheckCircle2, ArrowRight, 
  FileText, Target, ClipboardList, PoundSterling, 
  Rocket, ChevronRight, Search, BarChart3, Settings,
  Building, Layers, HelpCircle, Lightbulb
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
  title: "Decarbonisation Consulting & Advisory Services",
  description:
    "Structured decarbonisation consulting and advisory services for housing associations, local authorities and large estates across Wales. Bridge the gap between strategy and delivery.",
  keywords: [
    "decarbonisation consulting Wales",
    "housing association energy advisory",
    "local authority decarbonisation",
    "estate decarbonisation",
    "energy retrofit planning",
    "carbon reduction strategy",
    "net zero consulting",
    "public sector energy advice",
  ],
};

export default function ConsultationPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?w=1920&h=1080&fit=crop"
            alt="Business professionals in strategic planning meeting"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              Advisory Services
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Decarbonisation consulting grounded in{" "}
              <span className="text-heliaxis-gold">real delivery</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8">
              Decarbonisation is no longer a future ambition. For many organisations, it is an 
              immediate operational requirement. Heliaxis provides structured decarbonisation 
              consulting designed to bridge the gap between strategy and delivery — with advice 
              grounded in practical experience.
            </p>
            <Button 
              asChild 
              size="lg" 
              className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
            >
              <Link href="/contact">
                Arrange a Consultation
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Who This Service Is For */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Who this service is{" "}
              <span className="text-heliaxis-gold">designed for</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Our consultation and advisory services are tailored for organisations that need 
              clarity, structure and confidence before committing to large-scale energy and 
              retrofit decisions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Users className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Housing Associations</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Managing diverse housing stock and balancing decarbonisation with tenant needs 
                  and funding constraints.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Building className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Local Authorities</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Responsible for public buildings and estates with net-zero commitments 
                  and value-for-money requirements.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Building2 className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Public Sector Bodies</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Delivering net-zero commitments while maintaining compliance and transparency 
                  in spending decisions.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Layers className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Education Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Managing campuses and mixed-use estates with varied building types and 
                  usage patterns.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Home className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Commercial Portfolios</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Multi-site organisations planning long-term energy and sustainability 
                  upgrades across their estate.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-14 h-14 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                  <Settings className="w-7 h-7 text-heliaxis-gold" />
                </div>
                <CardTitle className="text-xl text-heliaxis-navy">Asset Managers</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 text-base">
                  Estates teams planning long-term upgrades and requiring structured, 
                  implementable programmes.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Decarbonisation Requires Structured Planning */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Why decarbonisation requires{" "}
                <span className="text-heliaxis-gold">structured planning</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Decarbonisation is not a single technology decision. It is a multi-year process 
                involving sequencing, prioritisation and coordination across multiple systems.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Heliaxis helps organisations navigate the balance between moving too quickly 
                and moving too slowly — providing structured, phased advice that supports 
                informed decision-making.
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-white rounded-[5px] p-6 shadow-lg border-l-4 border-red-400">
                <h4 className="font-semibold text-heliaxis-navy mb-3">Risks of moving too quickly:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">•</span>
                    Technologies poorly matched to buildings
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">•</span>
                    Electrical or capacity constraints
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">•</span>
                    Missing funding opportunities
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-1">•</span>
                    Disappointing cost or carbon reductions
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-[5px] p-6 shadow-lg border-l-4 border-orange-400">
                <h4 className="font-semibold text-heliaxis-navy mb-3">Risks of moving too slowly:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-1">•</span>
                    Rising energy costs
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-1">•</span>
                    Asset obsolescence
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-1">•</span>
                    Increasing regulatory pressure
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 mt-1">•</span>
                    Lost funding windows
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Methodology */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Our decarbonisation consulting{" "}
                <span className="text-heliaxis-gold">methodology</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Heliaxis follows a structured methodology designed to move organisations 
                from uncertainty to action.
              </p>
            </div>
            <div className="relative">
              <div className="aspect-[16/10] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=500&fit=crop"
                  alt="Team collaboration on decarbonisation strategy"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-xl font-bold">
                1
              </div>
              <Card className="border-none shadow-lg pt-6">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Search className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Discovery & Data Capture</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Understanding the estate, objectives and constraints through asset data review, 
                    energy consumption analysis and stakeholder discussions.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-xl font-bold">
                2
              </div>
              <Card className="border-none shadow-lg pt-6">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <BarChart3 className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Options Appraisal</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Assessing interventions including solar PV, battery storage, electrical upgrades, 
                    heating options and lighting efficiency improvements.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-xl font-bold">
                3
              </div>
              <Card className="border-none shadow-lg pt-6">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Target className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Prioritisation & Phasing</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Prioritising actions based on impact, risk and funding alignment, developing 
                    phased delivery plans that are achievable.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-xl font-bold">
                4
              </div>
              <Card className="border-none shadow-lg pt-6">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <PoundSterling className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Funding Alignment</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Supporting alignment with Local Authority programmes, Shared Prosperity Fund 
                    initiatives, public sector capital and private finance options.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-xl font-bold">
                5
              </div>
              <Card className="border-none shadow-lg pt-6">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <FileText className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Procurement-Ready Outputs</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Technical scopes, specifications and options narratives suitable for 
                    decision-makers and procurement processes.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-heliaxis-gold text-heliaxis-navy flex items-center justify-center text-xl font-bold">
                6
              </div>
              <Card className="border-none shadow-lg pt-6">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Rocket className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Delivery Support</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Unlike purely advisory consultancies, Heliaxis can support delivery, ensuring 
                    that recommendations translate into real outcomes.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Housing Associations Section */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
                Housing Associations
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Decarbonising housing stock at{" "}
                <span className="text-heliaxis-gold">scale</span>
              </h2>
              <p className="text-lg text-white/80 leading-relaxed mb-6">
                Housing associations face some of the most complex decarbonisation challenges. 
                Housing stock often spans multiple decades, construction types and energy 
                performance levels. Tenant needs, safety considerations and affordability 
                must be balanced alongside carbon reduction targets.
              </p>
              <p className="text-lg text-white/80 leading-relaxed mb-8">
                Heliaxis supports housing associations with a practical, delivery-led approach 
                to stock decarbonisation.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Assess current stock performance and constraints</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Identify property archetypes and priority interventions</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Evaluate technology options</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Develop phased retrofit plans aligned to budgets</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold flex-shrink-0" />
                  <span>Support procurement-ready scopes and delivery</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-[5px] p-8 border border-white/10">
              <h4 className="font-semibold text-white mb-6">Key challenges we address:</h4>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center flex-shrink-0">
                    <Home className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h5 className="font-medium text-white">Mixed Stock</h5>
                    <p className="text-sm text-white/70">Mixed-age and mixed-construction housing stock</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h5 className="font-medium text-white">Varying Performance</h5>
                    <p className="text-sm text-white/70">Varying EPC ratings and thermal performance</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center flex-shrink-0">
                    <Settings className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h5 className="font-medium text-white">Limited Capacity</h5>
                    <p className="text-sm text-white/70">Limited electrical capacity in older properties</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[5px] bg-heliaxis-gold/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-heliaxis-gold" />
                  </div>
                  <div>
                    <h5 className="font-medium text-white">Tenant Considerations</h5>
                    <p className="text-sm text-white/70">Tenant disruption and engagement concerns</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technology-Neutral Advice */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Technology-neutral,{" "}
              <span className="text-heliaxis-gold">outcome-focused</span> advice
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              A key principle of our advisory work is neutrality. While we have deep experience 
              delivering solar, battery, heating and electrical projects, our consulting work 
              is focused on outcomes, not selling a particular technology.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-8 rounded-[5px] bg-gray-50">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-3">Where Technologies Work</h3>
              <p className="text-gray-600">
                Transparent about where technologies perform well and deliver genuine value.
              </p>
            </div>

            <div className="text-center p-8 rounded-[5px] bg-gray-50">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-6">
                <HelpCircle className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-3">Where Constraints Exist</h3>
              <p className="text-gray-600">
                Honest about limitations and constraints that may affect outcomes.
              </p>
            </div>

            <div className="text-center p-8 rounded-[5px] bg-gray-50">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-6">
                <Lightbulb className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-3">Alternative Approaches</h3>
              <p className="text-gray-600">
                Clear guidance where alternative approaches may be more appropriate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Typical Outputs */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Typical outputs from a Heliaxis{" "}
                <span className="text-heliaxis-gold">engagement</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                All outputs are designed to support decision-making and next steps. 
                Depending on scope, deliverables may include:
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <ClipboardList className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Estate or stock-level assessment summaries</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <BarChart3 className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Technology options matrices</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <Target className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Phased decarbonisation roadmaps</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <FileText className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Cost and carbon impact narratives</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <PoundSterling className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Funding-aligned project scopes</span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-[5px] shadow-sm">
                  <Rocket className="w-6 h-6 text-heliaxis-gold" />
                  <span className="text-heliaxis-navy font-medium">Implementation-ready recommendations</span>
                </div>
              </div>
            </div>
            
            <div className="bg-heliaxis-navy rounded-[5px] p-8 text-white">
              <h3 className="text-2xl font-bold mb-6">Why choose Heliaxis for advisory work?</h3>
              <p className="text-white/80 mb-8">
                Clients choose Heliaxis because our advice is grounded in delivery experience. 
                We understand what can realistically be implemented and what risks to avoid.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Practical, non-academic approach</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Experience across residential, commercial and public sector</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Clear communication for senior decision-makers</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-heliaxis-gold mt-0.5 flex-shrink-0" />
                  <span>Ability to support both strategy and delivery</span>
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
                Consultation <span className="text-heliaxis-gold">FAQs</span>
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you provide advisory services without installation?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. Consultancy and advisory services can be delivered independently of 
                  installation. This can be valuable for organisations in early planning stages 
                  or those requiring independent technical input before procurement.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can you support pilot projects?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. Pilot schemes are often an effective way to test approaches before wider 
                  rollout. We can support the design, delivery and evaluation of pilot projects 
                  to inform larger programmes.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you work alongside other consultants or asset managers?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. We regularly collaborate with other professional teams including energy 
                  consultants, asset managers and project managers. Our technical input can 
                  complement broader advisory relationships.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Can you support tenant engagement considerations?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  We can advise on technical implications, phasing and disruption considerations 
                  that affect tenant engagement. While we don&apos;t lead tenant engagement 
                  directly, our advice helps shape programmes that minimise disruption.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-gray-50 rounded-[5px] px-6 border-none">
                <AccordionTrigger className="text-left text-heliaxis-navy font-medium hover:no-underline">
                  Do you provide ongoing advisory support?
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes. Long-term advisory and delivery support is available. This can include 
                  ongoing technical input, programme monitoring and support for subsequent 
                  phases of work.
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
              If your organisation is planning decarbonisation and needs clarity, structure 
              and confidence, Heliaxis can help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
              >
                <Link href="/contact">
                  Arrange a Consultation
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-heliaxis-navy h-14 text-lg font-semibold px-8 transition-colors"
              >
                <Link href="/commercial">Commercial Solutions</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

