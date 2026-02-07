# Stage B: Nice-to-Have Enhancements

**Status**: Low Priority - Production Ready Without These
**Source**: Code Review aa2c024 (2026-02-07)
**Estimated Effort**: 2-3 hours total

---

## 1. Enhanced YAML Validation

**Priority**: Low
**Effort**: 30 minutes
**Impact**: Catch configuration errors at startup rather than runtime

**Location**: `server/engine/activity-router.ts`, lines 90-115

**Current**:
```typescript
if (!parsed || typeof parsed !== "object" || !parsed.models) {
  throw new Error("Invalid YAML structure")
}
```

**Suggested Enhancement**:
```typescript
// Validate structure
if (!parsed || typeof parsed !== "object" || !parsed.models) {
  throw new Error("Invalid YAML structure: missing 'models' key")
}

// Validate each model has required fields
for (const [name, model] of Object.entries(parsed.models)) {
  const required = ['id', 'provider', 'model_id', 'suitable_for', 'cost_per_1k_tokens']
  for (const field of required) {
    if (model[field] === undefined) {
      throw new Error(`Model '${name}' missing required field: ${field}`)
    }
  }
}
```

**Benefit**: Clearer error messages when models.yaml is malformed

---

## 2. Additional Risk Patterns

**Priority**: Low
**Effort**: 1 hour
**Impact**: Reduce false negatives in risk detection by 5-10%

**Location**: `server/engine/classification-helpers.ts`

### 2.1 Irreversible Actions (lines 76-96)

**Add 4 patterns**:
```typescript
const irreversibleKeywords = [
  // Current 13 patterns...
  "npm unpublish",           // Package registry
  "docker system prune",     // Container cleanup
  "kubectl delete namespace", // Kubernetes
  "terraform destroy",       // Infrastructure
]
```

### 2.2 High-Stakes Actions (lines 117-134)

**Add 4 patterns**:
```typescript
const highStakesKeywords = [
  // Current 12 patterns...
  "rollback",     // Production issue indicator
  "hotfix",       // Emergency change
  "critical",     // Severity marker
  "user data",    // Privacy concern
]
```

### 2.3 Knowledge Gaps (lines 155-169)

**Add 3 patterns**:
```typescript
const uncertaintyMarkers = [
  // Current 10 patterns...
  "should i",         // Seeking guidance
  "is it safe",       // Uncertainty about risk
  "what happens if",  // Exploring outcomes
]
```

**Benefit**: Better coverage of modern DevOps workflows and security scenarios

---

## 3. Environment Variable Model Override

**Priority**: Very Low
**Effort**: 20 minutes
**Impact**: Enable A/B testing and debugging without code changes

**Location**: `server/engine/activity-router.ts`, lines 198-213

**Suggested Enhancement**:
```typescript
selectModel(level: ActivityLevel): ModelSpec {
  const config = loadModelsConfig()

  // Check for environment override
  const override = process.env[`GALATEA_MODEL_LEVEL_${level}`]
  if (override && config.models[override]) {
    console.log(`[ActivityRouter] Using override model for Level ${level}: ${override}`)
    return config.models[override]
  }

  // Existing logic...
}
```

**Usage Examples**:
```bash
# Force Level 1 to use Sonnet (test cost impact)
GALATEA_MODEL_LEVEL_1=sonnet npm start

# Force all levels to use Haiku (minimize cost in dev)
GALATEA_MODEL_LEVEL_2=haiku GALATEA_MODEL_LEVEL_3=haiku npm start
```

**Benefit**: A/B testing, cost debugging, local development optimization

---

## 4. Inline Pattern Explanations

**Priority**: Very Low
**Effort**: 30 minutes
**Impact**: Help future maintainers understand pattern choices

**Location**: `server/engine/classification-helpers.ts`

**Current**:
```typescript
const irreversibleKeywords = [
  "force push",
  "drop table",
  "rm -rf",
  // ...
]
```

**Suggested**:
```typescript
const irreversibleKeywords = [
  "force push",      // Git: Can't recover without reflog access
  "drop table",      // SQL: Permanent data loss (no transaction rollback)
  "rm -rf",          // Filesystem: Recursive deletion (no trash)
  "delete production", // Ops: High-stakes data loss
  "hard reset",      // Git: Rewrites history (dangerous on shared branches)
  // ...
]
```

**Benefit**: Faster onboarding for new developers, clearer intent

---

## 5. Edge Case Tests

**Priority**: Low
**Effort**: 30 minutes
**Impact**: Increase confidence in robustness

**Location**: New tests in `server/engine/__tests__/activity-router.unit.test.ts`

### 5.1 Empty Message
```typescript
it("handles empty message string", async () => {
  const router = createActivityRouter()
  const task = createMockTask("")
  const result = await router.classify(task, null, null)
  expect(result.level).toBe(2) // Default to Level 2
})
```

### 5.2 Unicode/Emoji Support
```typescript
it("detects high-stakes with emojis in message", async () => {
  const router = createActivityRouter()
  const task = createMockTask("🚀 deploy to production 🔥")
  const result = await router.classify(task, null, null)
  // Should still detect "deploy" and "production"
  expect(result.level).toBeGreaterThanOrEqual(2)
})
```

### 5.3 Long Message Performance
```typescript
it("classifies long messages efficiently", async () => {
  const router = createActivityRouter()
  const longMessage = "a".repeat(10000) + " deploy to production"
  const task = createMockTask(longMessage)

  const start = Date.now()
  await router.classify(task, null, null)
  const duration = Date.now() - start

  expect(duration).toBeLessThan(5) // Should be < 5ms
})
```

**Benefit**: Validate robustness under edge conditions

---

## When to Implement

### Never (Not Worth It)
- None - all suggestions have some value

### Phase 4 (Minor Enhancements)
- #2: Additional risk patterns (as production usage reveals gaps)
- #4: Inline pattern explanations (during refactoring pass)
- #5: Edge case tests (during test suite expansion)

### Phase 5+ (If Needed)
- #1: Enhanced YAML validation (if config errors become common)
- #3: Environment variable override (if A/B testing becomes critical)

---

## Summary

All 5 enhancements are **nice-to-have** quality improvements. Stage B is **production-ready** without any of them.

**Recommended Action**: Defer all enhancements to Phase 4+. Focus on completing Stage C-H first.
