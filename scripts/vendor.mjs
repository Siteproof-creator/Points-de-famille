// Copie dans www/ les fichiers venus de npm : la bibliothèque Supabase et les polices.
// L'application n'a ainsi besoin d'aucun site externe pour s'afficher.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
mkdirSync(join(root, 'www/vendor'), { recursive: true });
mkdirSync(join(root, 'www/fonts'), { recursive: true });

const umd = join(nm, '@supabase/supabase-js/dist/umd/supabase.js');
if (!existsSync(umd)) {
  console.error('Fichier introuvable : ' + umd + '\nLance d’abord :  npm install');
  process.exit(1);
}
copyFileSync(umd, join(root, 'www/vendor/supabase.js'));
console.log('OK  www/vendor/supabase.js');

for (const pkg of ['figtree', 'bricolage-grotesque']) {
  const file = `${pkg}-latin-wght-normal.woff2`;
  const from = join(nm, '@fontsource-variable', pkg, 'files', file);
  if (existsSync(from)) { copyFileSync(from, join(root, 'www/fonts', file)); console.log('OK  www/fonts/' + file); }
  else console.warn('Police absente (' + pkg + ') : la police du système sera utilisée.');
}
