import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'main.js',
  format: 'cjs',
  platform: 'browser',
  external: ['obsidian'],
  target: 'es2020',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  banner: {
    js: `/*! obsidian-smart-connections-bpmn v0.1.0 */`,
  },
}).catch(() => process.exit(1));
