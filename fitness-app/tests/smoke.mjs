import { chromium } from 'playwright';

// Voraussetzung: die App wird lokal ausgeliefert, z. B. mit
//   npx http-server -p 8909 -s .   (im Wurzelverzeichnis des Repos)
const base = process.env.FITTRACK_URL || 'http://127.0.0.1:8909/fitness-app/index.html';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '—', e.message.split('\n')[0]); errors.push(name + ': ' + e.message.split('\n')[0]); }
};

await page.goto(base);
await page.waitForTimeout(300);

await step('Dashboard rendert', async () => {
  await page.waitForSelector('h1');
  const t = await page.textContent('h1');
  if (!/Guten/.test(t)) throw new Error('unerwartete Überschrift: ' + t);
});

await step('Leerzustand sichtbar', async () => {
  await page.waitForSelector('text=Noch kein Training aufgezeichnet');
});

await step('Freies Training starten', async () => {
  await page.click('[href="#/training"]');
  await page.click('[data-action="start-free"]');
  await page.waitForSelector('[data-elapsed]');
});

await step('Übung hinzufügen', async () => {
  await page.click('[data-action="add-exercise"]');
  await page.fill('[data-picker-search]', 'Bankdr');
  await page.click('[data-pick="bankdruecken"]');
  await page.waitForSelector('.exercise-block');
});

await step('Sätze eintragen und abhaken', async () => {
  const rows = page.locator('.set-table tbody tr');
  if (await rows.count() !== 3) throw new Error('erwartet 3 Standardsätze, sind ' + await rows.count());
  for (let i = 0; i < 3; i++) {
    await rows.nth(i).locator('input').nth(0).fill('60');
    await rows.nth(i).locator('input').nth(1).fill(String(10 - i));
    await rows.nth(i).locator('.check-btn').click();
  }
  await page.waitForSelector('.set-done');
});

await step('Pausentimer läuft', async () => {
  await page.waitForSelector('[data-rest]');
  const a = await page.textContent('[data-rest]');
  await page.waitForTimeout(1200);
  const b = await page.textContent('[data-rest]');
  if (a === b) throw new Error('Timer zählt nicht runter: ' + a);
});

await step('Zweite Übung + Satz hinzufügen', async () => {
  await page.click('[data-action="add-exercise"]');
  await page.click('[data-pick="latzug"]');
  await page.waitForTimeout(150);
  const blocks = page.locator('.exercise-block');
  if (await blocks.count() !== 2) throw new Error('erwartet 2 Blöcke');
  await blocks.nth(1).locator('[data-action="add-set"]').click();
  await page.waitForTimeout(150);
  if (await blocks.nth(1).locator('tbody tr').count() !== 4) throw new Error('Satz nicht ergänzt');
});

await step('Werte überleben einen Reload (localStorage)', async () => {
  await page.reload();
  await page.waitForTimeout(300);
  const val = await page.locator('.set-table tbody tr').first().locator('input').first().inputValue();
  if (val !== '60') throw new Error('Gewicht verloren: "' + val + '"');
});

await step('Training beenden speichert Einheit', async () => {
  await page.click('[data-action="finish-session"]');
  await page.waitForTimeout(300);
  const url = page.url();
  if (!/#\/verlauf\//.test(url)) throw new Error('keine Detailansicht: ' + url);
  await page.waitForSelector('text=Volumen');
});

await step('Volumen korrekt berechnet (60×10+60×9+60×8 = 1620)', async () => {
  const txt = await page.textContent('.stat-grid');
  if (!txt.includes('1.620')) throw new Error('Volumen fehlt in: ' + txt.replace(/\s+/g, ' ').slice(0, 200));
});

await step('Verlauf listet die Einheit', async () => {
  await page.click('[href="#/verlauf"]');
  await page.waitForSelector('.list .item');
});

await step('Plan starten', async () => {
  await page.goto(base + '#/plaene');
  await page.waitForTimeout(200);
  await page.click('[data-action="start-plan"][data-id="plan-push"]');
  await page.waitForSelector('[data-elapsed]');
  const n = await page.locator('.exercise-block').count();
  if (n !== 5) throw new Error('Push-Plan sollte 5 Übungen haben, hat ' + n);
});

await step('Vorschlagswerte aus letzter Einheit', async () => {
  const v = await page.locator('.exercise-block').first().locator('tbody tr').first().locator('input').first().inputValue();
  if (v !== '60') throw new Error('kein Vorschlag aus Historie: "' + v + '"');
});

await step('Training verwerfen', async () => {
  await page.click('[data-action="discard-session"]');
  await page.click('[data-yes]');
  await page.waitForSelector('[data-action="start-free"]');
});

await step('Eigenen Plan anlegen', async () => {
  await page.goto(base + '#/plaene');
  await page.waitForTimeout(200);
  await page.click('[data-action="new-plan"]');
  await page.fill('[data-name]', 'Mein Testplan');
  await page.click('[data-add]');
  await page.click('[data-pick="kniebeuge"]');
  await page.waitForTimeout(150);
  await page.click('[data-save]');
  await page.waitForTimeout(200);
  await page.waitForSelector('text=Mein Testplan');
});

await step('Eigene Übung anlegen', async () => {
  await page.goto(base + '#/uebungen');
  await page.waitForTimeout(200);
  await page.click('[data-action="new-exercise"]');
  await page.fill('[data-ex-name]', 'Landmine Press');
  await page.click('[data-save]');
  await page.waitForTimeout(200);
  await page.fill('[data-exercise-search]', 'Landmine');
  await page.waitForTimeout(200);
  const n = await page.locator('.list li').count();
  if (n !== 1) throw new Error('Suche liefert ' + n + ' Treffer');
});

await step('Filter nach Muskelgruppe', async () => {
  await page.fill('[data-exercise-search]', '');
  await page.waitForTimeout(150);
  await page.click('[data-muscle="Beine"]');
  await page.waitForTimeout(150);
  const txt = await page.textContent('.list');
  if (/Bankdrücken/.test(txt)) throw new Error('Filter greift nicht');
});

await step('Beispieldaten laden', async () => {
  await page.goto(base + '#/einstellungen');
  await page.waitForTimeout(200);
  await page.click('[data-action="demo"]');
  await page.click('[data-yes]');
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.Store.state.workouts.length);
  if (n < 30) throw new Error('nur ' + n + ' Demo-Einheiten');
});

await step('Fortschritt zeigt Diagramme und Bestwerte', async () => {
  await page.goto(base + '#/fortschritt');
  await page.waitForTimeout(300);
  const svgs = await page.locator('svg.chart').count();
  if (svgs < 2) throw new Error('nur ' + svgs + ' Diagramme');
  await page.waitForSelector('.data-table');
});

await step('Übungsdetail mit 1RM-Verlauf', async () => {
  await page.goto(base + '#/fortschritt/kniebeuge');
  await page.waitForTimeout(300);
  await page.waitForSelector('text=Aktuelles 1RM');
  const svgs = await page.locator('svg.chart').count();
  if (svgs < 2) throw new Error('Detail-Diagramme fehlen');
});

await step('Körpergewicht eintragen', async () => {
  await page.goto(base + '#/fortschritt');
  await page.waitForTimeout(250);
  await page.click('[data-action="add-bodyweight"]');
  await page.fill('[data-bw]', '79.4');
  await page.click('[data-save]');
  await page.waitForTimeout(250);
  const bw = await page.evaluate(() => window.Store.state.bodyweights.slice(-1)[0]);
  if (!bw || bw.kg !== 79.4) throw new Error('Gewicht nicht übernommen: ' + JSON.stringify(bw));
  if (!/Aktuell 79,4 kg/.test((await page.textContent('#view')).replace(/\s+/g, ' '))) throw new Error('Anzeige nicht aktualisiert');
});

await step('Export enthält Daten', async () => {
  await page.goto(base + '#/einstellungen');
  await page.waitForTimeout(200);
  await page.click('[data-action="export"]');
  const text = await page.inputValue('[data-export]');
  const parsed = JSON.parse(text);
  if (!parsed.workouts.length) throw new Error('Export ohne Einheiten');
  await page.click('[data-close]');
});

await step('Design umschalten', async () => {
  await page.click('#theme-toggle');
  await page.waitForTimeout(150);
  const attr = await page.getAttribute('html', 'data-theme');
  if (!attr) throw new Error('kein data-theme gesetzt');
});

await step('Alles löschen', async () => {
  await page.goto(base + '#/einstellungen');
  await page.waitForTimeout(200);
  await page.click('[data-action="reset"]');
  await page.click('[data-yes]');
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => window.Store.state.workouts.length);
  if (n !== 0) throw new Error('noch ' + n + ' Einheiten');
});

await step('Kein horizontales Scrollen (390 px)', async () => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error(over + ' px Überlauf');
});

// Screenshots
await page.evaluate(() => { window.Store.loadDemoData(); location.hash = '#/dashboard'; });
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshot-mobile-dashboard.png', fullPage: false });
await page.goto(base + '#/fortschritt');
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshot-mobile-fortschritt.png', fullPage: false });

const desk = await ctx.newPage();
await desk.setViewportSize({ width: 1280, height: 860 });
await desk.goto(base + '#/dashboard');
await desk.waitForTimeout(400);
await desk.screenshot({ path: 'screenshot-desktop-dashboard.png' });
await desk.goto(base + '#/training');
await desk.waitForTimeout(300);
await desk.evaluate(() => { window.Store.startSession('plan-push'); });
await desk.waitForTimeout(400);
await desk.screenshot({ path: 'screenshot-desktop-training.png' });

await browser.close();
console.log('\n--- Fehler: ' + errors.length + ' ---');
errors.forEach(e => console.log('  ' + e));
process.exit(errors.length ? 1 : 0);
