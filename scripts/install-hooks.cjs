// Hooks are opt-in so installing a nested Git submodule never changes its parent hooks.
if (process.env.LISTEN1_INSTALL_HOOKS === '1') {
  import('husky').then(({ default: install }) =>
    process.stdout.write(install() || '')
  );
}
