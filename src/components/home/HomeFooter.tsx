import { Mail, Instagram, Linkedin, Facebook } from "lucide-react";
import coesaLogoWhite from "@/assets/logos/coesa-white-new.png";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

export function HomeFooter() {
  const currentYear = new Date().getFullYear();
  const { configs, loading } = useConfiguracoes();

  // Formatar telefone para exibição
  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `(${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  return (
    <footer className="bg-black text-white">
      <div className="container mx-auto px-4 py-16 lg:py-20">
        {/* Main Footer Content */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Logo and Description */}
          <div className="lg:col-span-2">
            <img 
              src={coesaLogoWhite} 
              alt={configs.empresa_nome} 
              className="h-8 w-auto mb-6"
            />
            <p className="text-white/50 text-sm leading-relaxed max-w-md mb-8">
              Pioneiros no modelo de energia solar por assinatura, 
              proporcionando economia real e sustentabilidade para residências 
              e empresas em todo o Brasil.
            </p>
            <div className="flex gap-3">
              <a 
                href={configs.rede_social_instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a 
                href={configs.rede_social_linkedin} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a 
                href={configs.rede_social_facebook} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-medium text-white/80 uppercase tracking-wider mb-6">Links</h4>
            <ul className="space-y-4">
              {[
                { label: "Início", href: "#inicio" },
                { label: "Benefícios", href: "#beneficios" },
                { label: "Planos", href: "#planos" },
                { label: "Como Funciona", href: "#como-funciona" },
                { label: "FAQ", href: "#faq" },
              ].map((link) => (
                <li key={link.href}>
                  <a 
                    href={link.href} 
                    className="text-white/50 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-medium text-white/80 uppercase tracking-wider mb-6">Contato</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-white/50 flex-shrink-0 mt-0.5" />
                <a 
                  href="mailto:contato@coesaenergia.com.br"
                  className="text-white/50 hover:text-white text-sm transition-colors"
                >
                  contato@coesaenergia.com.br
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/30 text-xs text-center md:text-left">
              © {currentYear} {configs.empresa_nome}. Todos os direitos reservados.
            </p>
            <p className="text-white/30 text-xs">
              {configs.empresa_nome}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
