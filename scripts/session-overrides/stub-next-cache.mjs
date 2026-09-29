// Stub voor next/cache buiten een Next-request (zie hooks.mjs).
export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_cache(fn) {
  return fn;
}
