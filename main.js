/*! obsidian-smart-connections-bpmn v0.1.0 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.js
var main_exports = {};
__export(main_exports, {
  default: () => SmartConnectionsBpmnPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/bpmn_source_adapter.js
var BpmnSourceContentAdapter = class {
  constructor(item) {
    this.item = item;
  }
  get data() {
    return this.item.data;
  }
  get fs() {
    return this.item.collection.fs;
  }
  get file_path() {
    return this.item.file_path;
  }
  get env() {
    return this.item.env;
  }
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
    let h = 2535330683;
    const len = content.length;
    for (let i = 0; i < len; i++) {
      let k = content.charCodeAt(i);
      k = k * 3432918353 >>> 0;
      k = k << 15 | k >>> 17;
      k = k * 461845907 >>> 0;
      h ^= k;
      h = h << 13 | h >>> 19;
      h = h * 5 + 3864292196 >>> 0;
    }
    h ^= len;
    h ^= h >>> 16;
    h = h * 2246822507 >>> 0;
    h ^= h >>> 13;
    h = h * 3266489909 >>> 0;
    h ^= h >>> 16;
    return (h >>> 0).toString(36);
  }
  /**
   * Read the raw file content from disk.
   */
  async _read_raw() {
    try {
      const content = await this.fs.read(this.file_path);
      if (typeof content !== "string") return "";
      return content;
    } catch (err) {
      console.warn(`BpmnSourceContentAdapter: Error reading ${this.file_path}:`, err);
      return "";
    }
  }
  /**
   * Read and transform BPMN XML into structured markdown.
   * This is what gets embedded and displayed in the connections sidebar.
   */
  async read(opts = {}) {
    const raw = await this._read_raw();
    if (!raw) return "";
    const markdown = this.bpmn_to_markdown(raw);
    if (!opts.no_hash) {
      this.data.last_read = {
        hash: this.create_hash(markdown),
        at: Date.now(),
        size: markdown.length
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
    const raw = await this._read_raw();
    if (!raw) return;
    const markdown = this.bpmn_to_markdown(raw);
    const hash = this.create_hash(markdown);
    if (!this.data.last_read) this.data.last_read = {};
    this.data.last_read.hash = hash;
    this.data.last_read.at = Date.now();
    this.data.last_read.size = markdown.length;
    if (this.data.last_import?.hash === hash && Array.isArray(this.data.outlinks)) {
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
      hash
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
      const doc = parser.parseFromString(xml_string, "application/xml");
      if (doc.querySelector("parsererror")) {
        console.warn("BpmnSourceContentAdapter: XML parse error for", this.file_path);
        return null;
      }
      return doc;
    } catch (err) {
      console.warn("BpmnSourceContentAdapter: Failed to parse XML:", err);
      return null;
    }
  }
  /**
   * Query elements by local name (ignores namespace prefixes).
   */
  query_local(doc_or_el, local_name) {
    return Array.from(doc_or_el.querySelectorAll("*")).filter(
      (el) => el.localName === local_name
    );
  }
  /**
   * Get the name attribute or text content label for a BPMN element.
   */
  get_label(el) {
    return el.getAttribute("name")?.trim() || "";
  }
  /**
   * Get documentation text nested inside a BPMN element.
   */
  get_documentation(el) {
    const docs = this.query_local(el, "documentation");
    return docs.map((d) => d.textContent?.trim()).filter(Boolean).join("\n");
  }
  /**
   * Convert BPMN XML to structured markdown.
   */
  bpmn_to_markdown(xml_string) {
    const doc = this.parse_xml(xml_string);
    if (!doc) return xml_string;
    const sections = [];
    const processes = this.query_local(doc, "process");
    if (processes.length === 0) {
      const participants = this.query_local(doc, "participant");
      if (participants.length > 0) {
        sections.push("# BPMN Collaboration");
        sections.push("");
        sections.push("## Participants");
        for (const p of participants) {
          const label = this.get_label(p);
          if (label) sections.push(`- ${label}`);
        }
        sections.push("");
      }
    }
    for (const process of processes) {
      const process_name = this.get_label(process) || process.getAttribute("id") || "Unnamed Process";
      sections.push(`# Process: ${process_name}`);
      const process_doc = this.get_documentation(process);
      if (process_doc) {
        sections.push("");
        sections.push(process_doc);
      }
      sections.push("");
      const task_types = ["task", "userTask", "serviceTask", "scriptTask", "manualTask", "sendTask", "receiveTask", "businessRuleTask"];
      const tasks = [];
      for (const type of task_types) {
        tasks.push(...this.query_local(process, type));
      }
      if (tasks.length > 0) {
        sections.push("## Tasks");
        for (const task of tasks) {
          const label = this.get_label(task) || task.getAttribute("id");
          const type_label = task.localName === "task" ? "" : ` (${task.localName})`;
          const doc2 = this.get_documentation(task);
          sections.push(`- ${label}${type_label}`);
          if (doc2) sections.push(`  ${doc2}`);
        }
        sections.push("");
      }
      const sub_processes = this.query_local(process, "subProcess");
      if (sub_processes.length > 0) {
        sections.push("## Sub-Processes");
        for (const sp of sub_processes) {
          const label = this.get_label(sp) || sp.getAttribute("id");
          const doc2 = this.get_documentation(sp);
          sections.push(`- ${label}`);
          if (doc2) sections.push(`  ${doc2}`);
        }
        sections.push("");
      }
      const event_types = [
        "startEvent",
        "endEvent",
        "intermediateCatchEvent",
        "intermediateThrowEvent",
        "boundaryEvent"
      ];
      const events = [];
      for (const type of event_types) {
        events.push(...this.query_local(process, type).map((el) => ({ el, type })));
      }
      if (events.length > 0) {
        sections.push("## Events");
        for (const { el, type } of events) {
          const label = this.get_label(el) || el.getAttribute("id");
          const event_kind = type.replace("Event", "").replace(/([A-Z])/g, " $1").trim();
          sections.push(`- ${event_kind}: ${label}`);
        }
        sections.push("");
      }
      const gateway_types = ["exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway"];
      const gateways = [];
      for (const type of gateway_types) {
        gateways.push(...this.query_local(process, type).map((el) => ({ el, type })));
      }
      if (gateways.length > 0) {
        sections.push("## Gateways");
        for (const { el, type } of gateways) {
          const label = this.get_label(el) || el.getAttribute("id");
          const gw_kind = type.replace("Gateway", "").replace(/([A-Z])/g, " $1").trim();
          sections.push(`- ${gw_kind}: ${label}`);
        }
        sections.push("");
      }
      const data_objects = this.query_local(process, "dataObjectReference");
      const data_stores = this.query_local(process, "dataStoreReference");
      if (data_objects.length > 0 || data_stores.length > 0) {
        sections.push("## Data");
        for (const d of data_objects) {
          const label = this.get_label(d) || d.getAttribute("id");
          sections.push(`- Data Object: ${label}`);
        }
        for (const d of data_stores) {
          const label = this.get_label(d) || d.getAttribute("id");
          sections.push(`- Data Store: ${label}`);
        }
        sections.push("");
      }
      const flows = this.query_local(process, "sequenceFlow");
      const named_flows = flows.filter((f) => this.get_label(f));
      if (named_flows.length > 0) {
        sections.push("## Flow Conditions");
        for (const flow of named_flows) {
          const label = this.get_label(flow);
          sections.push(`- ${label}`);
        }
        sections.push("");
      }
    }
    const annotations = this.query_local(doc, "textAnnotation");
    if (annotations.length > 0) {
      sections.push("## Annotations");
      for (const ann of annotations) {
        const text_el = this.query_local(ann, "text")[0];
        const text = text_el?.textContent?.trim();
        if (text) sections.push(`- "${text}"`);
      }
      sections.push("");
    }
    const result = sections.join("\n").trim();
    return result || "(Empty BPMN file)";
  }
  /**
   * Extract outlinks from a parsed BPMN DOM document.
   * Looks for documentation text that contains [[wiki-links]] to vault notes.
   */
  extract_outlinks_from_doc(doc) {
    if (!doc) return [];
    const links = [];
    const docs = this.query_local(doc, "documentation");
    for (const d of docs) {
      const text = d.textContent || "";
      const wiki_re = /\[\[([^\]]+)\]\]/g;
      let match;
      while ((match = wiki_re.exec(text)) !== null) {
        const target = match[1].split("|")[0].trim();
        links.push({ target, title: target, line: 1 });
      }
    }
    return links;
  }
};
__publicField(BpmnSourceContentAdapter, "extensions", ["bpmn"]);

// src/main.js
var SmartConnectionsBpmnPlugin = class extends import_obsidian.Plugin {
  onload() {
    this.app.workspace.onLayoutReady(() => {
      this.register_adapter();
    });
  }
  register_adapter() {
    const env = window.smart_env;
    if (!env) {
      console.warn(
        "Smart Connections BPMN: SmartEnv not found. Make sure Smart Connections is installed and enabled."
      );
      return;
    }
    const SmartEnv = env.constructor;
    SmartEnv.add_main(this, {
      version: "2.4.0",
      collections: {
        smart_sources: {
          source_adapters: {
            bpmn: BpmnSourceContentAdapter
          }
        }
      }
    });
    console.log("Smart Connections BPMN: Registered .bpmn adapter");
  }
  onunload() {
    window.smart_env?.unload_main?.(this);
    console.log("Smart Connections BPMN: Unloaded");
  }
};
