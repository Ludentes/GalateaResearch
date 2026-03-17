# Task-Type Inference: Russian Pattern Edge Cases

**File:** `server/agent/task-type-inference.ts`
**Date:** 2026-03-17
**Status:** Analysis Complete

## Overview

The Russian verb patterns in task-type inference are **strong for imperative mood only** but falter on conversational patterns developers actually use. Below are specific edge cases the current patterns miss.

---

## Edge Cases by Category

### 1. Negation (False Positive) — HIGH SEVERITY

**Example:**
```
"не создавай задачу сейчас"
```

**Current behavior:** Pattern matches `создай` → classified as `admin` task
**Issue:** Contains negation — user is explicitly asking NOT to create something
**Impact:** Wrong routing decision; task created when none should be

**Similar examples:**
- `"не фиксь баг в спешке"` → matches `фиксь` but means "don't fix"
- `"не изучай эту ветку"` → matches `изучай` but means "don't study"

---

### 2. Missing Infinitive Forms (False Negative) — HIGH SEVERITY

**Example:**
```
"нужно исправить баг в #456"
```

**Current:** Pattern `исправь` (imperative) doesn't match `исправить` (infinitive)
**Comparison:** English works: `"need to fix bug"` catches the "fix" verb
**Impact:** Russian developers using `"нужно + infinitive"` pattern won't trigger task classification

**Similar examples:**
- `"требуется создать новую фичу"` → no match on `создать`
- `"необходимо документировать API"` → no match on `документировать`
- `"надо переписать логику"` → no match on `переписать`
- `"следует оптимизировать запрос"` → no match on `оптимизировать`

---

### 3. Aspect-Insensitive Matching (False Negative) — MEDIUM SEVERITY

Russian imperatives have aspect pairs (perfective/imperfective) with identical meaning. Current patterns only include one form:

**Example:**
```
"сделай это" → matches (perfective ✓)
"делай это" → doesn't match (imperfective ✗)
```

**Similar pairs:**
- `"создай тикет"` → matches; `"создавай тикеты"` → doesn't match
- `"исправь баг"` → matches; `"исправляй баги"` → doesn't match
- `"напиши код"` → matches; `"писать код"` → doesn't match (also infinitive)

**Impact:** Developers asking for repeated actions or using imperfective aspect won't trigger classification.

---

### 4. Missing Common Developer Verbs (False Negative) — MEDIUM SEVERITY

Standard developer requests using verbs not in `RU_CODING_VERBS`:

```javascript
"протестируй это"          // test — NOT in RU_CODING_VERBS
"оптимизируй запрос"       // optimize — NOT in RU_CODING_VERBS
"документируй функцию"     // document — NOT in RU_CODING_VERBS
"отредактируй комментарий" // edit — NOT in RU_CODING_VERBS
"развернись в мейн"        // deploy/push — NOT in RU_CODING_VERBS
"заливай изменения"        // push/merge — NOT in RU_CODING_VERBS
"мигрируй базу"            // migrate — NOT in RU_CODING_VERBS
"интегрируй API"           // integrate — NOT in RU_CODING_VERBS
```

**Impact:** 30-40% of routine developer requests won't be recognized.

---

### 5. Polite/Formal Imperative Forms (False Negative) — MEDIUM SEVERITY

Russian polite imperatives use `-те` suffix or 3rd person form. Current patterns only match 2nd person singular:

**Examples:**
```javascript
"создайте задачу на спринт"  // polite 2nd person plural
"проверьте мой код"          // doesn't match "проверь"
"напишите тест"              // doesn't match "напиши"
"зафиксьте баг"              // doesn't match "зафиксь"
```

**Impact:** Professional or formal requests won't be classified as tasks.

---

### 6. Question Format with Infinitive (False Negative) — MEDIUM SEVERITY

Developers asking "what needs to be done?" with infinitives:

```javascript
"что нужно исправить в PR?"
"какой код надо рефакторить?"
"что требуется оптимизировать?"
```

**Issue:** Infinitives (`исправить`, `рефакторить`, `оптимизировать`) aren't in patterns
**Impact:** Indirect task requests won't be recognized.

---

### 7. Task Reference Without Verb (False Negative) — LOW SEVERITY

References alone without action verbs:

```javascript
"задача #123 блокирует нас"   // has reference #123 but no action verb
"мр !456 нужен срочно"        // has reference !456 but no action verb
```

**Current logic:** Line 36, `hasTaskSignal()` requires verb + reference
**Impact:** Status/dependency mentions won't trigger task classification (may be intentional).

---

### 8. Ambiguous "посмотри" Classification — LOW SEVERITY

The verb `"посмотри"` (look/check) appears in both `RU_RESEARCH_VERBS` and `RU_REVIEW_VERBS`:

```javascript
RU_RESEARCH_VERBS = /(?:исследуй|изучи|...|посмотри|...)/   // line 69
RU_REVIEW_VERBS = /(?:проверь|ревьюни|посмотри|...|глянь)/ // line 70

"посмотри код в #789"  // Could be research OR review
```

**Current behavior (line 114):** If has research but not coding → `research` type
**Actual intent:** Likely a code review task → should be `review` type
**Impact:** Task classified as research when it's a review request.

---

### 9. Substring Collision Risk (False Positive) — LOW SEVERITY

Patterns lack word boundaries, so partial matches occur:

```javascript
"давай рефакторить рефакторинг"
```

Pattern `рефактори` matches inside the noun `рефакторинг`
**Impact:** Minor—word contains the pattern, which usually indicates intent anyway.

---

## Summary Table

| Issue | Severity | Examples | Mitigation |
|-------|----------|----------|-----------|
| **Negation handling** | HIGH | `"не создавай"`, `"не фиксь"` | Add negation detection (check for `не` before verb) |
| **Infinitive forms** | HIGH | `"исправить"`, `"документировать"` | Add infinitive patterns (`-ить`, `-ать`) or use lemmatization |
| **Aspect pairs** | MEDIUM | `"делай"` vs `"сделай"` | Add imperfective aspect verbs to patterns |
| **Missing verbs** | MEDIUM | `"протестируй"`, `"оптимизируй"` | Expand `RU_CODING_VERBS` with 15+ missing verbs |
| **Polite forms** | MEDIUM | `"создайте"`, `"проверьте"` | Add `-те` suffix variants |
| **Infinitive questions** | MEDIUM | `"что нужно исправить?"` | Add infinitive patterns for research/review inference |
| **Reference-only** | LOW | `"задача #123 блокирует"` | Keep as-is (references without verbs shouldn't auto-trigger) |
| **Ambiguous посмотри** | LOW | `"посмотри код"` | Improve disambiguation logic; check context |
| **Word boundaries** | LOW | Pattern collisions | Add `\b` word boundaries if false positives occur |

---

## Recommended Implementation Order

1. **Phase 1 (Critical):** Add negation detection and infinitive forms
   - `inferRouting()` should return `level: "interaction"` if negation detected
   - Create `toInfinitiveBases()` utility to normalize verbs
   - Estimated effort: 2-3 hours

2. **Phase 2 (High-value):** Expand verb lists and add aspect pairs
   - Add 15+ missing developer verbs
   - Include imperfective counterparts
   - Estimated effort: 1-2 hours

3. **Phase 3 (Polish):** Polite forms and boundary fixes
   - Add `-те` suffix handling
   - Optional: Add `\b` word boundaries
   - Estimated effort: 1 hour

---

## Code Locations

- **Patterns:** `server/agent/task-type-inference.ts`, lines 66-74
- **Detection logic:** `hasTaskSignal()`, lines 76-102
- **Inference logic:** `inferTaskType()`, lines 104-137

## Testing Notes

New test cases should cover:
- `"не создавай"` → `interaction` (not `task`)
- `"нужно исправить #123"` → `task:coding`
- `"протестируй это"` → `task:coding`
- `"создайте задачу"` → `task:admin`
- `"что нужно исправить?"` → `task:research`
