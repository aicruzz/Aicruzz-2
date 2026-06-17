// ─── VIDEO EXECUTION LEDGER ───────────────────────────────────
//
// An internal accounting record of a job's credit lifecycle: reserved credits,
// provider attempts, actual cost and final settlement (finalize or release).
// It is a RECORDER — the actual credit movement stays in the proven Wallet APIs
// (deductCredits/refundCredits), which are untouched and backward compatible.
//
// The ledger is intentionally shaped so the wallet underneath can later be
// swapped for a true held-balance reservation system WITHOUT any change to
// Video Studio: the service only ever calls reserve→finalize/release semantics.

import type {
  VideoExecutionLedger,
  RecoveryDiagnostics,
} from "./video.types";

/** Open a reservation record (credits have been deducted up-front today). */
export function createLedger(
  reservedCredits: number,
  transactionId: string,
): VideoExecutionLedger {
  return {
    reservedCredits,
    reservedTransactionId: transactionId,
    attempts: [],
    finalCredits: null,
    refundedCredits: 0,
    settled: false,
    outcome: null,
  };
}

/** Provider failover history → ledger attempts (best-effort from diagnostics). */
export function attemptsFromDiagnostics(
  d: RecoveryDiagnostics | null | undefined,
): VideoExecutionLedger["attempts"] {
  if (!d) return [];
  const at = new Date().toISOString();
  const attempts: VideoExecutionLedger["attempts"] = [];
  if (d.selectedProvider) attempts.push({ provider: d.selectedProvider, ok: !d.providerSubstituted, at });
  if (d.fallbackProvider) attempts.push({ provider: d.fallbackProvider, ok: true, at });
  if (d.actualProviderUsed && !attempts.some((a) => a.provider === d.actualProviderUsed)) {
    attempts.push({ provider: d.actualProviderUsed, ok: true, at });
  }
  return attempts;
}

/**
 * Settle a successful job: record the final (actual) credits and any difference
 * refunded. Idempotent — once settled it is returned unchanged. Does NOT move
 * credits (the service performs the refund via the Wallet API and passes the
 * resulting numbers in here).
 */
export function finalizeLedger(
  ledger: VideoExecutionLedger | undefined,
  args: {
    finalCredits: number;
    refundedCredits: number;
    attempts?: VideoExecutionLedger["attempts"];
  },
): VideoExecutionLedger {
  const base = ledger ?? createLedger(args.finalCredits + args.refundedCredits, "");
  if (base.settled) return base;
  return {
    ...base,
    finalCredits: args.finalCredits,
    refundedCredits: (base.refundedCredits ?? 0) + args.refundedCredits,
    attempts: args.attempts?.length ? args.attempts : base.attempts,
    settled: true,
    outcome: "finalized",
  };
}

/**
 * Release a failed job's reservation: record the full refund. Idempotent. The
 * service performs the actual refund via the Wallet API.
 */
export function releaseLedger(
  ledger: VideoExecutionLedger | undefined,
  refundedCredits: number,
  attempts?: VideoExecutionLedger["attempts"],
): VideoExecutionLedger {
  const base = ledger ?? createLedger(refundedCredits, "");
  if (base.settled) return base;
  return {
    ...base,
    finalCredits: 0,
    refundedCredits: (base.refundedCredits ?? 0) + refundedCredits,
    attempts: attempts?.length ? attempts : base.attempts,
    settled: true,
    outcome: "released",
  };
}
