"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const solutions = [
  {
    title: "Solar for your Home",
    href: "/residential",
    description: "Solar PV, battery storage, and energy solutions for homeowners.",
  },
  {
    title: "Commercial & Public Sector",
    href: "/commercial",
    description: "Renewable energy for businesses, local authorities, and housing associations.",
  },
  {
    title: "Consultation & Advisory",
    href: "/consultation",
    description: "Decarbonisation consulting and strategic energy planning.",
  },
];

const resources = [
  {
    title: "Funding & Support",
    href: "/funding",
    description: "Local authority funding, SPF programmes, and finance options.",
  },
  {
    title: "Smart Export Guarantee",
    href: "/seg",
    description: "Understanding SEG payments and export tariffs.",
  },
];

export function Navigation() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const pathname = usePathname();
  
  // Check if we're on the subcontractor form page
  const isSubcontractorPage = pathname === '/subcontractor-form';

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Force navbar to always be solid on subcontractor form page
  const shouldShowSolidNav = isScrolled || isSubcontractorPage;

  return (
    <header className={cn(
      "fixed top-0 z-50 w-full transition-all duration-300",
      shouldShowSolidNav 
        ? "border-b border-heliaxis-navy/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm" 
        : "border-b border-white/10 bg-transparent"
    )}>
      <nav className="container mx-auto flex h-20 items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/assets/heliaxis-logo.png"
            alt="Heliaxis"
            width={180}
            height={50}
            className={cn(
              "h-12 w-auto transition-all duration-300",
              shouldShowSolidNav ? "" : "brightness-0 invert"
            )}
            priority
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-1">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={cn(
                  navigationMenuTriggerStyle(), 
                  "bg-transparent hover:bg-heliaxis-gold/30 focus:bg-heliaxis-gold/30 hover:text-heliaxis-navy text-base font-medium rounded-[5px] transition-all",
                  shouldShowSolidNav ? "text-heliaxis-navy" : "text-white"
                )}>
                  <Link href="/">Home</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger className={cn(
                  "bg-transparent hover:bg-heliaxis-gold/30 focus:bg-heliaxis-gold/30 data-[state=open]:bg-heliaxis-gold/30 text-base font-medium rounded-[5px] transition-all",
                  shouldShowSolidNav ? "text-heliaxis-navy" : "text-white"
                )}>Solutions</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                    {solutions.map((item) => (
                      <ListItem
                        key={item.title}
                        title={item.title}
                        href={item.href}
                      >
                        {item.description}
                      </ListItem>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger className={cn(
                  "bg-transparent hover:bg-heliaxis-gold/30 focus:bg-heliaxis-gold/30 data-[state=open]:bg-heliaxis-gold/30 text-base font-medium rounded-[5px] transition-all",
                  shouldShowSolidNav ? "text-heliaxis-navy" : "text-white"
                )}>Resources</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
                    {resources.map((item) => (
                      <ListItem
                        key={item.title}
                        title={item.title}
                        href={item.href}
                      >
                        {item.description}
                      </ListItem>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink asChild className={cn(
                  navigationMenuTriggerStyle(), 
                  "bg-transparent hover:bg-heliaxis-gold/30 focus:bg-heliaxis-gold/30 hover:text-heliaxis-navy text-base font-medium rounded-[5px] transition-all",
                  shouldShowSolidNav ? "text-heliaxis-navy" : "text-white"
                )}>
                  <Link href="/about">About</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-3">
          <Link 
            href="/contact"
            className={cn(
              "px-4 py-2 bg-transparent hover:bg-heliaxis-gold/30 focus:bg-heliaxis-gold/30 hover:text-heliaxis-navy text-base font-medium rounded-[5px] transition-all",
              shouldShowSolidNav ? "text-heliaxis-navy" : "text-white"
            )}
          >
            Contact Us
          </Link>
          <Button 
            asChild 
            className="bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold px-6 rounded-[5px]"
          >
            <Link href="/contact">Get a Quote</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" className={cn(
              "transition-colors",
              shouldShowSolidNav ? "text-heliaxis-navy" : "text-white"
            )}>
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:w-[400px] bg-white">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SheetDescription className="sr-only">
              Navigate through Heliaxis website pages
            </SheetDescription>
            <div className="flex flex-col gap-6 mt-8 px-4">
              <Link 
                href="/" 
                className="text-lg font-medium text-heliaxis-navy hover:bg-heliaxis-gold/30 hover:text-heliaxis-navy transition-colors p-2 rounded-[5px]"
                onClick={() => setIsOpen(false)}
              >
                Home
              </Link>
              
              <div className="space-y-3">
                <p className="text-sm font-semibold text-heliaxis-navy/60 uppercase tracking-wider">
                  Solutions
                </p>
                {solutions.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block text-lg font-medium text-heliaxis-navy hover:bg-heliaxis-gold/30 hover:text-heliaxis-navy transition-colors pl-4 border-l-2 border-heliaxis-gold/30 hover:border-heliaxis-gold p-2 rounded-[5px]"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-heliaxis-navy/60 uppercase tracking-wider">
                  Resources
                </p>
                {resources.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block text-lg font-medium text-heliaxis-navy hover:bg-heliaxis-gold/30 hover:text-heliaxis-navy transition-colors pl-4 border-l-2 border-heliaxis-gold/30 hover:border-heliaxis-gold p-2 rounded-[5px]"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>

              <Link 
                href="/about" 
                className="text-lg font-medium text-heliaxis-navy hover:bg-heliaxis-gold/30 hover:text-heliaxis-navy transition-colors p-2 rounded-[5px]"
                onClick={() => setIsOpen(false)}
              >
                About
              </Link>

              <div className="pt-6 border-t border-heliaxis-navy/10 space-y-3">
                <Button 
                  asChild 
                  className="w-full bg-heliaxis-gold hover:bg-heliaxis-gold/90 text-heliaxis-navy font-semibold rounded-[5px]"
                >
                  <Link href="/contact" onClick={() => setIsOpen(false)}>
                    Get a Quote
                  </Link>
                </Button>
                <Button 
                  asChild 
                  variant="outline"
                  className="w-full border-heliaxis-navy text-heliaxis-navy hover:bg-heliaxis-navy/5 rounded-[5px]"
                >
                  <Link href="/contact" onClick={() => setIsOpen(false)}>
                    Contact Us
                  </Link>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-[5px] p-3 leading-none no-underline outline-none transition-colors hover:bg-heliaxis-gold/30 hover:text-heliaxis-navy focus:bg-heliaxis-gold/30 focus:text-heliaxis-navy",
            className
          )}
          {...props}
        >
          <div className="text-sm font-semibold leading-none text-heliaxis-navy">{title}</div>
          <p className="text-sm leading-snug text-heliaxis-navy/70 mt-1.5">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

