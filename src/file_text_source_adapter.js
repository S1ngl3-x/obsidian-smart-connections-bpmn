/**
 * FileTextSourceContentAdapter
 *
 * Shared base for adapters that turn a text file into markdown for embedding.
 * Overrides FileSourceContentAdapter from smart-sources without importing it.
 * register.js links the two classes at runtime, so no external dependencies are needed.
 * A subclass sets `static extensions` and implements to_markdown(raw).
 */

export class FileTextSourceContentAdapter {
  constructor(item) {
    this.item = item;
  }

  get data() { return this.item.data; }
  get fs() { return this.item.collection.fs; }
  get file_path() { return this.item.file_path; }
  get env() { return this.item.env; }

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

  // SmartSource.get_embed_input() throws without this key. read() already returns markdown.
  get embed_input_action_key() { return 'source_get_embed_input_markdown'; }

  get outdated() { return this.should_import; }

  /**
   * MurmurHash3 32-bit (alphanumeric output).
   * Matches the upstream smart-sources hashing convention.
   */
  create_hash(content) {
    let h = 0x971e137b;
    const len = content.length;
    for (let i = 0; i < len; i++) {
      let k = content.charCodeAt(i);
      k = (k * 0xcc9e2d51) >>> 0;
      k = (k << 15) | (k >>> 17);
      k = (k * 0x1b873593) >>> 0;
      h ^= k;
      h = (h << 13) | (h >>> 19);
      h = ((h * 5) + 0xe6546b64) >>> 0;
    }
    h ^= len;
    h ^= h >>> 16;
    h = (h * 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = (h * 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0).toString(36);
  }

  /**
   * Read the raw file content from disk.
   */
  async _read_raw() {
    try {
      const content = await this.fs.read(this.file_path);
      if (typeof content !== 'string') return '';
      return content;
    } catch (err) {
      console.warn(`FileTextSourceContentAdapter: Error reading ${this.file_path}:`, err);
      return '';
    }
  }

  /**
   * Read the file and transform it into markdown.
   * This is what gets embedded and displayed in the connections sidebar.
   */
  async read(opts = {}) {
    const raw = await this._read_raw();
    if (!raw) return '';

    const markdown = this.to_markdown(raw);

    if (!opts.no_hash) {
      this.data.last_read = {
        hash: this.create_hash(markdown),
        at: Date.now(),
        size: markdown.length,
      };
    }

    return markdown;
  }

  /**
   * Import the file — called by the smart-sources processing pipeline.
   * Parses metadata, extracts outlinks, and marks the file as imported.
   */
  async import() {
    if (!this.item.file) {
      console.warn(`FileTextSourceContentAdapter: Skipping missing file: ${this.file_path}`);
      return;
    }

    // Read raw content once, derive both markdown and outlinks from it
    const raw = await this._read_raw();
    if (!raw) return;

    const markdown = this.to_markdown(raw);
    const hash = this.create_hash(markdown);

    if (!this.data.last_read) this.data.last_read = {};
    this.data.last_read.hash = hash;
    this.data.last_read.at = Date.now();
    this.data.last_read.size = markdown.length;

    // Skip re-import if content hasn't changed
    if (
      this.data.last_import?.hash === hash
      && Array.isArray(this.data.outlinks)
    ) {
      return;
    }

    this.data.outlinks = this.extract_outlinks(raw);

    const file_stat = this.item.file?.stat;
    const size = file_stat?.size ?? markdown.length;
    const mtime = file_stat?.mtime ?? 0;

    this.data.last_import = {
      mtime,
      size,
      at: Date.now(),
      hash,
    };

    this.item.loaded_at = Date.now();
    this.item.queue_save();
  }

  to_markdown(raw) { return raw; }

  extract_outlinks(raw) { return []; }
}
