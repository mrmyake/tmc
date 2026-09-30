export async function emitEvent(input) {
  globalThis.__lifecycleTest.events.push(input);
  return true;
}
