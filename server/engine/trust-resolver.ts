import type { TrustLevel } from "./types"

type SpecTrustLevel = "full" | "high" | "medium" | "none"

interface TrustConfig {
  identities: Array<{ entity: string; level: SpecTrustLevel }>
  channels: Record<string, SpecTrustLevel>
  default_identity_trust: SpecTrustLevel
}

const TRUST_ORDER: TrustLevel[] = ["NONE", "LOW", "MEDIUM", "HIGH", "ABSOLUTE"]

const SPEC_TO_ENGINE: Record<SpecTrustLevel, TrustLevel> = {
  full: "ABSOLUTE",
  high: "HIGH",
  medium: "MEDIUM",
  none: "NONE",
}

function mapSpecLevel(level: SpecTrustLevel): TrustLevel {
  return SPEC_TO_ENGINE[level] ?? "NONE"
}

function trustMin(a: TrustLevel, b: TrustLevel): TrustLevel {
  const ai = TRUST_ORDER.indexOf(a)
  const bi = TRUST_ORDER.indexOf(b)
  if (ai === -1 || bi === -1) return "NONE"
  return TRUST_ORDER[Math.min(ai, bi)]
}

export function resolveTrust(
  trust: TrustConfig,
  channel: string,
  identity: string,
): TrustLevel {
  const identityEntry = trust.identities.find((i) => i.entity === identity)
  const identityLevel = mapSpecLevel(
    identityEntry?.level ?? trust.default_identity_trust,
  )

  const channelLevel = mapSpecLevel(trust.channels[channel] ?? "none")

  return trustMin(identityLevel, channelLevel)
}
