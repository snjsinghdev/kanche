// Run by Deno: `deno run --allow-read src/deno-runner.js <bundle> <seeds> <steps>`.
// Plain JavaScript so Deno runs exactly the bundled bytes with no TypeScript step of its own.
const [bundle, seeds, steps] = Deno.args;
const { runHarness } = await import(new URL(`file://${bundle}`).href);
const start = performance.now();
const result = runHarness(Number(seeds), Number(steps));
console.log(JSON.stringify({ version: Deno.version.deno, result, ms: performance.now() - start }));
