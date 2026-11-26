import { describe, it, expect } from 'vitest';
import { register_bpmn_adapter, index_bpmn_files } from '../src/register.js';
import { BpmnSourceContentAdapter } from '../src/bpmn_source_adapter.js';

// Mirrors the SmartEnv shape of Smart Connections 4.7.2 (obsidian-smart-env 3.1.1).
function make_env() {
  class SourceBase { get_outlinks() { return ['from-base']; } }
  class FileBase extends SourceBase { static async init_items() {} }
  class CanvasAdapter extends FileBase {}
  class SmartEnv {
    static version = '3.1.1';
    static added = [];
    static add_main(main, opts) { this.added.push({ main, opts }); }
    config = { collections: { smart_sources: { source_adapters: { canvas: CanvasAdapter } } } };
  }
  return { env: new SmartEnv(), SmartEnv, FileBase };
}

describe('register_bpmn_adapter', () => {
  it('declares the host SmartEnv version, so the env does not drop the config as outdated', () => {
    const { env, SmartEnv } = make_env();
    register_bpmn_adapter({}, env);
    expect(SmartEnv.added[0].opts.version).toBe('3.1.1');
    expect(SmartEnv.added[0].opts.collections.smart_sources.source_adapters.bpmn).toBe(BpmnSourceContentAdapter);
  });

  it('links the adapter to the host file adapter base class', () => {
    const { env, FileBase } = make_env();
    register_bpmn_adapter({}, env);
    const adapter = new BpmnSourceContentAdapter({});
    expect(adapter).toBeInstanceOf(FileBase);
    expect(adapter.get_outlinks()).toEqual(['from-base']);
    expect(typeof BpmnSourceContentAdapter.init_items).toBe('function');
    expect(adapter.embed_input_action_key).toBe('source_get_embed_input_markdown');
  });
});

describe('index_bpmn_files', () => {
  it('creates a source for each .bpmn file and runs the load queue once', async () => {
    const created = [];
    let imports = 0;
    const smart_sources = {
      _source_adapters: { md: {} },
      items: {},
      fs: { files: { 'a.bpmn': {}, 'b.md': {}, 'dir/c.bpmn': {} } },
      init_file_path(path) { created.push(path); this.items[path] = {}; },
      async process_load_queue() { imports++; },
    };
    await index_bpmn_files({ smart_sources });
    expect(created).toEqual(['a.bpmn', 'dir/c.bpmn']);
    expect(smart_sources._source_adapters).toBeNull();
    expect(imports).toBe(1);

    smart_sources.items['a.bpmn']._source_adapter = 'adapter of the old plugin class';
    await index_bpmn_files({ smart_sources });
    expect(imports).toBe(1);
    expect(smart_sources.items['a.bpmn']._source_adapter).toBeNull();
  });
});
