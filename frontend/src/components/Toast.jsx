import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export default function Toast({ toast }) {
  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <AlertTriangle className="w-4 h-4 text-rose-400" />,
    info: <Info className="w-4 h-4 text-accent" />
  };
  return (
    <motion.div
      key={toast.id}
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] glass-panel rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2 text-xs font-medium text-ivory"
    >
      {icons[toast.type] || icons.info}
      {toast.message}
    </motion.div>
  );
}
