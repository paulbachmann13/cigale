// Échoue si une dépendance de production est sous licence GPL/AGPL/SSPL (sans alternative permissive) ou « Pro ».
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const paths = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
const bad = [];
let n = 0;
for (const p of paths) {
  const file = `${p}/package.json`;
  if (!existsSync(file) || p.endsWith('/cigale')) continue;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const lic = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license ?? pkg.licenses ?? 'INCONNUE');
  n++;
  const copyleft = /(^|[^L])GPL|AGPL|SSPL/i.test(lic);
  const permissive = /MIT|Apache|BSD|ISC/i.test(lic);
  if ((copyleft && !permissive) || /pro\b/i.test(pkg.name) || lic === '"INCONNUE"') bad.push(`${pkg.name}@${pkg.version} : ${lic}`);
}
console.log(`${n} dépendances de production vérifiées.`);
if (bad.length) {
  console.error('Licences interdites ou inconnues :\n' + bad.join('\n'));
  process.exit(1);
}
