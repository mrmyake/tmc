export async function sendNotification(title, message, tags) {
  globalThis.__lifecycleTest.notifications.push({ title, message, tags });
  return true;
}
