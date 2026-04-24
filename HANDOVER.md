# Handover: Unfinished Work and Known Compromises

## Status
Plugin scaffolded, builds, registers with SmartEnv without errors. **Not yet verified end-to-end** — never confirmed BPMN files actually appear in the connections sidebar.

## Unpushed work
- One local commit fixing the README (commented out missing showcase.png). Review and push when ready.

## Known compromises

### 1. Duck-typed adapter (biggest risk)
The `BpmnSourceContentAdapter` reimplements the `FileSourceContentAdapter` interface from scratch instead of extending it. This was done to avoid depending on the `smart-sources` package (which requires cloning the jsbrains monorepo).

**Risk:** The smart-sources pipeline may call methods or access properties we didn't implement. The code review caught `should_import`, `can_import`, and `size` — those were added. But there could be others we don't know about.

**Mitigation:** If things break, the first step is to compare our adapter's interface against `smart-sources/adapters/_file.js` in the jsbrains repo.

### 2. `read()` return type unverified
Our `read()` returns a plain string. The code review flagged that some upstream code paths might expect `{ content: string }` or similar. Not verified.

### 3. Hash function is a reimplementation
We wrote our own MurmurHash3 instead of importing `murmur_hash_32_alphanumeric` from `smart-utils`. The output may differ from the upstream implementation. Hashes are only compared internally (last_import vs last_read), so this is low risk — but it's a deviation.

### 4. Registration approach is non-standard
All official companion plugins (Smart Chat, Smart Lookup, Smart Context) import `SmartEnv` from `obsidian-smart-env` and call `SmartEnv.create(this, config)` in `onload()`. We can't do this because we don't have `obsidian-smart-env` as a dependency. Instead, we access `window.smart_env.constructor` on `onLayoutReady` and call `add_main()`.

This works but is fragile — it depends on:
- Smart Connections loading before `onLayoutReady` fires (so `window.smart_env` exists)
- The `add_main()` call happening before SmartEnv finishes loading (otherwise late registrations are rejected and the user must restart Obsidian)

### 5. BPMN text extraction is structural, not semantic
The adapter extracts element names and types into structured markdown. It does **not** capture:
- Flow relationships ("Task A is followed by Task B")
- Conditional logic from gateway branches
- Lane/pool assignments ("Task X is performed by Role Y")
- Loop/multi-instance semantics
- Data associations (which data objects feed which tasks)

This means the embeddings capture *what's in the process* but not *how it flows*. For deeper semantic matching, the markdown output could be enriched with flow descriptions.

### 6. No tests
Zero test coverage. The `bpmn_to_markdown()` function is pure (XML string in, markdown string out) and very testable. Priority test cases:
- Real BPMN files from the vault (outpay-initiate.bpmn, etc.)
- Namespaced XML (bpmn:process vs process)
- Empty/malformed BPMN
- BPMN with documentation containing [[wiki-links]]

### 7. No showcase screenshot
README has a commented-out image reference. Take a screenshot of the connections sidebar showing a BPMN file in results, save as `assets/showcase.png`, uncomment the line in README.

## Vault for testing
The test vault is at `/Users/adam.lipowski/Development/fidoo-fx-fe-prototype/`. It has ~10 real .bpmn files under `docs/a1-transactions/`. The plugin is installed at `.obsidian/plugins/smart-connections-bpmn/`.

## Key upstream references
- [smart-sources/adapters/_file.js](https://github.com/brianpetro/jsbrains/blob/main/smart-sources/adapters/_file.js) — the base class we're duck-typing
- [canvas.js adapter](https://github.com/brianpetro/obsidian-smart-env/blob/main/adapters/smart-sources/canvas.js) — simplest real adapter to compare against
- [SmartEnv.config getter](https://github.com/brianpetro/jsbrains/blob/main/smart-environment/smart_env.js) — requires `version` field in opts, minor >= 4
