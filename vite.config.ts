import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Emits dist/sw.js with a precache list of everything in dist, versioned by content hash.
function serviceWorker(): Plugin {
  let out = 'dist';
  return {
    name: 'marbles-sw',
    apply: 'build',
    configResolved(c) {
      out = c.build.outDir;
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
        );
      const files = walk(out).filter((f) => !f.endsWith('sw.js'));
      const hash = createHash('sha1');
      for (const f of files) hash.update(f).update(readFileSync(f));
      const assets = files.map((f) => './' + relative(out, f).split('\\').join('/'));
      const template = readFileSync('src/sw.template.js', 'utf8');
      hash.update(template);
      const sw = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
        .replace('__ASSETS__', JSON.stringify(assets));
      writeFileSync(join(out, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [serviceWorker()],
});
