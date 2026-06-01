export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('./lib/sentry');
    initSentry();

    const { validateStartup } = await import('./lib/config/startup');
    validateStartup();
  }
}
