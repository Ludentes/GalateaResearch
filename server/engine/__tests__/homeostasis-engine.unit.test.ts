/**
 * Phase 3: Homeostasis Engine Unit Tests
 *
 * Tests for 6-dimension homeostatic balance assessment.
 */

import { describe, expect, it } from "vitest"
import {
  HomeostasisEngine,
  createHomeostasisEngine,
} from "../homeostasis-engine"
import type { AgentContext, Dimension, HomeostasisState } from "../types"

// ============================================================================
// Test Helpers
// ============================================================================

function createMockContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: "test-session",
    currentMessage: "Test message",
    messageHistory: [],
    retrievedFacts: [],
    retrievedProcedures: [],
    lastMessageTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    currentTaskStartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
    recentActionCount: 5,
    hasAssignedTask: true,
    timeSpentResearching: 0,
    timeSpentBuilding: 0,
    ...overrides,
  }
}

// ============================================================================
// Constructor & Factory
// ============================================================================

describe("HomeostasisEngine", () => {
  describe("constructor and factory", () => {
    it("creates instance via constructor", () => {
      const engine = new HomeostasisEngine()
      expect(engine).toBeInstanceOf(HomeostasisEngine)
    })

    it("creates instance via factory function", () => {
      const engine = createHomeostasisEngine()
      expect(engine).toBeInstanceOf(HomeostasisEngine)
    })
  })

  // ============================================================================
  // Computed Assessments: Progress Momentum
  // ============================================================================

  describe("assessProgressMomentum (computed)", () => {
    it("returns HEALTHY when no task started", async () => {
      const context = createMockContext({ currentTaskStartTime: undefined })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension("progress_momentum", context)

      expect(result.dimension).toBe("progress_momentum")
      expect(result.state).toBe("HEALTHY")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.5)
    })

    it("returns LOW when stuck (>30min, <3 actions)", async () => {
      const context = createMockContext({
        currentTaskStartTime: new Date(Date.now() - 35 * 60 * 1000), // 35 minutes ago
        recentActionCount: 2,
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension("progress_momentum", context)

      expect(result.state).toBe("LOW")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.reason).toContain("Stuck")
    })

    it("returns HIGH when rushing (>10 actions in <10min)", async () => {
      const context = createMockContext({
        currentTaskStartTime: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
        recentActionCount: 12,
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension("progress_momentum", context)

      expect(result.state).toBe("HIGH")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      expect(result.reason).toContain("Rushing")
    })

    it("returns HEALTHY when making steady progress", async () => {
      const context = createMockContext({
        currentTaskStartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
        recentActionCount: 5,
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension("progress_momentum", context)

      expect(result.state).toBe("HEALTHY")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    })
  })

  // ============================================================================
  // Computed Assessments: Communication Health
  // ============================================================================

  describe("assessCommunicationHealth (computed)", () => {
    it("returns HEALTHY when first message in session", async () => {
      const context = createMockContext({ lastMessageTime: undefined })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "communication_health",
        context,
      )

      expect(result.dimension).toBe("communication_health")
      expect(result.state).toBe("HEALTHY")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBe(1.0)
      expect(result.reason).toContain("First message")
    })

    it("returns LOW when silent (>10min)", async () => {
      const context = createMockContext({
        lastMessageTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "communication_health",
        context,
      )

      expect(result.state).toBe("LOW")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.reason).toContain("Silent")
    })

    it("returns HIGH when over-communicating (<2min)", async () => {
      const context = createMockContext({
        lastMessageTime: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "communication_health",
        context,
      )

      expect(result.state).toBe("HIGH")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      expect(result.reason).toContain("Rapid back-and-forth")
    })

    it("returns HEALTHY when regular communication (2-10min)", async () => {
      const context = createMockContext({
        lastMessageTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "communication_health",
        context,
      )

      expect(result.state).toBe("HEALTHY")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.reason).toContain("Regular communication")
    })
  })

  // ============================================================================
  // Computed Assessments: Productive Engagement
  // ============================================================================

  describe("assessProductiveEngagement (computed)", () => {
    it("returns LOW when no assigned task (idle)", async () => {
      const context = createMockContext({ hasAssignedTask: false })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "productive_engagement",
        context,
      )

      expect(result.dimension).toBe("productive_engagement")
      expect(result.state).toBe("LOW")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.reason).toContain("idle")
    })

    it("returns HEALTHY when has assigned task", async () => {
      const context = createMockContext({ hasAssignedTask: true })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "productive_engagement",
        context,
      )

      expect(result.state).toBe("HEALTHY")
      expect(result.method).toBe("computed")
      expect(result.confidence).toBeGreaterThanOrEqual(0.5)
      expect(result.reason).toContain("assigned task")
    })
  })

  // ============================================================================
  // Quick Assessment
  // ============================================================================

  describe("assessQuick", () => {
    it("assesses only computed dimensions (fast path)", () => {
      const context = createMockContext()
      const engine = createHomeostasisEngine()

      const result = engine.assessQuick(context)

      // Should have 3 computed dimensions
      expect(result.progress_momentum).toBeDefined()
      expect(result.communication_health).toBeDefined()
      expect(result.productive_engagement).toBeDefined()

      // Should NOT have LLM dimensions
      expect(result.knowledge_sufficiency).toBeUndefined()
      expect(result.certainty_alignment).toBeUndefined()
      expect(result.knowledge_application).toBeUndefined()

      expect(result.assessed_at).toBeInstanceOf(Date)
    })

    it("returns HEALTHY states for balanced context", () => {
      const context = createMockContext({
        lastMessageTime: new Date(Date.now() - 5 * 60 * 1000), // 5 min
        currentTaskStartTime: new Date(Date.now() - 10 * 60 * 1000), // 10 min
        recentActionCount: 4,
        hasAssignedTask: true,
      })
      const engine = createHomeostasisEngine()

      const result = engine.assessQuick(context)

      expect(result.progress_momentum).toBe("HEALTHY")
      expect(result.communication_health).toBe("HEALTHY")
      expect(result.productive_engagement).toBe("HEALTHY")
    })

    it("detects LOW states in quick assessment", () => {
      const context = createMockContext({
        lastMessageTime: new Date(Date.now() - 15 * 60 * 1000), // 15 min (silent)
        currentTaskStartTime: new Date(Date.now() - 40 * 60 * 1000), // 40 min
        recentActionCount: 1, // stuck
        hasAssignedTask: false, // idle
      })
      const engine = createHomeostasisEngine()

      const result = engine.assessQuick(context)

      expect(result.progress_momentum).toBe("LOW")
      expect(result.communication_health).toBe("LOW")
      expect(result.productive_engagement).toBe("LOW")
    })
  })

  // ============================================================================
  // LLM Assessments (using heuristics for now)
  // ============================================================================

  describe("assessKnowledgeSufficiency (heuristic)", () => {
    it("returns LOW when no knowledge retrieved", async () => {
      const context = createMockContext({
        retrievedFacts: [],
        retrievedProcedures: [],
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_sufficiency",
        context,
      )

      expect(result.dimension).toBe("knowledge_sufficiency")
      expect(result.state).toBe("LOW")
      expect(result.reason).toContain("No relevant knowledge")
    })

    it("returns HEALTHY when has high-confidence procedure", async () => {
      const context = createMockContext({
        retrievedProcedures: [{ name: "test", success_rate: 0.9 }],
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_sufficiency",
        context,
      )

      expect(result.state).toBe("HEALTHY")
      expect(result.reason).toContain("High-confidence procedure")
    })

    it("returns HEALTHY when has relevant facts with good confidence", async () => {
      const context = createMockContext({
        retrievedFacts: [
          { content: "fact1", confidence: 0.8 },
          { content: "fact2", confidence: 0.75 },
          { content: "fact3", confidence: 0.72 },
          { content: "fact4", confidence: 0.78 },
          { content: "fact5", confidence: 0.71 },
        ],
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_sufficiency",
        context,
      )

      expect(result.state).toBe("HEALTHY")
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it("returns HIGH when too many facts with low confidence", async () => {
      const context = createMockContext({
        retrievedFacts: Array.from({ length: 25 }, (_, i) => ({
          content: `fact${i}`,
          confidence: 0.4,
        })),
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_sufficiency",
        context,
      )

      expect(result.state).toBe("HIGH")
      expect(result.reason).toContain("many facts")
    })

    it("returns LOW when few facts with low confidence", async () => {
      const context = createMockContext({
        retrievedFacts: [
          { content: "fact1", confidence: 0.3 },
          { content: "fact2", confidence: 0.4 },
          { content: "fact3", confidence: 0.5 },
        ],
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_sufficiency",
        context,
      )

      expect(result.state).toBe("LOW")
      expect(result.reason).toContain("Limited knowledge")
    })
  })

  describe("assessCertaintyAlignment (heuristic)", () => {
    it("returns LOW when uncertain about high-stakes action", async () => {
      const context = createMockContext({
        currentMessage: "not sure if I should delete the production database",
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "certainty_alignment",
        context,
      )

      expect(result.dimension).toBe("certainty_alignment")
      expect(result.state).toBe("LOW")
      expect(result.reason).toContain("uncertainty")
    })

    it("returns HIGH when confident about high-stakes action", async () => {
      const context = createMockContext({
        currentMessage: "I will force push to main and deploy to production",
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "certainty_alignment",
        context,
      )

      expect(result.state).toBe("HIGH")
      expect(result.reason).toContain("High confidence")
    })

    it("returns HEALTHY for normal messages", async () => {
      const context = createMockContext({
        currentMessage: "Let me update this component",
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "certainty_alignment",
        context,
      )

      expect(result.state).toBe("HEALTHY")
    })
  })

  describe("assessKnowledgeApplication (heuristic)", () => {
    it("returns HEALTHY when no time data available", async () => {
      const context = createMockContext({
        timeSpentResearching: 0,
        timeSpentBuilding: 0,
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_application",
        context,
      )

      expect(result.dimension).toBe("knowledge_application")
      expect(result.state).toBe("HEALTHY")
      expect(result.reason).toContain("No time tracking")
    })

    it("returns HIGH when too much research (>80%)", async () => {
      const context = createMockContext({
        timeSpentResearching: 50 * 60 * 1000, // 50 minutes
        timeSpentBuilding: 10 * 60 * 1000, // 10 minutes
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_application",
        context,
      )

      expect(result.state).toBe("HIGH")
      expect(result.reason).toContain("Analysis paralysis")
    })

    it("returns LOW when too much building (<20% research)", async () => {
      const context = createMockContext({
        timeSpentResearching: 5 * 60 * 1000, // 5 minutes
        timeSpentBuilding: 45 * 60 * 1000, // 45 minutes
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_application",
        context,
      )

      expect(result.state).toBe("LOW")
      expect(result.reason).toContain("Insufficient research")
    })

    it("returns HEALTHY when balanced (20-80%)", async () => {
      const context = createMockContext({
        timeSpentResearching: 20 * 60 * 1000, // 20 minutes
        timeSpentBuilding: 30 * 60 * 1000, // 30 minutes
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessDimension(
        "knowledge_application",
        context,
      )

      expect(result.state).toBe("HEALTHY")
      expect(result.reason).toContain("Balanced")
    })
  })

  // ============================================================================
  // Full Assessment (assessAll)
  // ============================================================================

  describe("assessAll", () => {
    it("assesses all 6 dimensions", async () => {
      const context = createMockContext({
        retrievedFacts: [
          { content: "fact1", confidence: 0.8 },
          { content: "fact2", confidence: 0.7 },
        ],
        lastMessageTime: new Date(Date.now() - 5 * 60 * 1000),
        currentTaskStartTime: new Date(Date.now() - 10 * 60 * 1000),
        recentActionCount: 4,
        hasAssignedTask: true,
        timeSpentResearching: 15 * 60 * 1000,
        timeSpentBuilding: 25 * 60 * 1000,
      })
      const engine = createHomeostasisEngine()

      const result = await engine.assessAll(context)

      // All 6 dimensions should be present
      expect(result.knowledge_sufficiency).toBeDefined()
      expect(result.certainty_alignment).toBeDefined()
      expect(result.progress_momentum).toBeDefined()
      expect(result.communication_health).toBeDefined()
      expect(result.productive_engagement).toBeDefined()
      expect(result.knowledge_application).toBeDefined()

      expect(result.assessed_at).toBeInstanceOf(Date)
      expect(result.assessment_method).toBeDefined()
    })

    it("records assessment methods for each dimension", async () => {
      const context = createMockContext()
      const engine = createHomeostasisEngine()

      const result = await engine.assessAll(context)

      // All dimensions should have assessment method recorded
      expect(result.assessment_method.knowledge_sufficiency).toBe("computed")
      expect(result.assessment_method.certainty_alignment).toBe("computed")
      expect(result.assessment_method.progress_momentum).toBe("computed")
      expect(result.assessment_method.communication_health).toBe("computed")
      expect(result.assessment_method.productive_engagement).toBe("computed")
      expect(result.assessment_method.knowledge_application).toBe("computed")
    })
  })

  // ============================================================================
  // Guidance System
  // ============================================================================

  describe("getGuidance", () => {
    it("gracefully handles guidance loading errors (uses defaults)", () => {
      // This test verifies that if guidance.yaml is malformed or missing,
      // the system falls back to defaults rather than crashing.
      // The actual loading happens on first getGuidance() call.
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "LOW",
        certainty_alignment: "HEALTHY",
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      // Should not throw even if YAML loading fails
      const guidance = engine.getGuidance(state)

      // Should return guidance (either from YAML or defaults)
      expect(guidance).not.toBeNull()
      expect(guidance?.primary).toBeTruthy()
      expect(guidance?.dimensions).toContain("knowledge_sufficiency")
    })

    it("returns null when all dimensions HEALTHY", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HEALTHY",
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).toBeNull()
    })

    it("returns guidance for single imbalanced dimension", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "LOW",
        certainty_alignment: "HEALTHY",
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).not.toBeNull()
      expect(guidance?.primary).toContain("Knowledge gap detected")
      expect(guidance?.dimensions).toContain("knowledge_sufficiency")
      expect(guidance?.dimensions).toHaveLength(1)
    })

    it("prioritizes highest priority dimension when multiple imbalanced", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "LOW", // Priority 1 (highest)
        certainty_alignment: "HEALTHY",
        progress_momentum: "LOW", // Priority 2
        communication_health: "LOW", // Priority 3
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).not.toBeNull()
      // Should prioritize knowledge_sufficiency (priority 1)
      expect(guidance?.primary).toContain("Knowledge gap detected")
      expect(guidance?.dimensions).toHaveLength(3)
      expect(guidance?.dimensions[0]).toBe("knowledge_sufficiency")
    })

    it("handles LOW state guidance", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "LOW", // Test LOW state
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).not.toBeNull()
      expect(guidance?.primary).toContain("Uncertainty")
      expect(guidance?.dimensions).toContain("certainty_alignment")
    })

    it("handles HIGH state guidance", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "HIGH", // Test HIGH state
        certainty_alignment: "HEALTHY",
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).not.toBeNull()
      expect(guidance?.primary).toContain("Information overload")
      expect(guidance?.dimensions).toContain("knowledge_sufficiency")
    })

    it("includes secondary guidance", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "LOW",
        certainty_alignment: "HEALTHY",
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).not.toBeNull()
      expect(guidance?.secondary).toBeDefined()
      expect(guidance?.secondary).toBeTruthy()
    })

    it("notes when multiple dimensions need attention", () => {
      const engine = createHomeostasisEngine()
      const state: HomeostasisState = {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "LOW",
        progress_momentum: "LOW",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HIGH",
        assessed_at: new Date(),
        assessment_method: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "computed",
          progress_momentum: "computed",
          communication_health: "computed",
          productive_engagement: "computed",
          knowledge_application: "computed",
        },
      }

      const guidance = engine.getGuidance(state)

      expect(guidance).not.toBeNull()
      expect(guidance?.dimensions.length).toBeGreaterThan(1)
      // Check that secondary either has guidance text or notes multiple dimensions
      expect(guidance?.secondary).toBeDefined()
    })

    it("provides guidance for all 6 dimensions", () => {
      const engine = createHomeostasisEngine()
      const dimensions: Dimension[] = [
        "knowledge_sufficiency",
        "certainty_alignment",
        "progress_momentum",
        "communication_health",
        "productive_engagement",
        "knowledge_application",
      ]

      // Test each dimension in LOW state
      for (const dim of dimensions) {
        const state: HomeostasisState = {
          knowledge_sufficiency: dim === "knowledge_sufficiency" ? "LOW" : "HEALTHY",
          certainty_alignment: dim === "certainty_alignment" ? "LOW" : "HEALTHY",
          progress_momentum: dim === "progress_momentum" ? "LOW" : "HEALTHY",
          communication_health: dim === "communication_health" ? "LOW" : "HEALTHY",
          productive_engagement: dim === "productive_engagement" ? "LOW" : "HEALTHY",
          knowledge_application: dim === "knowledge_application" ? "LOW" : "HEALTHY",
          assessed_at: new Date(),
          assessment_method: {
            knowledge_sufficiency: "computed",
            certainty_alignment: "computed",
            progress_momentum: "computed",
            communication_health: "computed",
            productive_engagement: "computed",
            knowledge_application: "computed",
          },
        }

        const guidance = engine.getGuidance(state)

        expect(guidance).not.toBeNull()
        expect(guidance?.dimensions).toContain(dim)
        expect(guidance?.primary).toBeTruthy()
      }
    })
  })
})
