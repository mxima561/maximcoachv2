"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("animate-page-enter");
    // Force reflow to restart animation
    void el.offsetHeight;
    el.classList.add("animate-page-enter");
  }, [pathname]);

  return (
    <div ref={ref} className="animate-page-enter">
      {children}
    </div>
  );
}
