export type Word = { text: string; em: boolean; br?: boolean };

/**
 * Tiny markup for headlines: *italic* spans and \n hard breaks.
 * "Pay only what you can *trace home.*" -> words with an italic flag.
 */
export function parseHeadline(src: string): Word[] {
  const out: Word[] = [];
  src.split("\n").forEach((line, li, lines) => {
    line.split("*").forEach((seg, i) => {
      seg
        .split(/\s+/)
        .filter(Boolean)
        .forEach((w) => out.push({ text: w, em: i % 2 === 1 }));
    });
    if (li < lines.length - 1) out.push({ text: "", em: false, br: true });
  });
  return out;
}

export const plain = (src: string) => src.replace(/\*/g, "").replace(/\n/g, " ");

/** Group word elements into visual lines by their rendered offsetTop. */
export function groupLines(els: HTMLElement[]): HTMLElement[][] {
  const lines: HTMLElement[][] = [];
  let last = -9999;
  els.forEach((el) => {
    const top = Math.round(el.offsetTop / 4);
    if (lines.length === 0 || Math.abs(top - last) > 2) {
      lines.push([]);
      last = top;
    }
    lines[lines.length - 1].push(el);
  });
  return lines;
}
