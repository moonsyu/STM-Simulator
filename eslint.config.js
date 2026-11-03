import globals from 'globals';

// Mistakes that break a run rather than style: names used without being defined or imported (a missed import
// stopped every run in 1.11.0 until the E2E tests caught it), duplicate keys, assignments to constants or imports,
// and code that can never run.
const rules={
 'no-undef':'error','no-dupe-keys':'error','no-dupe-args':'error','no-dupe-else-if':'error','no-duplicate-case':'error',
 'no-const-assign':'error','no-import-assign':'error','no-func-assign':'error','no-class-assign':'error','no-redeclare':'error',
 'no-unreachable':'error','no-self-assign':'error','no-unsafe-finally':'error','no-unsafe-negation':'error','use-isnan':'error','valid-typeof':'error'
};
export default [
 {ignores:['docs/audits/**','node_modules/**','src/generated/**','work/**','outputs/**','dist/**','.cache/**','test-results/**']},
 {files:['src/**/*.js'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser}},rules},
 {files:['**/*.mjs','eslint.config.js','tests/**/*.js'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.node,...globals.browser}},rules},
 {files:['**/*.cjs'],languageOptions:{ecmaVersion:'latest',sourceType:'commonjs',globals:{...globals.node}},rules},
 {files:['desktop/preload.cjs','desktop/*-window.cjs'],languageOptions:{globals:{...globals.node,...globals.browser}}}
];
