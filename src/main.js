import { Plugin } from 'obsidian';
import { register_bpmn_adapter, index_bpmn_files } from './register.js';

export default class SmartConnectionsBpmnPlugin extends Plugin {

  onload() {
    // Register before SmartEnv loads. SmartEnv scans the vault files one time, on layout ready.
    if (this.register_adapter()) return;
    const timer = window.setInterval(() => {
      if (this.register_adapter()) window.clearInterval(timer);
    }, 100);
    this.registerInterval(timer);
  }

  register_adapter() {
    const env = window.smart_env;
    if (!env) return false;

    register_bpmn_adapter(this, env);
    env.constructor.wait_for().then(index_bpmn_files);

    console.log('Smart Connections BPMN: Registered .bpmn adapter');
    return true;
  }

  onunload() {
    window.smart_env?.unload_main?.(this);
    console.log('Smart Connections BPMN: Unloaded');
  }
}
