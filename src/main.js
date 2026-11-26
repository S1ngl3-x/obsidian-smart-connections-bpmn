import { Plugin } from 'obsidian';
import { register_bpmn_adapter, index_bpmn_files } from './register.js';

export default class SmartConnectionsBpmnPlugin extends Plugin {

  onload() {
    // Register before SmartEnv loads. SmartEnv scans the vault files one time, on layout ready.
    const timer = window.setInterval(() => {
      if (this.sync_with_env()) window.clearInterval(timer);
    }, 100);
    this.registerInterval(timer);
    this.sync_with_env();
  }

  // Returns true when no more work remains.
  sync_with_env() {
    const env = window.smart_env;
    if (!env) return false;
    if (!this.registered) {
      register_bpmn_adapter(this, env);
      this.registered = true;
      console.log('Smart Connections BPMN: Registered .bpmn adapter');
    }
    if (env.state === 'load_error') return true;
    if (env.state !== 'loaded') return false;
    index_bpmn_files(env).catch((err) => console.error('Smart Connections BPMN: Index of .bpmn files failed', err));
    return true;
  }

  onunload() {
    window.smart_env?.unload_main?.(this);
    console.log('Smart Connections BPMN: Unloaded');
  }
}
