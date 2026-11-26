import { useEffect, useState } from 'react';

/**
 * Lightweight live clock hook so relative timestamps ("Gerade eben", "vor 20 Sek.")
 * advance automatically without reloading the page.
 */
export function useNowTick(intervalMs = 10000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
