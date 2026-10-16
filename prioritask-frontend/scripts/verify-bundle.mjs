#!/usr/bin/env node
/**
 * Puerta de CI anti-fuga del bundle de producción (H1/H2 hardening).
 *
 * Recorre `dist/` y falla (exit 1) si encuentra:
 *   - archivos `*.map` (sourcemaps),
 *   - `sourceMappingURL` dentro de `*.js` / `*.css` / `*.html`,
 *   - `localhost:8000`, `127.0.0.1` o `file://` dentro de `*.js` / `*.css` / `*.html`.
 *
 * Nota: se usa `localhost:8000` (no `localhost` a secas) para no dar falso
 * positivo con los fallbacks benignos de React Router / Axios (`http://localhost`).
 *
 * Sin dependencias: solo módulos nativos de Node.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST_DIR = 'dist';
const SCANNABLE = /\.(js|css|html)$/i;

/** Patrones prohibidos dentro de los assets de texto. */
const FORBIDDEN = [
  { label: 'endpoint de desarrollo', re: /localhost:8000/g },
  { label: 'loopback de desarrollo', re: /127\.0\.0\.1/g },
  { label: 'path de archivo local', re: /file:\/\//g },
  { label: 'sourceMappingURL', re: /sourceMappingURL/g },
];

const toPosix = (p) => p.split(sep).join('/');

let distExists = true;
try {
  distExists = statSync(DIST_DIR).isDirectory();
} catch {
  distExists = false;
}

if (!distExists) {
  console.error(`❌ No se encontró el directorio "${DIST_DIR}/". Ejecuta "npm run build" antes de verify:bundle.`);
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else {
      files.push(full);
    }
  }
})(DIST_DIR);

const violations = [];

for (const file of files) {
  const rel = toPosix(relative('.', file));

  // 1) Cualquier archivo .map es una fuga de código fuente.
  if (/\.map$/i.test(file)) {
    violations.push(`${rel}: archivo sourcemap presente`);
    continue;
  }

  // 2) Inspección de texto solo en assets servibles.
  if (!SCANNABLE.test(file)) continue;

  const text = readFileSync(file, 'utf8');
  for (const { label, re } of FORBIDDEN) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length;
      violations.push(`${rel}:${line}: ${label} → "${match[0]}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(`❌ Bundle de producción no verificado (${violations.length} hallazgo(s)):`);
  for (const v of violations) console.error(`   - ${v}`);
  process.exit(1);
}

console.log(
  `✅ Bundle verificado: ${files.length} archivo(s) revisado(s), sin sourcemaps y sin host de desarrollo (localhost:8000 / 127.0.0.1 / file://).`
);
