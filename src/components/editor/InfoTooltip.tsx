"use client";

import { useState } from "react";

interface InfoTooltipProps {
  tip: string;
}

const TIP_WIDTH = 210;

export default function InfoTooltip({ tip }: InfoTooltipProps) {
  // Viewport position of the bubble; fixed so the scrolling strips it sits in cannot clip it.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const left = Math.min(Math.max(8, r.left + r.width / 2 - TIP_WIDTH / 2), window.innerWidth - TIP_WIDTH - 8);
        setPos({ left, bottom: window.innerHeight - r.top + 6 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <span className="cursor-default text-xs leading-none text-muted" aria-label="Info">
        ⓘ
      </span>
      {pos && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[200] whitespace-normal rounded-md bg-ink px-2.5 py-1.5 font-sans text-xs font-normal normal-case leading-normal tracking-normal text-app shadow-lg"
          style={{ left: pos.left, bottom: pos.bottom, width: TIP_WIDTH }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}
