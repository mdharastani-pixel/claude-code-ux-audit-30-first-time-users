/**
 * Baut aus index.html, styles.css und den js/-Dateien eine einzige HTML-Datei,
 * die sich verschicken, hosten oder als Artifact veröffentlichen lässt.
 *
 *   node fitness-app/build-single-file.mjs            → fittrack.html
 *   node fitness-app/build-single-file.mjs --body out.html   (ohne <html>/<head>/<body>)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const bodyOnly = process.argv.includes('--body');
const outArg = process.argv.find((a, i) => i > 1 && !a.startsWith('--'));
const out = outArg || join(root, '..', bodyOnly ? 'fittrack-body.html' : 'fittrack.html');

const html = read('index.html');
const css = read('styles.css');
const scripts = ['js/data.js', 'js/store.js', 'js/charts.js', 'js/app.js']
  .map((p) => '/* ' + p + ' */\n' + read(p))
  .join('\n');

const markup = html
  .replace(/<link rel="stylesheet" href="styles\.css">/, '<style>\n' + css + '\n</style>')
  .replace(/\n?\s*<script src="js\/[^"]+"><\/script>/g, '')
  .replace(/<\/body>/, '<script>\n' + scripts + '\n</script>\n</body>');

if (!bodyOnly) {
  writeFileSync(out, markup);
} else {
  // Nur der Inhalt: <title>, Schriften, <style> und das Markup aus <body>.
  // Wrapper wie <html>, <head> und <body> setzt die Zielumgebung selbst.
  const pick = (re) => (markup.match(re) || []).join('\n');
  const head = [
    pick(/<title>[\s\S]*?<\/title>/),
    pick(/<link rel="preconnect"[^>]*>/g),
    pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/),
    pick(/<style>[\s\S]*?<\/style>/)
  ].filter(Boolean).join('\n');
  const body = markup.match(/<body>([\s\S]*?)<\/body>/)[1];
  writeFileSync(out, head + '\n' + body.trim() + '\n');
}

console.log('geschrieben: ' + out);
