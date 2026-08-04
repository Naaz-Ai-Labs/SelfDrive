"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({
  target,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1800,
}: {
  target: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          let startTime: number | null = null;

          const animate = (now: number) => {
            if (!startTime) startTime = now;
            const progress = Math.min((now - startTime) / duration, 1);
            // Smooth easeOutCubic curve
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentVal = easeProgress * target;
            setCount(currentVal);

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setCount(target);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);

    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toFixed(decimals)}
      {suffix}
    </span>
  );
}
