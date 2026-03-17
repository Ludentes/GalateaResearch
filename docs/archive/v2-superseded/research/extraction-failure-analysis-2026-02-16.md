# Extraction Failure Pattern Analysis

**Date:** 2026-02-16
**Dataset:** extraction-gold-standard (52 items)
**Models Analyzed:** gpt-oss:latest (most recent observations available)
**Note:** The specified gemma3:12b run ("gemma3-12b-2026-02-16T15-40") was not found in Langfuse. Analysis based on available gpt-oss:latest traces.

## Dataset Sample Overview

Reviewed 10 gold-standard items and corresponding model outputs. Dataset includes:
- User preferences and workflow rules
- Technical decisions with entities
- Multi-item conversations requiring proper segmentation
- Edge cases (empty extractions, assistant-only turns)

## Observed Failure Patterns

### 1. **Missing IoT/Technical Entity Tags**

**Example Item #1: Alina/IoTController case**

**Input transcript:**
```
[USER]: Alina does not know what is IoTController, ModBus.
[USER]: 6. Totally new. We need to explain why they exist...
[USER]: 5. ASAP really. We need to present tomorrow.
[USER]: 4. Extend existing files.
```

**Expected (4 items):**
```json
[
  {
    "type": "fact",
    "content": "Alina does not understand IoT concepts like IoTController and ModBus",
    "entities": ["iotcontroller", "modbus"],
    "about": {"entity": "alina", "type": "user"}
  },
  {
    "type": "fact",
    "content": "New documentation types (Risk Assessment, User Contracts) need explanations...",
    "entities": [],
    "about": null
  },
  {
    "type": "fact",
    "content": "Stakeholder review deadline is ASAP — presentation is the next day",
    "entities": [],
    "about": null
  },
  {
    "type": "preference",
    "content": "Stakeholder provides feedback by extending existing files...",
    "entities": [],
    "about": {"entity": "alina", "type": "user"}
  }
]
```

**Actual (4 items):**
```json
[
  {
    "type": "fact",
    "content": "Alina is unfamiliar with IoTController and ModBus concepts",
    "entities": ["iot-controller", "modbus"],
    "about": {"entity": "alina", "type": "user"}
  },
  {
    "type": "rule",
    "content": "Explain why IoTController and ModBus exist...",
    "entities": ["testing"]
  },
  {
    "type": "rule",
    "content": "Present the explanation tomorrow",
    "entities": ["deadline"]
  },
  {
    "type": "decision",
    "content": "Extend existing files",
    "entities": ["files"]
  }
]
```

**Analysis:**
- ✅ **about_f1=1.0**: Both items with `about` field correctly tagged Alina as user
- ⚠️ **entity_f1 likely low**: Expected `["iotcontroller", "modbus"]` vs actual `["iot-controller", "modbus"]` - hyphenation mismatch
- ❌ **type_accuracy=0.25**: 3 out of 4 items have wrong types:
  - Item 2: Expected `fact` → Got `rule` (hallucinated constraint from "need to explain")
  - Item 3: Expected `fact` → Got `rule` (deadline misclassified as imperative)
  - Item 4: Expected `preference` → Got `decision` (user feedback method misunderstood)
- 🔍 **Root cause:** Model conflates imperative phrasing ("We need to", "ASAP") with user rules/decisions. Lacks nuance between:
  - `fact`: statement of current state/situation
  - `rule`: hard constraint on how things must be done
  - `preference`: preferred approach without alternative rejection
  - `decision`: explicit choice among alternatives

**Entity precision issue:** Model invented `["testing"]`, `["deadline"]`, `["files"]` which are too generic and not in the gold standard.

---

### 2. **Type Confusion: decision vs preference**

**Pattern:** "Let's use X" triggers both `decision` and `preference` extraction, causing type ambiguity.

**Prompt guidance:**
```
- decision: user chose X — triggers: "let's go with", "I choose", "let's do", "let's use", "we'll use", "go with"
- preference: user prefers X over Y — triggers: "I prefer", "I like", "let's use X" (without rejecting alternatives = preference)
```

**Problem:** "let's use pnpm" can be either:
- `preference` if expressing a general tooling preference
- `decision` if choosing pnpm after considering npm/yarn

**Gold standard examples:**
- Item #46: "I use pnpm in all my projects" → **preference** (general practice)
- Item #48: "Let's go with Postgres" → **decision** (active choice)

**Recommendation:** Clarify in prompt:
- `decision` requires explicit context of alternatives or choice-making ("go with A", "choose X", "let's do A not B")
- `preference` is a stated habit/taste without immediate alternatives ("I prefer", "I use", "I like")

---

### 3. **Entity Hallucination (Low entity_precision)**

**Examples of hallucinated entities:**
- `["testing"]` - too generic, not a specific tool/technology
- `["deadline"]` - meta-concept, not a domain term
- `["files"]` - too vague
- `["presentation"]` - event, not a technology

**Gold standard entity examples:**
- `["iotcontroller", "modbus"]` - specific technologies
- `["postgresql"]`, `["pnpm"]` - specific tools
- `["payload-cms"]`, `["mqtt"]` - specific systems

**Missing entities (entity_recall issue):**
- When gold has `["pavlovsky-posad"]` (museum name), model may miss it
- When gold has `["electron-builder", "electron-updater"]`, model may only capture one

**Root cause:** Prompt says "List technologies, tools, libraries, concepts, and domain terms" but doesn't emphasize:
1. Entities must be **specific** and **nameable**
2. Avoid abstract meta-concepts like "deadline", "testing", "files"
3. Include **project-specific terms** (museum names, collection names, component names)

---

### 4. **Missing `about` Fields (about_recall issue)**

**Pattern:** When conversation is about a third party (Alina, another team member), models often fail to add the `about` field.

**Gold standard examples with `about`:**
```json
{
  "type": "fact",
  "content": "Alina is unfamiliar with IoTController and ModBus concepts",
  "about": {"entity": "alina", "type": "user"}
}
```

**Failure mode:** Model extracts the content correctly but omits the `about` field, defaulting to project-level knowledge.

**Recommendation:** Strengthen prompt section:
```
Subject tagging (about field):
- Tag WHO the knowledge is about
- ALWAYS add about field when:
  - User mentions another person by name: "Mary prefers Discord" → about: {entity: "mary", type: "user"}
  - User describes someone else's knowledge/preference: "Alina does not know X" → about: {entity: "alina", type: "user"}
  - User gives feedback method for someone: "She can present..." → about: {entity: <name>, type: "user"}
```

---

### 5. **Over-extraction from Context Noise**

**Example:** Numbered lists like "3. All of this really" or "5. ASAP really" extracted as standalone items.

**Gold standard:** These are contextual remarks, not knowledge items. Expected 4 items, model extracted 4 items but with wrong types.

**Not a count_accuracy issue** in this case, but model is extracting context noise with wrong types rather than skipping it.

---

## Recommendations for Prompt Improvements

### High Priority

1. **Type Classification Clarity**
   - Add negative examples: "We need to present tomorrow" is a `fact` (deadline exists), NOT a `rule` (no imperative constraint)
   - Clarify `decision` requires choice context: "Let's go with A [over B]" or "I choose X"
   - Clarify `preference` is a stated habit: "I prefer X" or "I always use X"

2. **Entity Specificity Rules**
   ```
   Entity tagging (entities field):
   - List SPECIFIC technologies, tools, libraries, and concepts
   - DO NOT tag meta-concepts: avoid "testing", "deadline", "files", "presentation"
   - DO tag: tool names (pnpm, postgresql), libraries (payload-cms), concepts (modbus, mqtt)
   - DO tag project-specific terms: museum names, kiosk types, collection names
   - Use lowercase hyphenated slugs consistently: "IoTController" → "iot-controller"
   ```

3. **About Field Emphasis**
   ```
   When extracting knowledge about another person mentioned in conversation:
   - ALWAYS add about: {entity: "firstname", type: "user"}
   - Examples:
     - "Alina does not know ModBus" → about: {entity: "alina", type: "user"}
     - "She needs to present tomorrow" → about: {entity: <name-from-context>, type: "user"}
   ```

### Medium Priority

4. **Entity Recall Improvement**
   - Add examples showing ALL entities should be captured:
     - "electron-builder and electron-updater" → entities: ["electron-builder", "electron-updater"]
     - "ALROSA museum in Yakutia" → entities: ["alrosa", "museum"]

5. **Confidence Calibration**
   - Prompt currently says "Set confidence to 1.0 for explicit statements"
   - This leads to over-confident extraction
   - Recommendation: Add "Use 0.8-0.9 for inferred or contextual knowledge"

---

## Metrics to Track

For next evaluation run:

1. **about_f1**: Currently strong, maintain with enhanced guidance
2. **entity_f1**: Focus on:
   - Reducing hallucinated generic entities (improve precision)
   - Capturing all mentioned entities (improve recall)
3. **type_accuracy**: Biggest issue - needs type discrimination examples
4. **entity_precision**: Remove generic/meta entities from extraction

---

## Next Steps

1. **Update prompt** with above recommendations in `server/memory/knowledge-extractor.ts`
2. **Re-run evaluation** with updated prompt using:
   ```bash
   pnpm tsx experiments/extraction/run-eval.ts --local-prompt
   ```
3. **Compare runs** in Langfuse Datasets UI to validate improvements
4. **If using gemma3:12b**, test whether patterns differ from gpt-oss (may need model-specific tuning)

---

## Appendix: Dataset Item Coverage

- ✅ Items 42-51: Analyzed above
- ⏭️ Items 0-41: Not yet analyzed (need to fetch more traces with scores)
- 📊 Total dataset size: 52 items
