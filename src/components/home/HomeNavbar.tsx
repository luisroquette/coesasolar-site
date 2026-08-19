import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import coesaLogoWhite from "@/assets/logos/coesa-white-new.png";

const navLinks = [
  { href: "#inicio", label: "Início" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#planos", label: "Planos" },
  { href: "#como-funciona", label: "Como Funciona" },
  { href: "/blog", label: "Blog" },
  { href: "#faq", label: "FAQ" },
];

export function HomeNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToForm = () => {
    document.querySelector("#beneficios")?.scrollIntoView({ behavior: "smooth" });
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? "bg-black/90 backdrop-blur-md" : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-4">
          <nav className="flex items-center justify-between h-20">
            <a href="#inicio" className="flex-shrink-0">
              <img src={coesaLogoWhite} alt="COESA" className="h-8 lg:h-10 w-auto" />
            </a>
            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">
                  {link.label}
                </a>
              ))}
            </div>
            <div className="hidden lg:flex items-center gap-3">
              <Button onClick={scrollToForm} size="sm" className="bg-white text-black hover:bg-white/90 font-medium px-6 rounded-sm">
                Simular
              </Button>
              <Button asChild size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 font-medium px-6 rounded-sm">
                <a href="https://relatorios.coesasolar.com.br/" target="_blank" rel="noopener noreferrer">Acesso</a>
              </Button>
            </div>
            <button className="lg:hidden text-white p-2" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </nav>
        </div>
      </motion.header>
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black pt-20 lg:hidden">
            <div className="container mx-auto px-4 py-8 flex flex-col gap-6">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="text-2xl text-white/80 hover:text-white py-2" onClick={() => setIsMobileMenuOpen(false)}>
                  {link.label}
                </a>
              ))}
              <Button onClick={scrollToForm} size="lg" className="bg-white text-black hover:bg-white/90 font-medium mt-4 rounded-sm w-full py-6">
                Simular Economia
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 font-medium rounded-sm w-full py-6">
                <a href="https://relatorios.coesasolar.com.br/" target="_blank" rel="noopener noreferrer">Acesso</a>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
