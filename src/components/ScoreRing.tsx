"use client";

import { useEffect, useRef } from "react";

interface Props {
  score: number;
  size?: number;
}

function scoreColor(score: number): string {
  if (score >= 90) return "var(--good)";
  if (score >= 50) return "var(--needs)";
  return "var(--poor)";
}

export default function ScoreRing({ score, size = 120 }: Props) {
  const circleRef = useRef<SVGCircleElement>(null);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const color = scoreColor(score);

  useEffect(() => {
    if (!circleRef.current) return;
    const offset = circumference - (score / 100) * circumference;
    circleRef.current.style.transition = "stroke-dashoffset 1s ease-out";
    circleRef.current.style.strokeDashoffset = String(offset);
  }, [score, circumference]);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Performance score: ${score}`}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle
        ref={circleRef}
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="46" textAnchor="middle" fontSize="22" fontWeight="600" fill={color}>
        {score}
      </text>
      <text x="50" y="60" textAnchor="middle" fontSize="9" fill="var(--text-2)">
        / 100
      </text>
    </svg>
  );
}
