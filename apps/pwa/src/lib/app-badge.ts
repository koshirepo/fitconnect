/** Set the app badge count (e.g., pending payments) */
export async function setAppBadge(count: number) {
  if (!("setAppBadge" in navigator)) return;
  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
    } else {
      await navigator.clearAppBadge();
    }
  } catch {
    // Silently ignore — not all browsers support this
  }
}
