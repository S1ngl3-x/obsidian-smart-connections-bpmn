import { Plugin } from 'obsidian';
import { BpmnSourceContentAdapter } from './bpmn_source_adapter.js';

export default class SmartConnectionsBpmnPlugin extends Plugin {

  onload() {
    // SmartEnv stores its instance on window.smart_env (the global_ref pattern).
    // Wait for layout ready — same pattern as upstream companion plugins.
    this.app.workspace.onLayoutReady(() => {
      this.register_adapter();
    });
  }

  register_adapter() {
    const env = window.smart_env;
    if (!env) {
      console.warn(
        'Smart Connections BPMN: SmartEnv not found. '
        + 'Make sure Smart Connections is installed and enabled.'
      );
      return;
    }

    // Use SmartEnv.add_main() to merge our adapter config into the environment.
    // version must be included — the config getter requires it and checks minor >= 4.
    const SmartEnv = env.constructor;
    SmartEnv.add_main(this, {
      version: "2.4.0",
      collections: {
        smart_sources: {
          source_adapters: {
            bpmn: BpmnSourceContentAdapter,
          },
        },
      },
    });

    console.log('Smart Connections BPMN: Registered .bpmn adapter');
  }

  onunload() {
    window.smart_env?.unload_main?.(this);
    console.log('Smart Connections BPMN: Unloaded');
  }
}
