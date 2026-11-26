import { describe, it, expect } from 'vitest';
import { FileTextSourceContentAdapter } from '../src/file_text_source_adapter.js';

function make_item(data) {
  const item = {
    data,
    file: { stat: { mtime: 2, size: 5 } },
    file_path: 'a.puml',
    collection: { fs: { read: async () => 'new text' } },
    embed_queued: 0,
    queue_embed() { this.embed_queued++; },
    queue_save() {},
  };
  return item;
}

describe('FileTextSourceContentAdapter.import', () => {
  it('queues an embed when the content hash changes', async () => {
    const item = make_item({ last_import: { hash: 'old', mtime: 1 }, outlinks: [] });
    await new FileTextSourceContentAdapter(item).import();
    expect(item.embed_queued).toBe(1);
    expect(item.data.last_import.hash).toBe(item.data.last_read.hash);
  });

  it('does not queue an embed when the content hash is the same', async () => {
    const item = make_item({ outlinks: [] });
    const adapter = new FileTextSourceContentAdapter(item);
    item.data.last_import = { hash: adapter.create_hash('new text'), mtime: 1 };
    await adapter.import();
    expect(item.embed_queued).toBe(0);
  });
});
