/** One-shot "fonts are in, page may perform its entrance" signal, shared by every reveal. */
export function markReady() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (el.dataset.ready) return;
  el.dataset.ready = "1";
  window.dispatchEvent(new Event("lineage:ready"));
}

export function onReady(cb: () => void): () => void {
  if (document.documentElement.dataset.ready) {
    cb();
    return () => {};
  }
  const h = () => cb();
  window.addEventListener("lineage:ready", h, { once: true });
  return () => window.removeEventListener("lineage:ready", h);
}
