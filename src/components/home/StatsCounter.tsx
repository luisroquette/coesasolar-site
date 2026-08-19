import { useEffect, useState, useRef } from "react";
import { useInView } from "framer-motion";

interface StatsCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}

export function StatsCounter({ value, suffix = "", prefix = "", duration = 2000 }: StatsCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (isInView && !hasAnimated.current) {
      hasAnimated.current = true;
      const steps = 60;
      const increment = value / steps;
      const stepDuration = duration / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= value) {
          setCount(value);
          clearInterval(timer);
        } else {
          setCount(Math.floor(current));
        }
      }, stepDuration);

      return () => clearInterval(timer);
    }
  }, [isInView, value, duration]);

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return num.toLocaleString("pt-BR");
    }
    return num.toString();
  };

  return (
    <span ref={ref} className="text-3xl lg:text-4xl font-bold text-coesa-yellow">
      {prefix}{formatNumber(count)}{suffix}
    </span>
  );
}
