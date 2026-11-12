const MONO = "ui-monospace,Menlo,monospace";

/** Original artwork: three letters on a desk, one stamped untrusted, one wax-sealed, one verified. */
export function HeroArt() {
  return (
    <svg
      className="art"
      viewBox="0 0 1000 400"
      role="img"
      aria-label="Three sealed letters on a desk: one stamped untrusted, one carrying a wax seal, one stamped verified"
    >
      <defs>
        <radialGradient id="wax" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#d2483a" />
          <stop offset=".55" stopColor="#9c1f17" />
          <stop offset="1" stopColor="#5e0f0b" />
        </radialGradient>
        <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fbf1d8" />
          <stop offset="1" stopColor="#e9d6ac" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#2b0a03" floodOpacity=".45" />
        </filter>
      </defs>

      <g className="threads" fill="none" stroke="#F2E5C8" strokeOpacity=".55" strokeWidth="1.4" strokeDasharray="3 6">
        <path d="M262 214 C 330 120 420 120 470 188" />
        <path d="M738 214 C 670 120 580 120 530 188" />
      </g>

      <g transform="translate(140,196) rotate(-9)" filter="url(#shadow)">
        <rect width="250" height="190" rx="6" fill="url(#paper)" />
        <g stroke="#8E826C" strokeOpacity=".55" strokeWidth="1.2">
          <path d="M24 54H190M24 76H220M24 98H176M24 120H206M24 142H150" />
        </g>
        <g transform="translate(120,20) rotate(6)">
          <rect width="104" height="30" rx="3" fill="none" stroke="#A3271A" strokeWidth="2.4" />
          <text x="52" y="20" textAnchor="middle" fontFamily={MONO} fontSize="12.5" fontWeight="700" fill="#A3271A" letterSpacing="1">
            T0 UNTRUSTED
          </text>
        </g>
        <text x="24" y="172" fontFamily="Georgia,serif" fontStyle="italic" fontSize="15" fill="#591709">
          We changed banks…
        </text>
      </g>

      <g transform="translate(375,160)" filter="url(#shadow)">
        <rect width="250" height="215" rx="6" fill="url(#paper)" />
        <g stroke="#8E826C" strokeOpacity=".5" strokeWidth="1.2">
          <path d="M26 40H224M26 62H200M26 84H224M26 106H178" />
        </g>
        <path d="M0 0 L125 96 L250 0" fill="none" stroke="#BCAE9A" strokeWidth="1.6" />
        <g transform="translate(125,98)">
          <path
            d="M0 -50 C 18 -56 38 -48 46 -32 C 58 -22 56 0 48 12 C 54 30 38 48 18 50 C 4 60 -16 56 -26 46 C -46 44 -56 24 -50 6 C -60 -12 -46 -36 -26 -42 C -18 -50 -8 -52 0 -50Z"
            fill="url(#wax)"
          />
          <circle r="32" fill="none" stroke="#e8786b" strokeOpacity=".5" strokeWidth="2" />
          <circle r="25" fill="none" stroke="#3d0805" strokeOpacity=".5" strokeWidth="1.5" />
          <path d="M-14 -13 C -3 -13 -3 0 14 0 M-14 0 H14 M-14 13 C -3 13 -3 0 14 0" fill="none" stroke="#f3b0a6" strokeWidth="3" strokeLinecap="round" />
          <circle cx="14" cy="0" r="3.4" fill="#f3b0a6" />
        </g>
        <text x="125" y="195" textAnchor="middle" fontFamily={MONO} fontSize="11.5" fill="#625542" letterSpacing="1.5">
          SEALED BY LINEAGE
        </text>
      </g>

      <g transform="translate(610,190) rotate(8)" filter="url(#shadow)">
        <rect width="250" height="190" rx="6" fill="url(#paper)" />
        <g stroke="#8E826C" strokeOpacity=".55" strokeWidth="1.2">
          <path d="M24 62H206M24 84H178M24 106H220M24 128H160" />
        </g>
        <g transform="translate(24,20)">
          <rect width="156" height="30" rx="3" fill="none" stroke="#2F5D3A" strokeWidth="2.4" />
          <text x="78" y="20" textAnchor="middle" fontFamily={MONO} fontSize="12.5" fontWeight="700" fill="#2F5D3A" letterSpacing="1">
            T2 VENDOR RECORD
          </text>
        </g>
        <path d="M184 150 l12 13 l26 -30" fill="none" stroke="#2F5D3A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
