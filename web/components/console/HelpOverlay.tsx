"use client";

import { Drawer } from "./Drawer";

const KEYS: [string, string][] = [
  ["R", "Run the selected scenario or your attack"],
  ["C", "Compare: same attack with no defense, then with lineage"],
  ["Space", "Play or pause the replay"],
  ["← →", "Step the replay"],
  ["?", "This help"],
  ["Esc", "Close a panel"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="Keyboard shortcuts" kicker="Console" onClose={onClose}>
      <dl className="keys">
        {KEYS.map(([k, d]) => (
          <div key={k}>
            <dt><kbd>{k}</kbd></dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
      <h3 className="in-h">How to read the graph</h3>
      <ul className="help-list">
        <li>Left: every fragment of information that reached the agent, coloured by trust tier. T3 owner, T2 trusted record, T1 known sender (spoofable), T0 untrusted.</li>
        <li>Centre: the guard. It runs outside the model and sees the exact arguments of the payment call.</li>
        <li>Threads: red where the payee traces back to an untrusted source, green where it is grounded in a trusted record. Hover a fragment to follow its threads.</li>
        <li>Right: what actually happened to the money, and on which rail.</li>
      </ul>
    </Drawer>
  );
}
