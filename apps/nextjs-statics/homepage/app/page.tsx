import { Navbar } from "@/components/homepage/navbar"
import { HeroSection } from "@/components/homepage/hero-section"
import { LogoStrip } from "@/components/homepage/logo-strip"
import { FeaturesSection } from "@/components/homepage/features-section"
import { DemoSection } from "@/components/homepage/demo-section"
import { TestimonialsSection } from "@/components/homepage/testimonials-section"
import { FAQSection } from "@/components/homepage/faq-section"
import { Footer } from "@/components/homepage/footer"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <HeroSection />
        <LogoStrip />
        <FeaturesSection />
        <DemoSection />
        <TestimonialsSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  )
}
