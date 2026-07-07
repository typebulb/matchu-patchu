// Publish guard: abort `npm publish`, allow `pnpm publish`.
// npm does not rewrite workspace:^ dependencies at pack time, so publishing
// with npm ships an uninstallable package (this happened: matchu-patchu-mcp@0.2.3).
const ua = process.env.npm_config_user_agent ?? '';
if (!ua.startsWith('pnpm/')) {
  console.error('\n  ✖ Use `pnpm publish`, not `npm publish`.');
  console.error('    npm does not rewrite workspace:^ dependencies, so the published package would be uninstallable.\n');
  process.exit(1);
}
