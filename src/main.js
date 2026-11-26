import { Plugin } from 'obsidian';
import { register_bpmn_adapter, index_bpmn_files } from './register.js';

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

    register_bpmn_adapter(this, env);
    env.constructor.wait_for().then(index_bpmn_files);

    console.log('Smart Connections BPMN: Registered .bpmn adapter');
  }

  onunload() {
    window.smart_env?.unload_main?.(this);
    console.log('Smart Connections BPMN: Unloaded');
  }
}
