import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { 
  CheckCircle2, ArrowRight, Shield, Users, Award, 
  Target, Heart, Lightbulb
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContactSection } from "@/components/ContactSection";

export const metadata: Metadata = {
  title: "About Heliaxis | Renewable Energy Experts Wales",
  description:
    "Heliaxis is built on strong technical foundations with decades of combined experience across household electrical installations, commercial renewable systems and publicly funded decarbonisation projects.",
  keywords: [
    "about Heliaxis",
    "renewable energy company Wales",
    "solar installers Wales",
    "MCS* certified installer",
    "energy company South West England",
  ],
};

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1920&h=1080&fit=crop"
            alt="Professional renewable energy team at work"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>
        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
              About Us
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Experience you can{" "}
              <span className="text-heliaxis-gold">trust</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed">
              Heliaxis is built on strong technical foundations. Our team brings together 
              decades of combined experience across household electrical installations, 
              commercial renewable systems and publicly funded decarbonisation projects.
            </p>
          </div>
        </div>
      </section>

      {/* Our Approach */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                Our approach is built around one simple{" "}
                <span className="text-heliaxis-gold">principle</span>
              </h2>
              <p className="text-xl text-gray-700 leading-relaxed mb-6 font-medium">
                Energy systems should revolve around the people and organisations using them.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Not generic packages. Not over-engineered solutions. Not sales-led promises. 
                Just carefully designed systems that work.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed">
                This breadth of experience allows us to approach projects holistically, understanding 
                not just the technology but the operational and financial context in which it sits. 
                We believe that quality, transparency and long-term support matter more than rapid 
                sales or volume installs.
              </p>
            </div>
            
            <div className="space-y-6">
              {/* Feature Image */}
              <div className="aspect-[4/3] rounded-[5px] overflow-hidden relative">
                <Image
                  src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=600&fit=crop"
                  alt="Team discussing renewable energy solutions"
                  fill
                  className="object-cover"
                />
              </div>
              {/* Values Grid */}
              <div className="grid sm:grid-cols-2 gap-6">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Shield className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Quality</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    High standards in everything we do, from design to installation to support.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Target className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Transparency</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Clear communication, honest advice, and realistic expectations.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Heart className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Long-term Support</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Ongoing support that extends beyond installation day.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-[5px] bg-heliaxis-gold/10 flex items-center justify-center mb-4">
                    <Lightbulb className="w-6 h-6 text-heliaxis-gold" />
                  </div>
                  <CardTitle className="text-lg text-heliaxis-navy">Expertise</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    Deep technical knowledge across residential and commercial sectors.
                  </CardDescription>
                </CardContent>
              </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Sets Us Apart */}
      <section className="py-20 lg:py-28 section-pattern">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              What sets us <span className="text-heliaxis-gold">apart</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Renewable energy has grown rapidly over the last decade, but not all installations 
              deliver the value people expect. Heliaxis takes a different approach.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-8 bg-white rounded-[5px] shadow-lg">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-4">Understanding First</h3>
              <p className="text-gray-600">
                Every project begins with understanding. We look at how energy is currently used, 
                where it is wasted, and where renewable technologies can make the biggest impact.
              </p>
            </div>

            <div className="text-center p-8 bg-white rounded-[5px] shadow-lg">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-4">Engineering-led Design</h3>
              <p className="text-gray-600">
                We design systems that are proportionate, compliant and built to deliver long-term 
                performance — not generic packages that may not suit your needs.
              </p>
            </div>

            <div className="text-center p-8 bg-white rounded-[5px] shadow-lg">
              <div className="w-16 h-16 rounded-full bg-heliaxis-gold/10 flex items-center justify-center mx-auto mb-6">
                <Award className="w-8 h-8 text-heliaxis-gold" />
              </div>
              <h3 className="text-xl font-semibold text-heliaxis-navy mb-4">Proven Track Record</h3>
              <p className="text-gray-600">
                Experience delivering projects within publicly funded and grant-supported frameworks, 
                including Welsh Government backed programmes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
                What we believe in
              </h2>
            </div>

            <div className="space-y-6">
              <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-[5px]">
                <CheckCircle2 className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Honest Advice</h3>
                  <p className="text-gray-600">
                    We do not push unnecessary technologies or oversell savings. Our goal is to 
                    design systems that genuinely fit your needs and deliver benefits over the long term.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-[5px]">
                <CheckCircle2 className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Quality Workmanship</h3>
                  <p className="text-gray-600">
                    Installation is carried out to high electrical and structural standards, with clear 
                    documentation and monitoring provided at handover.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-[5px]">
                <CheckCircle2 className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Realistic Expectations</h3>
                  <p className="text-gray-600">
                    We provide clear quotations and documentation, ensuring that customers understand 
                    both the costs and benefits before proceeding.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-[5px]">
                <CheckCircle2 className="w-6 h-6 text-heliaxis-gold flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-heliaxis-navy mb-2">Ongoing Support</h3>
                  <p className="text-gray-600">
                    Our relationship doesn&apos;t end at installation. We provide ongoing support where 
                    required, helping you get the most from your renewable energy system.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Where We Work */}
      <section className="py-20 lg:py-28 bg-heliaxis-navy">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Serving Wales and the{" "}
              <span className="text-heliaxis-gold">South West of England</span>
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
              Heliaxis delivers renewable energy solutions for homes, businesses, local authorities 
              and public sector organisations across Wales and the South West of England. Our local 
              presence means we understand the specific challenges and opportunities in our region.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Badge className="bg-white/10 text-white border-white/20 px-4 py-2">Wales</Badge>
              <Badge className="bg-white/10 text-white border-white/20 px-4 py-2">South West England</Badge>
              <Badge className="bg-white/10 text-white border-white/20 px-4 py-2">Bristol</Badge>
              <Badge className="bg-white/10 text-white border-white/20 px-4 py-2">Cardiff</Badge>
              <Badge className="bg-white/10 text-white border-white/20 px-4 py-2">Swansea</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <ContactSection />

      {/* MCS Accreditation Notice */}
      {/* <section className="py-8 bg-gray-50">
        <div className="container mx-auto px-4 lg:px-8">
          <p className="text-sm text-gray-600 text-center">
            *MCS Accreditation pending
          </p>
        </div>
      </section> */}

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-heliaxis-navy mb-6">
              Ready to work with us?
            </h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              Whether you are a homeowner exploring solar and battery storage, a business seeking 
              to reduce operating costs, or a public sector organisation planning decarbonisation, 
              Heliaxis is ready to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-8 h-14 text-lg"
              >
                <Link href="/contact">
                  Get in Touch
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                variant="outline" 
                className="border-heliaxis-navy text-heliaxis-navy hover:bg-heliaxis-navy/5 h-14 text-lg"
              >
                <Link href="/residential">Explore Our Solutions</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

