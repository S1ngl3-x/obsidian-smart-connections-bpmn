import { Plugin } from 'obsidian';
import { register_adapters, index_files } from './register.js';

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
      register_adapters(this, env);
      this.registered = true;
      console.log('Smart Connections BPMN: Registered .bpmn and .puml adapters');
    }
    if (env.state === 'load_error') return true;
    if (env.state !== 'loaded') return false;
    index_files(env).catch((err) => console.error('Smart Connections BPMN: Index of files failed', err));
    return true;
  }

  onunload() {
    window.smart_env?.unload_main?.(this);
    console.log('Smart Connections BPMN: Unloaded');
  }
}
