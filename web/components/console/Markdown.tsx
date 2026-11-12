import type { ReactNode } from "react";

/** Renders the small markdown subset the benchmark report uses: headings, bullets, tables, paragraphs, `code` and **bold**. */

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const OUTCOMES = new Set(["LOST", "safe", "ok", "FALSE-BLOCK"]);

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const Tag = (`h${level}` as "h1" | "h2" | "h3");
      out.push(<Tag key={i}>{inline(line.replace(/^#+ /, ""))}</Tag>);
      i++;
    } else if (line.trim().startsWith("|") && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push(
        <div className="tablewrap" key={i}>
          <table>
            <thead>
              <tr>{head.map((h, c) => <th key={c} scope="col">{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className={OUTCOMES.has(c) ? `cell-${c}` : undefined}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].replace(/^[-*] /, ""));
      out.push(<ul key={i}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |[-*] |\|)/.test(lines[i])) para.push(lines[i++]);
      out.push(<p key={i}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="report">{out}</div>;
}
