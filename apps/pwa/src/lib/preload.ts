/** Preload a lazy route after idle to improve navigation speed */
export function preloadRoute(loader: () => Promise<unknown>) {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => loader());
  } else {
    setTimeout(() => loader(), 200);
  }
}
