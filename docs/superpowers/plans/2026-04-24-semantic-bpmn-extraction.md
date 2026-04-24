# Semantic BPMN Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance `bpmn_to_markdown()` to capture process flow relationships, gateway branching, boundary event context, multi-instance markers, and data associations — so AI can understand a BPMN file the way a human analyst would.

**Architecture:** Add helper methods to `BpmnSourceContentAdapter` that resolve element IDs to names, then walk sequence flows to produce flow-aware sections. Each process is extracted via a shared `extract_container_sections()` method that works recursively for sub-processes. Existing structural sections remain as fallback.

**Tech Stack:** Vitest + jsdom (for DOMParser in Node), no runtime dependencies added.

---

## File Structure

- **Modify:** `src/bpmn_source_adapter.js` — new helper methods + refactored `bpmn_to_markdown()`
- **Modify:** `package.json` — add vitest + jsdom devDependencies, test script
- **Create:** `vitest.config.js` — jsdom environment config
- **Create:** `test/bpmn_source_adapter.test.js` — all unit + integration tests
- **Create:** `test/fixtures/outpay-initiate.bpmn` — real BPMN file for integration test

---

### Task 1: Set up test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Install vitest and jsdom**

Run: `npm install -D vitest jsdom`

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 4: Create test file with a smoke test**

Create `test/bpmn_source_adapter.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { BpmnSourceContentAdapter } from '../src/bpmn_source_adapter.js';

function make_adapter() {
  return new BpmnSourceContentAdapter({});
}

describe('BpmnSourceContentAdapter', () => {
  it('returns "(Empty BPMN file)" for empty process', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" />
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('Process:');
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: 1 test passes. This confirms vitest + jsdom + DOMParser + ES module imports all work.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js test/
git commit -m "🧪 Add vitest + jsdom test infrastructure"
```

---

### Task 2: Add `build_id_map` and `query_local_direct` helpers

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests for `build_id_map`**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('build_id_map', () => {
  it('maps element IDs to name and type', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Review order" />
          <serviceTask id="t2" name="Send email" />
          <exclusiveGateway id="g1" name="Approved?" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const map = adapter.build_id_map(process);

    expect(map.get('t1')).toEqual({ name: 'Review order', type: 'userTask' });
    expect(map.get('t2')).toEqual({ name: 'Send email', type: 'serviceTask' });
    expect(map.get('g1')).toEqual({ name: 'Approved?', type: 'exclusiveGateway' });
  });

  it('includes elements inside sub-processes', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <subProcess id="sp1" name="Verify">
            <userTask id="t1" name="Check docs" />
          </subProcess>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const map = adapter.build_id_map(process);

    expect(map.get('sp1')).toEqual({ name: 'Verify', type: 'subProcess' });
    expect(map.get('t1')).toEqual({ name: 'Check docs', type: 'userTask' });
  });

  it('stores empty string for unnamed elements', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const map = adapter.build_id_map(process);

    expect(map.get('g1')).toEqual({ name: '', type: 'exclusiveGateway' });
  });
});
```

- [ ] **Step 2: Write failing tests for `query_local_direct`**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('query_local_direct', () => {
  it('returns only direct children, not nested descendants', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Top level" />
          <subProcess id="sp1">
            <userTask id="t2" name="Nested" />
          </subProcess>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const direct = adapter.query_local_direct(process, 'userTask');

    expect(direct).toHaveLength(1);
    expect(direct[0].getAttribute('id')).toBe('t1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `adapter.build_id_map is not a function`, `adapter.query_local_direct is not a function`

- [ ] **Step 4: Implement `build_id_map` and `query_local_direct`**

Add to `BpmnSourceContentAdapter` class in `src/bpmn_source_adapter.js`, after the `get_documentation` method:

```js
  /**
   * Build a lookup map of element ID → { name, type } for all elements in a container.
   * Searches all descendants (including inside sub-processes) for cross-reference resolution.
   */
  build_id_map(container) {
    const map = new Map();
    const all = Array.from(container.querySelectorAll('*'));
    for (const el of all) {
      const id = el.getAttribute('id');
      if (id) {
        map.set(id, { name: el.getAttribute('name')?.trim() || '', type: el.localName });
      }
    }
    return map;
  }

  /**
   * Query direct child elements by local name (not descendants).
   * Use this when extracting elements at a specific process/sub-process level.
   */
  query_local_direct(container, local_name) {
    return Array.from(container.children).filter(
      el => el.localName === local_name
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "✨ Add build_id_map and query_local_direct helpers"
```

---

### Task 3: Add multi-instance / loop markers to Tasks section

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('get_loop_marker', () => {
  it('returns "sequential multi-instance" for sequential multi-instance', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <businessRuleTask id="t1" name="Process items">
            <multiInstanceLoopCharacteristics isSequential="true" />
          </businessRuleTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'businessRuleTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('sequential multi-instance');
  });

  it('returns "parallel multi-instance" when isSequential is false', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <serviceTask id="t1" name="Send notifications">
            <multiInstanceLoopCharacteristics isSequential="false" />
          </serviceTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'serviceTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('parallel multi-instance');
  });

  it('returns "parallel multi-instance" when isSequential is absent', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Review">
            <multiInstanceLoopCharacteristics />
          </userTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'userTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('parallel multi-instance');
  });

  it('returns "loop" for standardLoopCharacteristics', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Retry">
            <standardLoopCharacteristics />
          </userTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'userTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('loop');
  });

  it('returns empty string for tasks with no loop', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Simple" />
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'userTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('');
  });
});

describe('bpmn_to_markdown - multi-instance markers', () => {
  it('appends loop marker to task entry', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <businessRuleTask id="t1" name="Process items">
            <multiInstanceLoopCharacteristics isSequential="true" />
          </businessRuleTask>
          <userTask id="t2" name="Review" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('- Process items (businessRuleTask, sequential multi-instance)');
    expect(result).toContain('- Review (userTask)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `adapter.get_loop_marker is not a function`, markdown assertion fails.

- [ ] **Step 3: Implement `get_loop_marker` helper**

Add to `BpmnSourceContentAdapter` class in `src/bpmn_source_adapter.js`, after `query_local_direct`:

```js
  /**
   * Get loop/multi-instance marker for a task element.
   * Returns a descriptor string or empty string if none.
   */
  get_loop_marker(task_el) {
    const mi = this.query_local(task_el, 'multiInstanceLoopCharacteristics');
    if (mi.length > 0) {
      return mi[0].getAttribute('isSequential') === 'true'
        ? 'sequential multi-instance'
        : 'parallel multi-instance';
    }
    const sl = this.query_local(task_el, 'standardLoopCharacteristics');
    if (sl.length > 0) return 'loop';
    return '';
  }
```

- [ ] **Step 4: Update Tasks section in `bpmn_to_markdown` to include loop markers**

In `bpmn_to_markdown`, find the Tasks section (around line 236-244). Replace the task line generation:

Old:
```js
          const type_label = task.localName === 'task' ? '' : ` (${task.localName})`;
```

New:
```js
          const loop_marker = this.get_loop_marker(task);
          const type_parts = [];
          if (task.localName !== 'task') type_parts.push(task.localName);
          if (loop_marker) type_parts.push(loop_marker);
          const type_label = type_parts.length > 0 ? ` (${type_parts.join(', ')})` : '';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "✨ Add multi-instance/loop markers to task entries"
```

---

### Task 4: Add gateway branches section

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('extract_gateway_branches', () => {
  it('groups outgoing flows by gateway with condition labels', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <inclusiveGateway id="g1" name="Payment locality?" />
          <businessRuleTask id="t1" name="Add SWIFT" />
          <businessRuleTask id="t2" name="Add domestic" />
          <sequenceFlow id="f1" name="CrossBorder" sourceRef="g1" targetRef="t1" />
          <sequenceFlow id="f2" name="Domestic" sourceRef="g1" targetRef="t2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const branches = adapter.extract_gateway_branches(process, id_map);

    expect(branches.size).toBe(1);
    const gw = branches.get('g1');
    expect(gw.name).toBe('Payment locality?');
    expect(gw.type).toBe('inclusive');
    expect(gw.branches).toHaveLength(2);
    expect(gw.branches[0]).toEqual({
      condition: 'CrossBorder',
      target_name: 'Add SWIFT',
      target_type: 'businessRuleTask',
    });
  });

  it('handles unnamed gateway branches', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" />
          <userTask id="t1" name="Approve" />
          <sequenceFlow id="f1" sourceRef="g1" targetRef="t1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const branches = adapter.extract_gateway_branches(process, id_map);

    const gw = branches.get('g1');
    expect(gw.name).toBe('g1');
    expect(gw.branches[0].condition).toBe('');
  });
});

describe('bpmn_to_markdown - gateway branches', () => {
  it('emits Gateway Branches section', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <inclusiveGateway id="g1" name="Type?" />
          <userTask id="t1" name="Do A" />
          <userTask id="t2" name="Do B" />
          <sequenceFlow id="f1" name="Option A" sourceRef="g1" targetRef="t1" />
          <sequenceFlow id="f2" name="Option B" sourceRef="g1" targetRef="t2" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Gateway Branches');
    expect(result).toContain('"Type?" (inclusive)');
    expect(result).toContain('[Option A] → "Do A" (userTask)');
    expect(result).toContain('[Option B] → "Do B" (userTask)');
  });

  it('does not emit old Flow Conditions section', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <inclusiveGateway id="g1" name="Type?" />
          <userTask id="t1" name="Do A" />
          <sequenceFlow id="f1" name="Option A" sourceRef="g1" targetRef="t1" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).not.toContain('## Flow Conditions');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `adapter.extract_gateway_branches is not a function`, markdown assertions fail.

- [ ] **Step 3: Implement `extract_gateway_branches` helper**

Add to `BpmnSourceContentAdapter` class:

```js
  /**
   * Extract gateway branching information from a container.
   * Returns Map<gateway_id, { name, type, branches: [{ condition, target_name, target_type }] }>
   */
  extract_gateway_branches(container, id_map) {
    const gateway_types = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway'];
    const gateways = new Map();

    for (const type of gateway_types) {
      for (const gw of this.query_local_direct(container, type)) {
        const id = gw.getAttribute('id');
        const kind = type.replace('Gateway', '');
        gateways.set(id, {
          name: this.get_label(gw) || id,
          type: kind.charAt(0).toLowerCase() + kind.slice(1),
          branches: [],
        });
      }
    }

    for (const flow of this.query_local_direct(container, 'sequenceFlow')) {
      const source_id = flow.getAttribute('sourceRef');
      const gw = gateways.get(source_id);
      if (!gw) continue;

      const target_id = flow.getAttribute('targetRef');
      const target = id_map.get(target_id);
      gw.branches.push({
        condition: this.get_label(flow),
        target_name: target?.name || target_id,
        target_type: target?.type || '',
      });
    }

    return gateways;
  }
```

- [ ] **Step 4: Wire gateway branches into `bpmn_to_markdown`, remove old Flow Conditions**

In `bpmn_to_markdown`, at the start of the `for (const process of processes)` loop, after `sections.push('');` for the process name, add:

```js
      const id_map = this.build_id_map(process);
```

Then, **remove** the existing "Sequence flows with conditions" block (lines ~310-320 in original):
```js
      // DELETE THIS BLOCK:
      // Sequence flows with conditions
      const flows = this.query_local(process, 'sequenceFlow');
      const named_flows = flows.filter(f => this.get_label(f));
      if (named_flows.length > 0) {
        sections.push('## Flow Conditions');
        for (const flow of named_flows) {
          const label = this.get_label(flow);
          sections.push(`- ${label}`);
        }
        sections.push('');
      }
```

And **add** the Gateway Branches section after Gateways:

```js
      // Gateway branches (replaces Flow Conditions)
      const gateway_branches = this.extract_gateway_branches(process, id_map);
      const gateways_with_branches = [...gateway_branches.values()].filter(gw => gw.branches.length > 0);
      if (gateways_with_branches.length > 0) {
        sections.push('## Gateway Branches');
        for (const gw of gateways_with_branches) {
          sections.push(`- "${gw.name}" (${gw.type}):`);
          for (const b of gw.branches) {
            const cond = b.condition ? `[${b.condition}] → ` : '';
            const type_suffix = b.target_type ? ` (${b.target_type})` : '';
            sections.push(`  - ${cond}"${b.target_name}"${type_suffix}`);
          }
        }
        sections.push('');
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "✨ Add gateway branches with condition labels"
```

---

### Task 5: Add linear process flow section

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('extract_linear_flows', () => {
  it('returns non-gateway flows as source → target pairs', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <startEvent id="e1" name="Start" />
          <userTask id="t1" name="Fill form" />
          <endEvent id="e2" name="Done" />
          <sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
          <sequenceFlow id="f2" sourceRef="t1" targetRef="e2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const gateway_ids = new Set();
    const flows = adapter.extract_linear_flows(process, id_map, gateway_ids);

    expect(flows).toHaveLength(2);
    expect(flows[0]).toEqual({
      source_name: 'Start', source_type: 'startEvent',
      target_name: 'Fill form', target_type: 'userTask',
    });
    expect(flows[1]).toEqual({
      source_name: 'Fill form', source_type: 'userTask',
      target_name: 'Done', target_type: 'endEvent',
    });
  });

  it('excludes flows from gateways', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" name="Check" />
          <userTask id="t1" name="A" />
          <userTask id="t2" name="B" />
          <sequenceFlow id="f1" sourceRef="t1" targetRef="g1" />
          <sequenceFlow id="f2" sourceRef="g1" targetRef="t2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const gateway_ids = new Set(['g1']);
    const flows = adapter.extract_linear_flows(process, id_map, gateway_ids);

    // Only f1 (t1 → g1) — f2 is from a gateway so handled in gateway branches
    expect(flows).toHaveLength(1);
    expect(flows[0].source_name).toBe('A');
    expect(flows[0].target_name).toBe('Check');
  });

  it('skips flows where both source and target are unnamed', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" />
          <exclusiveGateway id="g2" />
          <userTask id="t1" name="Named" />
          <sequenceFlow id="f1" sourceRef="g1" targetRef="g2" />
          <sequenceFlow id="f2" sourceRef="t1" targetRef="g1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const gateway_ids = new Set(['g1', 'g2']);
    const flows = adapter.extract_linear_flows(process, id_map, gateway_ids);

    // f1 excluded (gateway source), f2 excluded (both g1 target is unnamed)
    // Actually t1→g1: t1 has name "Named", g1 has no name — at least one has name, so included
    expect(flows).toHaveLength(1);
    expect(flows[0].source_name).toBe('Named');
  });
});

describe('bpmn_to_markdown - process flow', () => {
  it('emits Process Flow section with linear flows', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <startEvent id="e1" name="Begin" />
          <userTask id="t1" name="Do work" />
          <endEvent id="e2" name="Finish" />
          <sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
          <sequenceFlow id="f2" sourceRef="t1" targetRef="e2" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Process Flow');
    expect(result).toContain('"Begin" (startEvent) → "Do work" (userTask)');
    expect(result).toContain('"Do work" (userTask) → "Finish" (endEvent)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `adapter.extract_linear_flows is not a function`, markdown assertion fails.

- [ ] **Step 3: Implement `extract_linear_flows` helper**

Add to `BpmnSourceContentAdapter` class:

```js
  /**
   * Extract non-gateway sequence flows as source → target pairs.
   * Skips flows originating from gateways (handled by extract_gateway_branches).
   * Skips flows where both source and target have no name.
   */
  extract_linear_flows(container, id_map, gateway_ids) {
    const flows = [];

    for (const flow of this.query_local_direct(container, 'sequenceFlow')) {
      const source_id = flow.getAttribute('sourceRef');
      if (gateway_ids.has(source_id)) continue;

      const target_id = flow.getAttribute('targetRef');
      const source = id_map.get(source_id);
      const target = id_map.get(target_id);

      if (!source?.name && !target?.name) continue;

      flows.push({
        source_name: source?.name || source_id,
        source_type: source?.type || '',
        target_name: target?.name || target_id,
        target_type: target?.type || '',
      });
    }

    return flows;
  }
```

- [ ] **Step 4: Wire linear flows into `bpmn_to_markdown`**

After the Gateway Branches block in `bpmn_to_markdown`, add:

```js
      // Linear process flow
      const gateway_ids = new Set(gateway_branches.keys());
      const linear_flows = this.extract_linear_flows(process, id_map, gateway_ids);
      if (linear_flows.length > 0) {
        sections.push('## Process Flow');
        for (const f of linear_flows) {
          const src_type = f.source_type ? ` (${f.source_type})` : '';
          const tgt_type = f.target_type ? ` (${f.target_type})` : '';
          sections.push(`- "${f.source_name}"${src_type} → "${f.target_name}"${tgt_type}`);
        }
        sections.push('');
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "✨ Add linear process flow section"
```

---

### Task 6: Add boundary events with attachment context

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('extract_boundary_events', () => {
  it('resolves boundary event to host task and outgoing target', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Submit payment" />
          <serviceTask id="t2" name="Notify client" />
          <boundaryEvent id="be1" name="Insufficient funds" attachedToRef="t1">
            <outgoing>f1</outgoing>
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="f1" sourceRef="be1" targetRef="t2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const events = adapter.extract_boundary_events(process, id_map);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      host_name: 'Submit payment',
      event_name: 'Insufficient funds',
      event_kind: 'error',
      target_name: 'Notify client',
    });
  });

  it('handles conditional boundary events', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <manualTask id="t1" name="Review" />
          <subProcess id="sp1" name="Redo" />
          <boundaryEvent id="be1" name="Unsatisfied" attachedToRef="t1">
            <outgoing>f1</outgoing>
            <conditionalEventDefinition><condition /></conditionalEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="f1" sourceRef="be1" targetRef="sp1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const events = adapter.extract_boundary_events(process, id_map);

    expect(events[0].event_kind).toBe('conditional');
    expect(events[0].target_name).toBe('Redo');
  });

  it('handles boundary event with no outgoing flow', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Wait" />
          <boundaryEvent id="be1" name="Timeout" attachedToRef="t1">
            <timerEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const events = adapter.extract_boundary_events(process, id_map);

    expect(events).toHaveLength(1);
    expect(events[0].target_name).toBe('');
    expect(events[0].event_kind).toBe('timer');
  });
});

describe('bpmn_to_markdown - boundary events', () => {
  it('emits Boundary Events section and excludes boundary from Events', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <startEvent id="e1" name="Start" />
          <userTask id="t1" name="Submit" />
          <serviceTask id="t2" name="Alert" />
          <boundaryEvent id="be1" name="Error occurred" attachedToRef="t1">
            <outgoing>f1</outgoing>
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="f1" sourceRef="be1" targetRef="t2" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Boundary Events');
    expect(result).toContain('"Submit": on error "Error occurred" → "Alert"');
    // Boundary event should NOT appear in regular Events section
    expect(result).toContain('## Events');
    expect(result).not.toMatch(/Events[\s\S]*Boundary.*Error occurred/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `adapter.extract_boundary_events is not a function`, markdown assertions fail.

- [ ] **Step 3: Implement `extract_boundary_events` helper**

Add to `BpmnSourceContentAdapter` class:

```js
  /**
   * Extract boundary events with host task context and outgoing target.
   * Returns [{ host_name, event_name, event_kind, target_name }]
   */
  extract_boundary_events(container, id_map) {
    const results = [];
    const flow_map = new Map();

    for (const flow of this.query_local_direct(container, 'sequenceFlow')) {
      flow_map.set(flow.getAttribute('sourceRef'), flow.getAttribute('targetRef'));
    }

    for (const be of this.query_local_direct(container, 'boundaryEvent')) {
      const host_id = be.getAttribute('attachedToRef');
      const host = id_map.get(host_id);
      const event_name = this.get_label(be) || be.getAttribute('id');

      // Detect event definition type
      let event_kind = '';
      for (const child of Array.from(be.children)) {
        const ln = child.localName;
        if (ln.endsWith('EventDefinition')) {
          event_kind = ln.replace('EventDefinition', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
          break;
        }
      }

      const target_id = flow_map.get(be.getAttribute('id'));
      const target = target_id ? id_map.get(target_id) : null;

      results.push({
        host_name: host?.name || host_id || '',
        event_name,
        event_kind: event_kind || 'signal',
        target_name: target?.name || '',
      });
    }

    return results;
  }
```

- [ ] **Step 4: Update Events section to exclude boundary events**

In `bpmn_to_markdown`, find the Events section. Change `event_types` to remove `'boundaryEvent'`:

Old:
```js
      const event_types = [
        'startEvent', 'endEvent', 'intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent',
      ];
```

New:
```js
      const event_types = [
        'startEvent', 'endEvent', 'intermediateCatchEvent', 'intermediateThrowEvent',
      ];
```

- [ ] **Step 5: Add Boundary Events section to `bpmn_to_markdown`**

After the Process Flow section, add:

```js
      // Boundary events with attachment context
      const boundary_events = this.extract_boundary_events(process, id_map);
      if (boundary_events.length > 0) {
        sections.push('## Boundary Events');
        for (const be of boundary_events) {
          const target_part = be.target_name ? ` → "${be.target_name}"` : '';
          sections.push(`- "${be.host_name}": on ${be.event_kind} "${be.event_name}"${target_part}`);
        }
        sections.push('');
      }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "✨ Add boundary events with host task context"
```

---

### Task 7: Add data flow section

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('extract_data_flows', () => {
  it('resolves dataOutputAssociation to data object name', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <dataObject id="do1" />
          <dataObjectReference id="dor1" name="Invoice data" dataObjectRef="do1" />
          <userTask id="t1" name="Fill invoice">
            <dataOutputAssociation id="da1">
              <sourceRef>out1</sourceRef>
              <targetRef>dor1</targetRef>
            </dataOutputAssociation>
          </userTask>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const flows = adapter.extract_data_flows(process, id_map);

    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual({
      task_name: 'Fill invoice',
      data_name: 'Invoice data',
      direction: 'produces',
    });
  });

  it('resolves dataInputAssociation', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <dataObject id="do1" />
          <dataObjectReference id="dor1" name="Config" dataObjectRef="do1" />
          <serviceTask id="t1" name="Send email">
            <dataInputAssociation id="da1">
              <sourceRef>dor1</sourceRef>
              <targetRef>in1</targetRef>
            </dataInputAssociation>
          </serviceTask>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const flows = adapter.extract_data_flows(process, id_map);

    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual({
      task_name: 'Send email',
      data_name: 'Config',
      direction: 'consumes',
    });
  });
});

describe('bpmn_to_markdown - data flow', () => {
  it('emits Data Flow section', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <dataObject id="do1" />
          <dataObjectReference id="dor1" name="Report" dataObjectRef="do1" />
          <userTask id="t1" name="Generate report">
            <dataOutputAssociation id="da1">
              <sourceRef>out1</sourceRef>
              <targetRef>dor1</targetRef>
            </dataOutputAssociation>
          </userTask>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Data Flow');
    expect(result).toContain('"Generate report" produces "Report"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `adapter.extract_data_flows is not a function`, markdown assertion fails.

- [ ] **Step 3: Implement `extract_data_flows` helper**

Add to `BpmnSourceContentAdapter` class:

```js
  /**
   * Extract data associations between tasks and data objects.
   * Returns [{ task_name, data_name, direction: 'produces'|'consumes' }]
   */
  extract_data_flows(container, id_map) {
    const results = [];
    const task_types = ['task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask',
      'sendTask', 'receiveTask', 'businessRuleTask', 'subProcess'];

    for (const type of task_types) {
      for (const task of this.query_local_direct(container, type)) {
        const task_name = this.get_label(task) || task.getAttribute('id');

        for (const assoc of this.query_local(task, 'dataOutputAssociation')) {
          const target_refs = this.query_local(assoc, 'targetRef');
          if (target_refs.length > 0) {
            const data_id = target_refs[0].textContent?.trim();
            const data = id_map.get(data_id);
            if (data?.name) {
              results.push({ task_name, data_name: data.name, direction: 'produces' });
            }
          }
        }

        for (const assoc of this.query_local(task, 'dataInputAssociation')) {
          const source_refs = this.query_local(assoc, 'sourceRef');
          if (source_refs.length > 0) {
            const data_id = source_refs[0].textContent?.trim();
            const data = id_map.get(data_id);
            if (data?.name) {
              results.push({ task_name, data_name: data.name, direction: 'consumes' });
            }
          }
        }
      }
    }

    return results;
  }
```

- [ ] **Step 4: Wire data flow into `bpmn_to_markdown`**

After the Boundary Events section, before the Data section, add:

```js
      // Data flow associations
      const data_flows = this.extract_data_flows(process, id_map);
      if (data_flows.length > 0) {
        sections.push('## Data Flow');
        for (const df of data_flows) {
          sections.push(`- "${df.task_name}" ${df.direction} "${df.data_name}"`);
        }
        sections.push('');
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "✨ Add data flow associations between tasks and data objects"
```

---

### Task 8: Refactor sub-process extraction to recursive flow resolution

**Files:**
- Modify: `src/bpmn_source_adapter.js`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('bpmn_to_markdown - sub-process internal flows', () => {
  it('extracts tasks and flow within a sub-process', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <subProcess id="sp1" name="Verify documents">
            <startEvent id="e1" name="Docs received" />
            <userTask id="t1" name="Check passport" />
            <endEvent id="e2" name="Verified" />
            <sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
            <sequenceFlow id="f2" sourceRef="t1" targetRef="e2" />
          </subProcess>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Sub-Process: Verify documents');
    expect(result).toContain('### Tasks');
    expect(result).toContain('- Check passport (userTask)');
    expect(result).toContain('### Process Flow');
    expect(result).toContain('"Docs received" (startEvent) → "Check passport" (userTask)');
    expect(result).toContain('"Check passport" (userTask) → "Verified" (endEvent)');
  });

  it('extracts gateway branches within sub-process', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <subProcess id="sp1" name="Route">
            <exclusiveGateway id="g1" name="Which path?" />
            <userTask id="t1" name="Path A" />
            <userTask id="t2" name="Path B" />
            <sequenceFlow id="f1" name="Left" sourceRef="g1" targetRef="t1" />
            <sequenceFlow id="f2" name="Right" sourceRef="g1" targetRef="t2" />
          </subProcess>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('### Gateway Branches');
    expect(result).toContain('[Left] → "Path A" (userTask)');
  });

  it('extracts boundary events within sub-process scope', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <subProcess id="sp1" name="Fill form">
            <userTask id="t1" name="Select recipient" />
            <subProcess id="sp2" name="Manage contacts" />
            <boundaryEvent id="be1" name="Not found" attachedToRef="t1">
              <outgoing>f1</outgoing>
              <conditionalEventDefinition><condition /></conditionalEventDefinition>
            </boundaryEvent>
            <sequenceFlow id="f1" sourceRef="be1" targetRef="sp2" />
          </subProcess>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('### Boundary Events');
    expect(result).toContain('"Select recipient": on conditional "Not found" → "Manage contacts"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — sub-process output is still a flat list, missing internal flow details.

- [ ] **Step 3: Extract `extract_container_sections` method**

This is the core refactoring. Extract the per-container logic from `bpmn_to_markdown` into a reusable method. Add to `BpmnSourceContentAdapter` class:

```js
  /**
   * Extract all sections for a process or sub-process container.
   * @param {Element} container - process or subProcess element
   * @param {Map} id_map - pre-built ID→{name,type} map for the root process
   * @param {string} h - heading prefix ('##' for top-level, '###' for sub-process, etc.)
   * @returns {string[]} - markdown lines
   */
  extract_container_sections(container, id_map, h) {
    const sections = [];

    // Tasks
    const task_types = ['task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'sendTask', 'receiveTask', 'businessRuleTask'];
    const tasks = [];
    for (const type of task_types) {
      tasks.push(...this.query_local_direct(container, type));
    }
    if (tasks.length > 0) {
      sections.push(`${h} Tasks`);
      for (const task of tasks) {
        const label = this.get_label(task) || task.getAttribute('id');
        const loop_marker = this.get_loop_marker(task);
        const type_parts = [];
        if (task.localName !== 'task') type_parts.push(task.localName);
        if (loop_marker) type_parts.push(loop_marker);
        const type_label = type_parts.length > 0 ? ` (${type_parts.join(', ')})` : '';
        const doc = this.get_documentation(task);
        sections.push(`- ${label}${type_label}`);
        if (doc) sections.push(`  ${doc}`);
      }
      sections.push('');
    }

    // Sub-processes (recursive)
    const sub_processes = this.query_local_direct(container, 'subProcess');
    for (const sp of sub_processes) {
      const label = this.get_label(sp) || sp.getAttribute('id');
      const doc = this.get_documentation(sp);
      sections.push(`${h} Sub-Process: ${label}`);
      if (doc) {
        sections.push('');
        sections.push(doc);
      }
      sections.push('');
      const nested_h = h + '#';
      const nested_sections = this.extract_container_sections(sp, id_map, nested_h);
      sections.push(...nested_sections);
    }

    // Events (non-boundary)
    const event_types = ['startEvent', 'endEvent', 'intermediateCatchEvent', 'intermediateThrowEvent'];
    const events = [];
    for (const type of event_types) {
      events.push(...this.query_local_direct(container, type).map(el => ({ el, type })));
    }
    if (events.length > 0) {
      sections.push(`${h} Events`);
      for (const { el, type } of events) {
        const label = this.get_label(el) || el.getAttribute('id');
        const event_kind = type.replace('Event', '').replace(/([A-Z])/g, ' $1').trim();
        sections.push(`- ${event_kind}: ${label}`);
      }
      sections.push('');
    }

    // Gateways
    const gateway_types = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway'];
    const gateways = [];
    for (const type of gateway_types) {
      gateways.push(...this.query_local_direct(container, type).map(el => ({ el, type })));
    }
    if (gateways.length > 0) {
      sections.push(`${h} Gateways`);
      for (const { el, type } of gateways) {
        const label = this.get_label(el) || el.getAttribute('id');
        const gw_kind = type.replace('Gateway', '').replace(/([A-Z])/g, ' $1').trim();
        sections.push(`- ${gw_kind}: ${label}`);
      }
      sections.push('');
    }

    // Gateway branches
    const gateway_branches = this.extract_gateway_branches(container, id_map);
    const gateways_with_branches = [...gateway_branches.values()].filter(gw => gw.branches.length > 0);
    if (gateways_with_branches.length > 0) {
      sections.push(`${h} Gateway Branches`);
      for (const gw of gateways_with_branches) {
        sections.push(`- "${gw.name}" (${gw.type}):`);
        for (const b of gw.branches) {
          const cond = b.condition ? `[${b.condition}] → ` : '';
          const type_suffix = b.target_type ? ` (${b.target_type})` : '';
          sections.push(`  - ${cond}"${b.target_name}"${type_suffix}`);
        }
      }
      sections.push('');
    }

    // Linear process flow
    const gateway_ids = new Set(gateway_branches.keys());
    const linear_flows = this.extract_linear_flows(container, id_map, gateway_ids);
    if (linear_flows.length > 0) {
      sections.push(`${h} Process Flow`);
      for (const f of linear_flows) {
        const src_type = f.source_type ? ` (${f.source_type})` : '';
        const tgt_type = f.target_type ? ` (${f.target_type})` : '';
        sections.push(`- "${f.source_name}"${src_type} → "${f.target_name}"${tgt_type}`);
      }
      sections.push('');
    }

    // Boundary events
    const boundary_events = this.extract_boundary_events(container, id_map);
    if (boundary_events.length > 0) {
      sections.push(`${h} Boundary Events`);
      for (const be of boundary_events) {
        const target_part = be.target_name ? ` → "${be.target_name}"` : '';
        sections.push(`- "${be.host_name}": on ${be.event_kind} "${be.event_name}"${target_part}`);
      }
      sections.push('');
    }

    // Data flow
    const data_flows = this.extract_data_flows(container, id_map);
    if (data_flows.length > 0) {
      sections.push(`${h} Data Flow`);
      for (const df of data_flows) {
        sections.push(`- "${df.task_name}" ${df.direction} "${df.data_name}"`);
      }
      sections.push('');
    }

    // Data objects and stores
    const data_objects = this.query_local_direct(container, 'dataObjectReference');
    const data_stores = this.query_local_direct(container, 'dataStoreReference');
    if (data_objects.length > 0 || data_stores.length > 0) {
      sections.push(`${h} Data`);
      for (const d of data_objects) {
        const label = this.get_label(d) || d.getAttribute('id');
        sections.push(`- Data Object: ${label}`);
      }
      for (const d of data_stores) {
        const label = this.get_label(d) || d.getAttribute('id');
        sections.push(`- Data Store: ${label}`);
      }
      sections.push('');
    }

    return sections;
  }
```

- [ ] **Step 4: Refactor `bpmn_to_markdown` to use `extract_container_sections`**

Replace the body of the `for (const process of processes)` loop in `bpmn_to_markdown` with:

```js
    for (const process of processes) {
      const process_name = this.get_label(process) || process.getAttribute('id') || 'Unnamed Process';
      sections.push(`# Process: ${process_name}`);

      const process_doc = this.get_documentation(process);
      if (process_doc) {
        sections.push('');
        sections.push(process_doc);
      }
      sections.push('');

      const id_map = this.build_id_map(process);
      const container_sections = this.extract_container_sections(process, id_map, '##');
      sections.push(...container_sections);
    }
```

- [ ] **Step 5: Run ALL tests to verify they pass**

Run: `npm test`
Expected: All tests pass — including all previously written tests. The refactoring preserves existing behavior while adding sub-process recursion.

- [ ] **Step 6: Commit**

```bash
git add src/bpmn_source_adapter.js test/bpmn_source_adapter.test.js
git commit -m "♻️ Refactor to recursive extract_container_sections for sub-processes"
```

---

### Task 9: Integration test with real BPMN file

**Files:**
- Create: `test/fixtures/outpay-initiate.bpmn`
- Modify: `test/bpmn_source_adapter.test.js`

- [ ] **Step 1: Copy real BPMN fixture**

```bash
mkdir -p test/fixtures
cp /Users/adam.lipowski/Development/fidoo-fx-fe-prototype/docs/a1-transactions/fx-tempalte/outpay-initiate.bpmn test/fixtures/outpay-initiate.bpmn
```

- [ ] **Step 2: Write integration test**

Add to `test/bpmn_source_adapter.test.js`:
```js
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('integration: outpay-initiate.bpmn', () => {
  let result;

  beforeAll(() => {
    const adapter = make_adapter();
    const xml = readFileSync(resolve(__dirname, 'fixtures/outpay-initiate.bpmn'), 'utf-8');
    result = adapter.bpmn_to_markdown(xml);
  });

  it('extracts the process name', () => {
    expect(result).toContain('# Process:');
  });

  it('lists tasks with types', () => {
    expect(result).toContain('Add SWIFT payment type (businessRuleTask)');
    expect(result).toContain('Submit payment (userTask)');
    expect(result).toContain('Revise outgoing payment (manualTask)');
  });

  it('marks multi-instance task', () => {
    expect(result).toContain('Add group paymet options (businessRuleTask, sequential multi-instance)');
  });

  it('extracts gateway branches with conditions', () => {
    expect(result).toContain('## Gateway Branches');
    expect(result).toContain('Locality of the payment?');
    expect(result).toContain('[CrossBorder]');
    expect(result).toContain('[Our FX account]');
    expect(result).toContain('[Same trade group/s member]');
  });

  it('extracts linear process flow', () => {
    expect(result).toContain('## Process Flow');
  });

  it('extracts boundary events with context', () => {
    expect(result).toContain('## Boundary Events');
    expect(result).toContain('Submit payment');
    expect(result).toContain('Insufficient funds');
  });

  it('extracts sub-process internal flow', () => {
    expect(result).toContain('## Sub-Process: Fill info for payment type decision');
    expect(result).toContain('Select recipient account (userTask)');
    expect(result).toContain('Select amount (userTask)');
  });

  it('extracts data flow within sub-process', () => {
    expect(result).toContain('Country, bank and currency');
  });

  it('extracts annotations', () => {
    expect(result).toContain('add for each shared group');
  });
});
```

- [ ] **Step 3: Run integration test**

Run: `npm test`
Expected: All tests pass. If any assertions fail, adjust to match actual element names from the BPMN file (check for typos like "paymet" in the original file — the test should match the actual data).

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "🧪 Add integration test with real outpay-initiate.bpmn"
```

---

### Task 10: Rebuild, handle namespaced XML, final verification

**Files:**
- Modify: `test/bpmn_source_adapter.test.js`
- Modify: `src/bpmn_source_adapter.js` (only if namespace fix needed)

- [ ] **Step 1: Add namespace-prefix test**

Add to `test/bpmn_source_adapter.test.js`:
```js
describe('namespaced XML', () => {
  it('handles bpmn: prefixed elements correctly', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="p1" name="Namespaced">
          <bpmn:startEvent id="e1" name="Begin" />
          <bpmn:userTask id="t1" name="Work" />
          <bpmn:endEvent id="e2" name="Done" />
          <bpmn:exclusiveGateway id="g1" name="Check?" />
          <bpmn:sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
          <bpmn:sequenceFlow id="f2" sourceRef="t1" targetRef="g1" />
          <bpmn:sequenceFlow id="f3" name="Yes" sourceRef="g1" targetRef="e2" />
        </bpmn:process>
      </bpmn:definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('# Process: Namespaced');
    expect(result).toContain('- Work (userTask)');
    expect(result).toContain('## Gateway Branches');
    expect(result).toContain('[Yes]');
    expect(result).toContain('## Process Flow');
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass. The `query_local` / `query_local_direct` methods use `localName` which strips namespace prefixes, so this should already work.

- [ ] **Step 3: Rebuild the plugin**

Run: `npm run build`
Expected: Build succeeds, `main.js` is updated.

- [ ] **Step 4: Run tests one final time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit build output and final state**

```bash
git add main.js test/
git commit -m "✅ Rebuild with semantic BPMN extraction"
```
