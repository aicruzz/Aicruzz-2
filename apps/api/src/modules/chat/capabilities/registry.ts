// ─── CAPABILITY REGISTRY ──────────────────────────────────────
// A simple in-memory registry. Capabilities register at module load; the engine
// looks them up by id. This is the seam that makes adding future capabilities
// trivial — register a Capability and you're done.

import type { Capability, CapabilityId } from "./types";

const registry = new Map<CapabilityId, Capability>();

export function registerCapability(cap: Capability): void {
  registry.set(cap.id, cap);
}

export function getCapability(id: CapabilityId): Capability | undefined {
  return registry.get(id);
}

export function listCapabilities(): Capability[] {
  return [...registry.values()].sort((a, b) => b.priority - a.priority);
}

export function isCapabilityAvailable(id: CapabilityId): boolean {
  return registry.get(id)?.availability === "available";
}
