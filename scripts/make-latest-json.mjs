/**
 * Écrit latest.json, le fichier que l'application Mac lit pour savoir si une version plus récente existe
 * (Releases GitHub). Usage :
 *   node scripts/make-latest-json.mjs <version> <fichier.app.tar.gz.sig> <url de l'archive> [CHANGELOG.md] > latest.json
 * L'archive est universelle : la même entrée sert aux Mac Apple Silicon et Intel.
 */
import { readFileSync } from 'node:fs';

/** Texte de la section « ## [version] » du CHANGELOG (sans le titre), ou une phrase par défaut. */
export function notesFor(changelog, version) {
  const start = changelog.search(new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm'));
  if (start < 0) return `Cigale ${version}`;
  const rest = changelog.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => /^## \[/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim() || `Cigale ${version}`;
}

export function buildManifest({ version, signature, url, notes, date = new Date() }) {
  const platform = { signature: signature.trim(), url };
  return {
    version,
    notes,
    pub_date: date.toISOString(),
    platforms: { 'darwin-aarch64': platform, 'darwin-x86_64': platform },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [version, sigFile, url, changelogFile] = process.argv.slice(2);
  if (!version || !sigFile || !url) {
    console.error('Usage : node scripts/make-latest-json.mjs <version> <fichier.sig> <url> [CHANGELOG.md]');
    process.exit(1);
  }
  const notes = changelogFile ? notesFor(readFileSync(changelogFile, 'utf8'), version) : `Cigale ${version}`;
  process.stdout.write(`${JSON.stringify(buildManifest({ version, signature: readFileSync(sigFile, 'utf8'), url, notes }), null, 2)}\n`);
}
