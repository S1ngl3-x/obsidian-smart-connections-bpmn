import { FileTextSourceContentAdapter } from './file_text_source_adapter.js';

// Lines that set layout or style. They carry no meaning for the embedding.
const NOISE_LINE = /^(@end\w+|!|skinparam\b|hide\b|show\b|scale\b|(left to right|top to bottom) direction\b)/;
// Opens a block to drop. Example: "skinparam class {" or "<style>".
const NOISE_BLOCK_START = /^(skinparam\b.*\{|<style>)$/;
const NOISE_BLOCK_END = /^(\}|<\/style>)$/;
// Example: Business_Process(e2, "Initiate withdrawal")
const MACRO_ALIAS = /^\w+\(\s*(\w+)\s*,\s*"([^"]+)"/;
// Example: actor "Account Owner" as owner
const AS_ALIAS = /"([^"]+)"\s+as\s+(\w+)/;

/**
 * PumlSourceContentAdapter
 *
 * A source content adapter for PlantUML files.
 * Removes layout and style lines and replaces aliases with labels.
 */
export class PumlSourceContentAdapter extends FileTextSourceContentAdapter {
  static extensions = ['puml', 'plantuml'];

  to_markdown(raw) {
    const lines = [];
    const labels = new Map();
    let in_noise_block = false;
    for (const raw_line of raw.split('\n')) {
      const line = raw_line.trim();
      if (in_noise_block) {
        if (NOISE_BLOCK_END.test(line)) in_noise_block = false;
        continue;
      }
      if (NOISE_BLOCK_START.test(line)) {
        in_noise_block = true;
        continue;
      }
      if (!line || NOISE_LINE.test(line)) continue;
      const start = line.match(/^@start\w+\s*(.*)$/);
      if (start) {
        if (start[1]) lines.push({ text: `# ${start[1]}`, defines_alias: true });
        continue;
      }
      const macro = line.match(MACRO_ALIAS);
      const as = line.match(AS_ALIAS);
      if (macro) labels.set(macro[1], macro[2]);
      else if (as) labels.set(as[2], as[1]);
      lines.push({ text: line, defines_alias: !!(macro || as) });
    }
    if (!labels.size) return lines.map((line) => line.text).join('\n');
    const alias_re = new RegExp(`\\b(${[...labels.keys()].join('|')})\\b`, 'g');
    return lines
      .map((line) => {
        if (line.defines_alias) return line.text;
        return line.text.replace(alias_re, (alias) => `"${labels.get(alias)}"`);
      })
      .join('\n');
  }
}
