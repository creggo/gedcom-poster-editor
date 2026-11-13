// Runs every test: unit tests, the editor's browser suites against a dev server.
// usage: node scripts/run-all.mjs   (or: npm run test:all)
import { spawn } from 'node:child_process';
const run = (cmd, args, env = {}) => new Promise((res) => { let out = ''; const c = spawn(cmd, args, { env: { ...process.env, ...env } }); c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d)); c.on('close', (code) => res({ code, out })); });
const up = () => fetch('http://127.0.0.1:5199/').then((r) => r.ok, () => false);
let dev = null;
if (!(await up())) { dev = spawn('npx', ['vite', '--port', '5199', '--host', '127.0.0.1'], { stdio: 'ignore' }); for (let i = 0; i < 80 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250)); }
if (!(await up())) { console.error('could not start the dev server on :5199'); process.exit(1); }
const suites = ['scripts/test.ts', 'scripts/editor-test.mjs', 'scripts/tree-edit-test.mjs', 'scripts/photo-test.mjs', 'scripts/design-test.mjs', 'scripts/look-test.mjs', 'scripts/roots-test.mjs', 'scripts/distribute-test.mjs', 'scripts/sliders-test.mjs', 'scripts/firstrun-test.mjs', 'scripts/shell-test.mjs'];
let pass = 0, fail = 0, bad = [];
for (const s of suites) {
  const r = await run('node', [s]), ok = (r.out.match(/^ok /gm) ?? []).length, no = (r.out.match(/^FAIL/gm) ?? []).length;
  pass += ok; fail += no + (r.code ? 1 : 0);
  console.log(`${r.code === 0 && !no ? '✓' : '✗'} ${s.padEnd(30)} ${ok} passed${no ? `, ${no} FAILED` : ''}`);
  if (r.code !== 0 || no) { bad.push(s); console.log(r.out.split('\n').filter((l) => /FAIL|Error|error/.test(l)).slice(0, 8).join('\n')); }
}
dev?.kill();
console.log(`\n${pass} checks passed, ${fail} failed${bad.length ? ' in ' + bad.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
