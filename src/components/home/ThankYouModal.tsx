import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Mail, MessageCircle, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThankYouModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteNome: string;
  isRegionNotSupported?: boolean;
}

export function ThankYouModal({ isOpen, onClose, clienteNome, isRegionNotSupported = false }: ThankYouModalProps) {
  const primeiroNome = clienteNome.split(' ')[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-lg bg-black border border-white/10 p-8 lg:p-12">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Content */}
              <div className="text-center">
                {isRegionNotSupported ? (
                  <>
                    {/* Region Not Supported Icon */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                      className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 mb-6"
                    >
                      <MapPin className="w-10 h-10 text-amber-500" />
                    </motion.div>

                    {/* Title */}
                    <h2 
                      className="text-2xl lg:text-3xl font-medium text-white mb-3"
                      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                    >
                      Hmm... {primeiroNome}
                    </h2>

                    {/* Message */}
                    <p className="text-white/70 text-lg mb-6">
                      Infelizmente ainda não atendemos a sua região.
                    </p>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="p-6 bg-amber-500/10 border border-amber-500/20 mb-8"
                    >
                      <p className="text-amber-400 font-medium text-lg">
                        🚀 Em breve estaremos aí!
                      </p>
                      <p className="text-amber-400/80 mt-3">
                        Oferecendo os maiores descontos do mercado e aí, te chamo, pode ser?
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 mb-8"
                    >
                      <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-green-500/10 rounded-full">
                        <MessageCircle className="w-6 h-6 text-green-500" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-medium">Contato salvo!</p>
                        <p className="text-white/60 text-sm">
                          Avisaremos assim que chegarmos na sua região
                        </p>
                      </div>
                    </motion.div>

                    {/* CTA */}
                    <Button
                      onClick={onClose}
                      className="w-full bg-white text-black hover:bg-white/90 h-14 rounded-sm font-medium"
                    >
                      Combinado!
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Success Icon */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                      className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-6"
                    >
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </motion.div>

                    {/* Title */}
                    <h2 
                      className="text-2xl lg:text-3xl font-medium text-white mb-3"
                      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                    >
                      Obrigado, {primeiroNome}!
                    </h2>

                    {/* Subtitle */}
                    <p className="text-white/60 text-lg mb-8">
                      Recebemos sua solicitação de simulação
                    </p>

                    {/* Info Cards */}
                    <div className="space-y-4 mb-8">
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center gap-4 p-4 bg-white/5 border border-white/10"
                      >
                        <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-green-500/10 rounded-full">
                          <MessageCircle className="w-6 h-6 text-green-500" />
                        </div>
                        <div className="text-left">
                          <p className="text-white font-medium">WhatsApp</p>
                          <p className="text-white/60 text-sm">
                            Você receberá sua proposta pelo WhatsApp cadastrado
                          </p>
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex items-center gap-4 p-4 bg-white/5 border border-white/10"
                      >
                        <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-blue-500/10 rounded-full">
                          <Mail className="w-6 h-6 text-blue-500" />
                        </div>
                        <div className="text-left">
                          <p className="text-white font-medium">E-mail</p>
                          <p className="text-white/60 text-sm">
                            Uma cópia também será enviada para seu e-mail
                          </p>
                        </div>
                      </motion.div>
                    </div>

                    {/* Timing info */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="p-4 bg-green-500/10 border border-green-500/20 mb-8"
                    >
                      <p className="text-green-400 font-medium">
                        ⚡ Sua proposta será gerada em instantes
                      </p>
                      <p className="text-green-400/70 text-sm mt-1">
                        Nossa consultora Sofia entrará em contato para tirar suas dúvidas
                      </p>
                    </motion.div>

                    {/* CTA */}
                    <Button
                      onClick={onClose}
                      className="w-full bg-white text-black hover:bg-white/90 h-14 rounded-sm font-medium"
                    >
                      Entendi
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
