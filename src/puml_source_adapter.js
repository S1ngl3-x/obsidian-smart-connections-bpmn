import { FileTextSourceContentAdapter } from './file_text_source_adapter.js';

// Lines that set layout or style. They carry no meaning for the embedding.
const NOISE_LINE = /^(@end\w+|!|skinparam\b|hide\b|show\b|scale\b|(left to right|top to bottom) direction\b)/;
// Example: Business_Process(e2, "Initiate withdrawal")
const MACRO_ALIAS = /^\w+\(\s*(\w+)\s*,\s*"([^"]+)"/;
// Example: actor "Account Owner" as owner
const LABEL_AS_ALIAS = /"([^"]+)"\s+as\s+(\w+)/;
// Example: usecase UC1 as "Export invoices"
const ALIAS_AS_LABEL = /\b(\w+)\s+as\s+"([^"]+)"/;
// Free text until "end note" or "endlegend". Example start: "note right of e2" or "legend".
const TEXT_BLOCK_START = /^(legend\b|note\b(?!.*[:"])|(title|header|footer)$)/;
const TEXT_BLOCK_END = /^end ?(legend|note|title|header|footer)\b/;

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
    let skinparam_depth = 0;
    let in_style = false;
    let in_text_block = false;
    for (const line of this.statements(raw)) {
      if (in_style) {
        in_style = line !== '</style>';
        continue;
      }
      if (skinparam_depth) {
        if (line.endsWith('{')) skinparam_depth++;
        else if (line === '}') skinparam_depth--;
        continue;
      }
      if (in_text_block) {
        in_text_block = !TEXT_BLOCK_END.test(line);
        lines.push({ text: line, keep: true });
        continue;
      }
      if (line === '<style>') in_style = true;
      else if (/^skinparam\b.*\{$/.test(line)) skinparam_depth = 1;
      if (in_style || skinparam_depth || NOISE_LINE.test(line)) continue;
      const start = line.match(/^@start\w+\s*(.*)$/);
      if (start) {
        if (start[1]) lines.push({ text: `# ${start[1].replace(/"/g, '')}`, keep: true });
        continue;
      }
      const [, alias, label] = line.match(MACRO_ALIAS) || line.match(ALIAS_AS_LABEL) || [];
      const [, as_label, as_alias] = alias ? [] : line.match(LABEL_AS_ALIAS) || [];
      if (alias || as_alias) labels.set(alias || as_alias, (label || as_label).replace(/\\n/g, ' '));
      in_text_block = TEXT_BLOCK_START.test(line);
      lines.push({ text: line, keep: !!(alias || as_alias) || line.startsWith("'") });
    }
    if (!labels.size) return lines.map((line) => line.text).join('\n');
    // A quoted string matches first, so an alias in quotes stays.
    const alias_re = new RegExp(`"[^"]*"|\\b(${[...labels.keys()].join('|')})\\b`, 'g');
    return lines
      .map(({ text, keep }) => {
        if (keep) return text;
        // Text after " : " is a free label. Example: active --> hard : hard block
        const colon = text.indexOf(' : ');
        const head = colon < 0 ? text : text.slice(0, colon);
        return head.replace(alias_re, (match, alias) => (alias ? `"${labels.get(alias)}"` : match)) + text.slice(head.length);
      })
      .join('\n');
  }

  // Trimmed non-empty lines. A line with an open quote joins the next lines.
  statements(raw) {
    const result = [];
    let open = '';
    for (const raw_line of raw.split('\n')) {
      const line = open ? `${open} ${raw_line.trim()}` : raw_line.trim();
      const is_open = !line.startsWith("'") && (line.match(/"/g) || []).length % 2 === 1;
      open = is_open ? line : '';
      if (line && !is_open) result.push(line);
    }
    if (open) result.push(open);
    return result;
  }
}
