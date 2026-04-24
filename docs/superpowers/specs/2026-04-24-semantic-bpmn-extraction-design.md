# Semantic BPMN Extraction — Design Spec

## Goal

Enhance `BpmnSourceContentAdapter.bpmn_to_markdown()` so the structured markdown output captures **how the process flows**, not just what elements exist. The output is consumed by Smart Connections' embedding pipeline — optimized for AI comprehension, not human readability. Indexing performance must remain adequate for vaults with dozens of BPMN files.

## Current State

`bpmn_to_markdown()` extracts flat lists of:
- Tasks (by type), sub-processes, events, gateways, data objects/stores
- Named sequence flows (condition labels only)
- Text annotations

Missing: flow relationships, gateway branching logic, boundary event context, multi-instance markers, data associations.

## Approach: Flow-Aware Structured Markdown

Add flow-resolution logic on top of the existing structural extraction. New sections augment the output — existing sections remain unchanged so malformed BPMN degrades gracefully to current behavior.

## Design

### 1. ID-to-Name Lookup Map

Single pass over all elements within each `<process>`, building a `Map<id, { name, type }>`.

- Traverse all child elements of the process
- Store `id` → `{ name: getAttribute('name'), type: localName }`
- Also include elements inside sub-processes (recursive child scan)
- Cost: O(n) elements, computed once per process, reused by all subsequent sections

### 2. Sequence Flow Resolution

Replace the current "named flows only" section with full flow resolution.

**Gateway branches** — when a sequence flow's `sourceRef` resolves to a gateway:
- Group outgoing flows by gateway
- Emit gateway name/type + each branch with its condition label and target:
  ```
  ## Gateway Branches
  - "Locality of the payment?" (inclusive):
    - [CrossBorder] → "Add SWIFT payment type" (businessRuleTask)
    - [Same country or a colony] → "Add domestic payment options" (businessRuleTask)
    - [Our FX account] → "Add peer-to-peer types" (businessRuleTask)
    - [Same trade group/s member] → "Add group payment options" (businessRuleTask)
  ```

**Linear flows** — non-gateway sequence flows between named elements:
- Emit as `"Source Name" (type) → "Target Name" (type)`
- Group into a `## Process Flow` section
- Skip flows where both source and target have no name (internal plumbing)

### 3. Boundary Events with Attachment Context

Current behavior lists boundary events as flat entries. New behavior resolves `attachedToRef` to the host element and follows the outgoing flow to the target:

```
## Boundary Events
- "Submit payment": on error "Insufficient funds for fees" → "Notify client to top up funds"
- "Submit payment": on error "Debtor is missing currency balance" → "Notify client to top up funds"
- "Revise outgoing payment": on condition "Unsatisfied" → "Fill info for payment type decision"
```

The event definition type (error, condition, timer, message, signal) is extracted from the child element's localName (e.g. `errorEventDefinition` → "error").

### 4. Multi-Instance / Loop Markers

Check each task for `multiInstanceLoopCharacteristics` or `standardLoopCharacteristics` child elements.

- If `multiInstanceLoopCharacteristics` with `isSequential="true"` → append "(sequential multi-instance)"
- If `multiInstanceLoopCharacteristics` with `isSequential="false"` or unset → append "(parallel multi-instance)"
- If `standardLoopCharacteristics` → append "(loop)"

Applied inline to the task entry in the existing Tasks section:
```
- Add group payment options (businessRuleTask, sequential multi-instance)
```

### 5. Data Associations

Resolve `dataOutputAssociation` and `dataInputAssociation` within tasks to connect them with named data objects/references:

```
## Data Flow
- "Select recipient account" produces "Country, bank and currency"
```

Lookup: `targetRef` in output associations → find the data object reference by ID → get its name. Same in reverse for input associations.

### 6. Sub-Process Internal Flows

Sub-processes contain their own tasks, events, gateways, and flows. Apply the same flow-resolution logic recursively within each sub-process, nesting the output under the sub-process heading:

```
## Sub-Process: Fill info for payment type decision
### Tasks
- Select recipient account (userTask)
- Select amount (userTask)
### Process Flow
- "Payment form to be filled" (startEvent) → "Select recipient account" (userTask)
- "Select recipient account" → "Select amount"
- "Select amount" → "Form filled without payment type" (endEvent)
### Boundary Events
- "Select recipient account": on condition "Desired recipient not found" → "Manage counterparties"
```

## Section Ordering in Output

1. `# Process: <name>` (existing)
2. `## Tasks` (existing, enhanced with multi-instance markers)
3. `## Sub-Processes` (existing structure, now with internal flow details)
4. `## Events` (existing)
5. `## Gateway Branches` (new — replaces old "Flow Conditions")
6. `## Process Flow` (new — linear non-gateway flows)
7. `## Boundary Events` (new — replaces flat boundary event listing in Events)
8. `## Data Flow` (new)
9. `## Data` (existing — data objects/stores listing)
10. `## Annotations` (existing)

## Performance

- ID map build: O(n) single pass per process
- Flow resolution: O(f) where f = sequence flow count (typically 1-2x element count)
- Boundary/data resolution: O(1) lookups into the ID map per element
- No recursive graph traversal or topological sort
- Real BPMN files in the test vault have 20-60 elements — negligible overhead
- Output size grows modestly (flow descriptions add ~30-50% more text)

## Testing Strategy

- Use real BPMN files from the test vault (`/docs/a1-transactions/`)
- Verify output against manually inspected process flows
- Edge cases: empty process, no gateways, deeply nested sub-processes, namespaced XML (`bpmn:` prefix vs bare)
- Regression: ensure existing structural sections remain unchanged for simple BPMN files

## Files Changed

- `src/bpmn_source_adapter.js` — all changes in `bpmn_to_markdown()` and new helper methods
- No new dependencies
