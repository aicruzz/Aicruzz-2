import axios from 'axios';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const API_SECRET = process.env.API_SECRET ?? '';

const CREDITS_PER_SECOND = 0.2;
const BILLING_INTERVAL_MS = 1000;

interface BillingSession {
  sessionId: string;
  userId: string;
  interval: NodeJS.Timeout;
  secondsElapsed: number;
  totalCreditsUsed: number;
  onInsufficientCredits: () => void;
}

const activeSessions = new Map<string, BillingSession>();

/**
 * Start per-second billing for a live cam session.
 * Calls /api/live-cam/billing-tick every second.
 * Calls onInsufficientCredits() if the user runs out of credits.
 */
export function startBilling(
  sessionId: string,
  userId: string,
  onInsufficientCredits: () => void,
): void {
  if (activeSessions.has(sessionId)) return;

  const interval = setInterval(async () => {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    try {
      const res = await axios.post(
        `${API_URL}/api/live-cam/billing-tick`,
        { sessionId, userId, credits: CREDITS_PER_SECOND },
        {
          headers: { 'x-webrtc-secret': API_SECRET },
          timeout: 3000,
        },
      );

      const data = res.data as {
        sufficient: boolean;
        creditsRemaining: number;
        creditsDeducted?: number;
        sessionActive?: boolean;
        duplicate?: boolean;
      };

      // Duplicate ticks: the API's per-session lock rejected this call because
      // another tick is mid-flight for the same session. Skip accumulation —
      // the winning tick already counted this second.
      if (data.duplicate === true) {
        return;
      }

      // Cooperative stop signal: either credits ran out (sufficient=false) or
      // the session was ended elsewhere (sessionActive=false, e.g. via
      // /session-end, admin force-stop, or parallel-tab end). Both cases mean
      // we must clear the interval and tear down — otherwise the proxy keeps
      // gating on a participant the API considers dead.
      if (data.sufficient === false || data.sessionActive === false) {
        const reason =
          data.sufficient === false ? 'insufficient credits' : 'session ended';
        console.warn(
          `[Billing] Stopping session ${sessionId} for user ${userId} (${reason})`,
        );
        stopBilling(sessionId);
        onInsufficientCredits();
        return;
      }

      session.secondsElapsed += 1;
      session.totalCreditsUsed += CREDITS_PER_SECOND;
    } catch (err) {
      // Log but don't stop session on transient API errors
      console.error(`[Billing] Tick failed for session ${sessionId}:`, err);
    }
  }, BILLING_INTERVAL_MS);

  activeSessions.set(sessionId, {
    sessionId,
    userId,
    interval,
    secondsElapsed: 0,
    totalCreditsUsed: 0,
    onInsufficientCredits,
  });

  console.log(`[Billing] Started for session ${sessionId}, user ${userId}`);
}

export function stopBilling(sessionId: string): {
  secondsElapsed: number;
  totalCreditsUsed: number;
} | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  clearInterval(session.interval);
  activeSessions.delete(sessionId);

  console.log(
    `[Billing] Stopped session ${sessionId}: ${session.secondsElapsed}s, ${session.totalCreditsUsed.toFixed(2)} credits`,
  );

  // Notify API that session ended
  axios
    .post(
      `${API_URL}/api/live-cam/session-end`,
      {
        sessionId,
        userId: session.userId,
        totalSeconds: session.secondsElapsed,
        totalCredits: session.totalCreditsUsed,
      },
      {
        headers: { 'x-webrtc-secret': API_SECRET },
        timeout: 5000,
      },
    )
    .catch((err) =>
      console.error(`[Billing] Failed to notify session end:`, err),
    );

  return {
    secondsElapsed: session.secondsElapsed,
    totalCreditsUsed: session.totalCreditsUsed,
  };
}

export function getSessionStats(sessionId: string) {
  const s = activeSessions.get(sessionId);
  if (!s) return null;
  return {
    secondsElapsed: s.secondsElapsed,
    totalCreditsUsed: s.totalCreditsUsed,
  };
}
