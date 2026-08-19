import {
  HomeNavbar,
  HeroSection,
  BenefitsSection,
  WhyChooseSection,
  AboutSection,
  PlansSection,
  HowItWorksSection,
  FAQSection,
  CTASection,
  HomeFooter,
  WhatsAppFloatingButton,
  CalculatorSection,
} from "@/components/home";
import { HomeBlogSection } from "@/components/blog/HomeBlogSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <HomeNavbar />
      <main>
        <HeroSection />
        <BenefitsSection />
        <WhyChooseSection />
        <CalculatorSection />
        <PlansSection />
        <HowItWorksSection />
        <AboutSection />
        <HomeBlogSection />
        <FAQSection />
        <CTASection />
      </main>
      <HomeFooter />
      <WhatsAppFloatingButton />
    </div>
  );
};

export default Index;
