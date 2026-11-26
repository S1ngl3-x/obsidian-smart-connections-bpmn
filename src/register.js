import { BpmnSourceContentAdapter } from './bpmn_source_adapter.js';

// The host bundles FileSourceContentAdapter. Example chain: CanvasSourceContentAdapter -> FileSourceContentAdapter.
function host_file_adapter(env) {
  const canvas = env.config?.collections?.smart_sources?.source_adapters?.canvas;
  const base = canvas && Object.getPrototypeOf(canvas);
  return typeof base?.init_items === 'function' ? base : null;
}

export function register_bpmn_adapter(main, env) {
  const SmartEnv = env.constructor;
  const base = host_file_adapter(env);
  if (base) {
    Object.setPrototypeOf(BpmnSourceContentAdapter, base);
    Object.setPrototypeOf(BpmnSourceContentAdapter.prototype, base.prototype);
  } else {
    console.warn('Smart Connections BPMN: FileSourceContentAdapter not found. The adapter runs without its base class.');
  }
  // SmartEnv drops a config with a version below its minimum. Example: "2.4.0" < "3.0.0".
  SmartEnv.add_main(main, {
    version: SmartEnv.version,
    collections: {
      smart_sources: {
        source_adapters: {
          bpmn: BpmnSourceContentAdapter,
        },
      },
    },
  });
}

// The host scans files one time at load. This call adds .bpmn files after a late registration.
export async function index_bpmn_files(env) {
  const sources = env.smart_sources;
  if (!sources) return;
  sources._source_adapters = null;
  const paths = Object.keys(sources.fs.files).filter((path) => path.toLowerCase().endsWith('.bpmn'));
  // A plugin reload leaves sources with an adapter of the old class.
  paths.forEach((path) => { if (sources.items[path]) sources.items[path]._source_adapter = null; });
  const new_paths = paths.filter((path) => !sources.items[path]);
  if (!new_paths.length) return;
  new_paths.forEach((path) => sources.init_file_path(path));
  sources.mark_embed_queue_dirty?.();
  // Loads saved data first. An import without it erases the saved embedding references.
  await sources.process_load_queue();
}
