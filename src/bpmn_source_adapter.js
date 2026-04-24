/**
 * BpmnSourceContentAdapter
 *
 * A self-contained source content adapter for .bpmn files.
 * Implements the same interface as FileSourceContentAdapter from smart-sources
 * without extending it, so no external dependencies are needed.
 *
 * Parses BPMN 2.0 XML and produces structured markdown for embedding and display.
 */

export class BpmnSourceContentAdapter {
  static extensions = ['bpmn'];
  static GATEWAY_TYPES = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway'];
  static TASK_TYPES = ['task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'sendTask', 'receiveTask', 'businessRuleTask'];

  constructor(item) {
    this.item = item;
  }

  get data() { return this.item.data; }
  get fs() { return this.item.collection.fs; }
  get file_path() { return this.item.file_path; }
  get env() { return this.item.env; }

  get size() {
    if (this.data?.last_read?.size) return this.data.last_read.size;
    return this.item.file?.stat?.size ?? 0;
  }

  get should_import() {
    if (!this.item.file) return false;
    const last_import = this.data.last_import;
    if (!last_import) return true;
    const file_mtime = this.item.file?.stat?.mtime ?? 0;
    return file_mtime > (last_import.mtime ?? 0);
  }

  get can_import() {
    return !!this.item.file;
  }

  /**
   * MurmurHash3 32-bit (alphanumeric output).
   * Matches the upstream smart-sources hashing convention.
   */
  create_hash(content) {
    let h = 0x971e137b;
    const len = content.length;
    for (let i = 0; i < len; i++) {
      let k = content.charCodeAt(i);
      k = (k * 0xcc9e2d51) >>> 0;
      k = (k << 15) | (k >>> 17);
      k = (k * 0x1b873593) >>> 0;
      h ^= k;
      h = (h << 13) | (h >>> 19);
      h = ((h * 5) + 0xe6546b64) >>> 0;
    }
    h ^= len;
    h ^= h >>> 16;
    h = (h * 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = (h * 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0).toString(36);
  }

  /**
   * Read the raw file content from disk.
   */
  async _read_raw() {
    try {
      const content = await this.fs.read(this.file_path);
      if (typeof content !== 'string') return '';
      return content;
    } catch (err) {
      console.warn(`BpmnSourceContentAdapter: Error reading ${this.file_path}:`, err);
      return '';
    }
  }

  /**
   * Read and transform BPMN XML into structured markdown.
   * This is what gets embedded and displayed in the connections sidebar.
   */
  async read(opts = {}) {
    const raw = await this._read_raw();
    if (!raw) return '';

    const markdown = this.bpmn_to_markdown(raw);

    if (!opts.no_hash) {
      this.data.last_read = {
        hash: this.create_hash(markdown),
        at: Date.now(),
        size: markdown.length,
      };
    }

    return markdown;
  }

  /**
   * Import the BPMN file — called by the smart-sources processing pipeline.
   * Parses metadata, extracts outlinks, and marks the file as imported.
   */
  async import() {
    if (!this.item.file) {
      console.warn(`BpmnSourceContentAdapter: Skipping missing file: ${this.file_path}`);
      return;
    }

    // Read raw content once, derive both markdown and outlinks from it
    const raw = await this._read_raw();
    if (!raw) return;

    const markdown = this.bpmn_to_markdown(raw);
    const hash = this.create_hash(markdown);

    if (!this.data.last_read) this.data.last_read = {};
    this.data.last_read.hash = hash;
    this.data.last_read.at = Date.now();
    this.data.last_read.size = markdown.length;

    // Skip re-import if content hasn't changed
    if (
      this.data.last_import?.hash === hash
      && Array.isArray(this.data.outlinks)
    ) {
      return;
    }

    this.data.outlinks = this.extract_outlinks_from_doc(this.parse_xml(raw));

    const file_stat = this.item.file?.stat;
    const size = file_stat?.size ?? markdown.length;
    const mtime = file_stat?.mtime ?? 0;

    this.data.last_import = {
      mtime,
      size,
      at: Date.now(),
      hash,
    };

    this.item.loaded_at = Date.now();
    this.item.queue_save();
  }

  // ---------------------------------------------------------------------------
  // BPMN XML Parsing
  // ---------------------------------------------------------------------------

  /**
   * Parse BPMN XML string into a DOM Document.
   */
  parse_xml(xml_string) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml_string, 'application/xml');
      if (doc.querySelector('parsererror')) {
        console.warn('BpmnSourceContentAdapter: XML parse error for', this.file_path);
        return null;
      }
      return doc;
    } catch (err) {
      console.warn('BpmnSourceContentAdapter: Failed to parse XML:', err);
      return null;
    }
  }

  /**
   * Query elements by local name (ignores namespace prefixes).
   */
  query_local(doc_or_el, local_name) {
    return Array.from(doc_or_el.querySelectorAll('*')).filter(
      el => el.localName === local_name
    );
  }

  /**
   * Get the name attribute or text content label for a BPMN element.
   */
  get_label(el) {
    return el.getAttribute('name')?.trim() || '';
  }

  /**
   * Get documentation text nested inside a BPMN element.
   */
  get_documentation(el) {
    const docs = this.query_local(el, 'documentation');
    return docs.map(d => d.textContent?.trim()).filter(Boolean).join('\n');
  }

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

  /**
   * Extract gateway branching information from a container.
   * Returns Map<gateway_id, { name, type, branches: [{ condition, target_name, target_type }] }>
   */
  extract_gateway_branches(container, id_map) {
    const gateways = new Map();

    for (const type of BpmnSourceContentAdapter.GATEWAY_TYPES) {
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
        event_kind: event_kind || 'unknown',
        target_name: target?.name || '',
      });
    }

    return results;
  }

  /**
   * Extract data associations between tasks and data objects.
   * Returns [{ task_name, data_name, direction: 'produces'|'consumes' }]
   */
  extract_data_flows(container, id_map) {
    const results = [];
    // Includes subProcess because sub-processes can have data associations,
    // unlike TASK_TYPES which excludes subProcess (listed separately in sections)
    const task_types = [...BpmnSourceContentAdapter.TASK_TYPES, 'subProcess'];

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
    const tasks = [];
    for (const type of BpmnSourceContentAdapter.TASK_TYPES) {
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
    const gateways = [];
    for (const type of BpmnSourceContentAdapter.GATEWAY_TYPES) {
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

  /**
   * Convert BPMN XML to structured markdown.
   */
  bpmn_to_markdown(xml_string) {
    const doc = this.parse_xml(xml_string);
    if (!doc) return xml_string; // fallback: return raw content

    const sections = [];
    const processes = this.query_local(doc, 'process');

    if (processes.length === 0) {
      // Try collaboration/participant names as fallback
      const participants = this.query_local(doc, 'participant');
      if (participants.length > 0) {
        sections.push('# BPMN Collaboration');
        sections.push('');
        sections.push('## Participants');
        for (const p of participants) {
          const label = this.get_label(p);
          if (label) sections.push(`- ${label}`);
        }
        sections.push('');
      }
    }

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

    // Text annotations (outside processes, in the collaboration or definitions level)
    const annotations = this.query_local(doc, 'textAnnotation');
    if (annotations.length > 0) {
      sections.push('## Annotations');
      for (const ann of annotations) {
        const text_el = this.query_local(ann, 'text')[0];
        const text = text_el?.textContent?.trim();
        if (text) sections.push(`- "${text}"`);
      }
      sections.push('');
    }

    const result = sections.join('\n').trim();
    return result || '(Empty BPMN file)';
  }

  /**
   * Extract outlinks from a parsed BPMN DOM document.
   * Looks for documentation text that contains [[wiki-links]] to vault notes.
   */
  extract_outlinks_from_doc(doc) {
    if (!doc) return [];

    const links = [];
    const docs = this.query_local(doc, 'documentation');

    for (const d of docs) {
      const text = d.textContent || '';
      const wiki_re = /\[\[([^\]]+)\]\]/g;
      let match;
      while ((match = wiki_re.exec(text)) !== null) {
        const target = match[1].split('|')[0].trim(); // handle [[target|alias]]
        links.push({ target, title: target, line: 1 });
      }
    }

    return links;
  }
}
