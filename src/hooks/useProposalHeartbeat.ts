import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const FIRST_HEARTBEAT_DELAY = 5_000; // 5 seconds — capture short visits

/**
 * Tracks how long a user views a proposal by sending periodic heartbeats.
 * Uses visibilitychange to pause/resume and keepalive fetch for final ping.
 */
export function useProposalHeartbeat(proposalId: string | undefined, viewId: string | undefined) {
  const activeTimeRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const isVisibleRef = useRef(true);
  const firstSentRef = useRef(false);

  const sendHeartbeat = useCallback(async (useKeepalive = false) => {
    if (!proposalId || !viewId) return;
    
    const now = Date.now();
    if (isVisibleRef.current && lastTickRef.current > 0) {
      activeTimeRef.current += (now - lastTickRef.current) / 1000;
    }
    lastTickRef.current = now;

    const durationSeconds = Math.round(activeTimeRef.current);
    if (durationSeconds <= 0) return;

    const body = {
      action: 'heartbeat',
      proposalId,
      viewId,
      durationSeconds,
    };

    if (useKeepalive) {
      // keepalive fetch survives page close, unlike sendBeacon it allows custom headers
      try {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/public-proposal`;
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Silent fail
      }
      return;
    }

    try {
      await supabase.functions.invoke('public-proposal', { body });
    } catch {
      // Silent fail — non-critical
    }
  }, [proposalId, viewId]);

  useEffect(() => {
    if (!proposalId || !viewId) return;

    lastTickRef.current = Date.now();
    activeTimeRef.current = 0;
    firstSentRef.current = false;

    // Send first heartbeat after 5s to capture short visits
    const firstTimeout = setTimeout(() => {
      firstSentRef.current = true;
      sendHeartbeat();
    }, FIRST_HEARTBEAT_DELAY);

    // Then every 30s
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    const handleVisibility = () => {
      const now = Date.now();
      if (document.hidden) {
        if (isVisibleRef.current && lastTickRef.current > 0) {
          activeTimeRef.current += (now - lastTickRef.current) / 1000;
        }
        isVisibleRef.current = false;
        sendHeartbeat();
      } else {
        isVisibleRef.current = true;
        lastTickRef.current = now;
      }
    };

    const handleBeforeUnload = () => {
      const now = Date.now();
      if (isVisibleRef.current && lastTickRef.current > 0) {
        activeTimeRef.current += (now - lastTickRef.current) / 1000;
      }
      const durationSeconds = Math.round(activeTimeRef.current);
      if (durationSeconds > 0) {
        sendHeartbeat(true); // use keepalive fetch
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(firstTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      sendHeartbeat(); // final heartbeat on unmount
    };
  }, [proposalId, viewId, sendHeartbeat]);
}
