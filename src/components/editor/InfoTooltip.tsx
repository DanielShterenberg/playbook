"use client";

import { useState } from "react";

interface InfoTooltipProps {
  tip: string;
}

export default function InfoTooltip({ tip }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{ cursor: "default", color: "#9CA3AF", fontSize: 11, lineHeight: 1 }}
        aria-label="Info"
      >
        ⓘ
      </span>
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1F2937",
            color: "#F9FAFB",
            fontSize: 11,
            borderRadius: 6,
            padding: "6px 9px",
            whiteSpace: "normal",
            width: 210,
            zIndex: 200,
            lineHeight: 1.5,
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}
