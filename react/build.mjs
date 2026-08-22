// Generates the JavaScript variant and the shadcn registry items from the one
// hand-maintained source, so they cannot drift apart:
//
//   Marble.tsx  (source)  ->  Marble.jsx
//   both                  ->  registry/Marble-TS.json, registry/Marble-JS.json
//
//   node react/build.mjs
//
// This file is .mjs, not .js, on purpose: there is no package.json in this
// repository, so Node reads a plain .js file as CommonJS and `import` would be a
// syntax error. The .mjs extension is what selects ES modules here.
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Newlines are normalised on the way in: a CRLF checkout would otherwise bake
// \r\n into the registry JSON and read as drift everywhere else.
const read = p => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const write = (p, s) => {
  mkdirSync(dirname(join(here, p)), { recursive: true });
  writeFileSync(join(here, p), s);
  console.log('wrote', p);
};

// ---- TypeScript -> JavaScript ----------------------------------------------
// A type-stripper rather than a compiler, to keep the tooling light. It
// handles the annotation forms this component actually uses, and assertNoTypes
// below rejects the residue patterns a partial strip leaves behind. That is a net,
// not a proof: it cannot be complete without a real parser, so if you introduce a
// TypeScript construct that is not already in this file, check the generated
// Marble.jsx by eye once.
function toJavaScript(src, file) {
  let out = src;

  // Type-only import specifiers: `, type CSSProperties`.
  out = out.replace(/,\s*type [A-Za-z][\w]*/g, '');

  // Whole type aliases and interface blocks, with the blank line after them.
  out = out.replace(/^export type [\s\S]*?;\n\n?/gm, '');
  out = out.replace(/^(?:export )?interface [A-Za-z][\w]* \{[\s\S]*?^\}\n\n?/gm, '');

  // Generic type arguments on hooks: useRef<T>( -> useRef(
  out = out.replace(/\b(useRef|useState|useMemo|useCallback)<[^>()]*>\(/g, '$1(');

  // Annotated declarations: `const X: T =` / `let x: T =`
  out = out.replace(/^(\s*(?:const|let|var) [A-Za-z_][\w]*): [^=\n]+ =/gm, '$1 =');

  // Arrow signatures, with a return type and without.
  out = out.replace(
    /\(([^()]*)\)\s*:\s*[A-Za-z][\w.]*(?:\[\])?(?:\s*\|\s*[A-Za-z][\w.]*(?:\[\])?)*\s*=>/g,
    (m, params) => `(${stripParams(params)}) =>`
  );
  out = out.replace(/\(([^()]*)\)\s*=>/g, (m, params) => `(${stripParams(params)}) =>`);

  // Function declarations: function f(a: T, b?: U): R {
  out = out.replace(
    /^(\s*(?:export default |export )?function [A-Za-z][\w]*)\(([^()]*)\)\s*:\s*[A-Za-z][\w.]*(?:\[\])?\s*\{/gm,
    (m, head, params) => `${head}(${stripParams(params)}) {`
  );

  // The destructured props signature: `}: MarbleProps) {`
  out = out.replace(/^\}: [A-Za-z][\w]*\) \{/gm, '}) {');

  // `x as T` assertions, including `as T<U>` and `as T[]`. Consuming the generic
  // arguments matters: stripping only the name would leave a bare `<U>` behind,
  // which is invalid JavaScript that still looks plausible.
  out = out.replace(/ as [A-Za-z][\w.]*(?:<[^<>]*>)?(?:\[\])?/g, '');

  // A single parameter no longer needs its parens once the annotation is gone,
  // which is the style the rest of this component is written in.
  out = out.replace(/\(([A-Za-z_][\w]*)\)\s*=>/g, '$1 =>');

  assertNoTypes(out, file);
  return out;
}

// Strips `: Type` and the `?` from each parameter. Only touches lists with no
// nested parens or braces, which covers every signature in this component.
function stripParams(params) {
  if (!params.trim() || /[{}()]/.test(params)) return params;
  return params
    .split(',')
    .map(p => p.replace(/^(\s*[A-Za-z_][\w]*)\??\s*:\s*.+$/, '$1'))
    .join(',');
}

const LEFTOVERS = [
  [/\binterface\s+[A-Z]/, 'interface declaration'],
  [/^export type /m, 'type alias'],
  [/\btype [A-Z]\w*\s*=/, 'type alias'],
  [/:\s*(?:string|number|boolean|Uint8Array|CSSProperties|HTMLDivElement|Texture|Marble[A-Za-z]*)\b/, 'type annotation'],
  [/\)\s*:\s*[A-Za-z][\w.\[\]]*\s*(?:=>|\{)/, 'return-type annotation'],
  [/\b(?:useRef|useState|useMemo|useCallback)</, 'generic hook argument'],
  [/ as [A-Z]/, 'type assertion'],
  [/\)\s*</, 'generic argument after a call'],
  [/[A-Za-z0-9_\)\]]\s*<[A-Za-z_][\w]*\s*[,>]/, 'generic type argument'],
  [/\bimplements\b|\bdeclare\b|\bnamespace\b|\benum\b/, 'TypeScript-only keyword']
];

function assertNoTypes(out, file) {
  for (const [re, what] of LEFTOVERS) {
    const m = out.match(re);
    if (m) {
      const line = out.slice(0, m.index).split('\n').length;
      throw new Error(
        `${file}: ${what} survived type-stripping at line ${line}: ${JSON.stringify(m[0])}.\n` +
          'Extend toJavaScript() in react/build.mjs to handle it.'
      );
    }
  }
}

// ---- outputs ---------------------------------------------------------------
const tsSource = read('Marble.tsx');
const jsSource = toJavaScript(tsSource, 'Marble.tsx');
write('Marble.jsx', jsSource);

const DESCRIPTION =
  'An animated marble background: iterated sine/cosine domain warp sampled through a colour ramp.';

const items = [
  { name: 'Marble-TS', file: 'Marble/Marble.tsx', content: tsSource },
  { name: 'Marble-JS', file: 'Marble/Marble.jsx', content: jsSource }
];

for (const item of items) {
  write(
    `registry/${item.name}.json`,
    JSON.stringify(
      {
        $schema: 'https://ui.shadcn.com/schema/registry-item.json',
        name: item.name,
        title: 'Marble',
        description: DESCRIPTION,
        type: 'registry:component',
        files: [{ type: 'registry:component', path: item.file, content: item.content }],
        registryDependencies: [],
        dependencies: ['ogl@^1.0.11']
      },
      null,
      2
    ) + '\n'
  );
}
