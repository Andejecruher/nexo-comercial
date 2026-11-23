'use client';

import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

const DEFAULT_NUMBER = '15551468932';
const DEFAULT_MESSAGE = 'Hola, quiero sumarme a Voz Ciudadana';

export function WhatsAppFab({
  message = DEFAULT_MESSAGE,
  number = DEFAULT_NUMBER,
}: {
  message?: string;
  number?: string;
}) {
  const href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.2, type: 'spring' }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-sm px-5 py-3.5 rounded-full shadow-xl shadow-green-700/40 transition-colors"
      aria-label="Contactar por WhatsApp"
    >
      <MessageCircle className="w-5 h-5 shrink-0" />
      <span className="hidden sm:inline">Súmate por WhatsApp</span>
    </motion.a>
  );
}
