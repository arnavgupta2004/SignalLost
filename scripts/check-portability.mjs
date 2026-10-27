import fs from 'node:fs';

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!entry.resolved) continue;
  const url = new URL(entry.resolved);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'registry.npmjs.org' ||
    url.username ||
    url.password
  ) {
    throw new Error(`Dependency ${name} must resolve through the public npm registry.`);
  }
  if (!entry.integrity) throw new Error(`Dependency ${name} has no integrity hash.`);
}
console.log('Dependency lockfile is portable and integrity-pinned.');
