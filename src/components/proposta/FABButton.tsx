import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';

interface FABButtonProps {
  visible: boolean;
  onClick: () => void;
}

export function FABButton({ visible, onClick }: FABButtonProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none"
        >
          <motion.button
            onClick={onClick}
            className="pointer-events-auto flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-sm sm:text-base py-3.5 px-6 rounded-2xl shadow-2xl max-w-sm w-full sm:w-auto"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            whileTap={{ scale: 0.98 }}
          >
            <Zap className="w-5 h-5" />
            Garantir meu desconto exclusivo
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
