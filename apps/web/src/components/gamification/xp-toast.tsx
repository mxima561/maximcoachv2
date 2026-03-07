"use client";

import { useEffect, useState } from "react";

interface XpToastProps {
  amount: number;
  label?: string;
  onDone?: () => void;
}

export function XpToast({ amount, label, onDone }: XpToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-bounce">
      <div className="rounded-full bg-primary px-4 py-2 text-primary-foreground shadow-lg">
        <span className="text-lg font-bold">+{amount} XP</span>
        {label && <span className="ml-1 text-sm opacity-80">{label}</span>}
      </div>
    </div>
  );
}
