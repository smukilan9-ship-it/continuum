/**
 * The thread — the one bespoke drawing on this page.
 *
 * It exists because the product's claim is structural and a screenshot cannot
 * carry it. Every screenshot shows one surface; the claim is about what runs
 * *between* the surfaces. So the left half shows five tools each holding a
 * fragment and connected to nothing, and the right half shows the same five
 * with one line passing through all of them and ending in a citation.
 *
 * It is a diagram, not decoration: those five are the real surfaces, and the
 * passage reference at the end is the thing the product actually returns.
 * Nothing here depicts a capability that does not exist.
 *
 * Drawn rather than animated into place. The travelling light rides a stroke
 * that is fully painted from first render, so a stalled or disabled animation
 * leaves a complete diagram rather than an empty frame — the same rule the rest
 * of the app's motion follows.
 */

/** One row per surface. `y` is the card's top edge in viewBox units. */
const NODES = [
  { label: "Library", y: 6 },
  { label: "Projects", y: 50 },
  { label: "Ask", y: 94 },
  { label: "Plan", y: 138 },
  { label: "Build", y: 182 },
] as const;

const CARD_H = 30;
const mid = (y: number) => y + CARD_H / 2;

/** The spine, bulging right between each knot so it reads as one woven line. */
const THREAD = NODES.map((node, index) => {
  const y = mid(node.y);
  if (index === 0) return `M10 ${y}`;
  return `C 46 ${mid(NODES[index - 1]!.y)}, 46 ${y}, 10 ${y}`;
}).join(" ") + ` C 46 ${mid(NODES[4]!.y)}, 46 239, 10 239 H 34`;

export function ThreadDiagram() {
  return (
    <figure className="mk-thread" aria-labelledby="mk-thread-caption">
      <div className="mk-thread-panel mk-thread-before">
        <p className="mk-thread-label">Today</p>
        <svg viewBox="0 0 200 258" role="img" aria-label="Five tools, each holding a fragment, connected to nothing." focusable="false">
          {NODES.map((node) => (
            <g key={node.label}>
              <rect x="12" y={node.y} width="138" height={CARD_H} rx="8" className="mk-thread-card" />
              <text x="26" y={mid(node.y) + 4} className="mk-thread-text">{node.label}</text>
              {/* A stub that goes nowhere. The point of the left panel. */}
              <path d={`M154 ${mid(node.y)} h20`} className="mk-thread-stub" />
              <circle cx="180" cy={mid(node.y)} r="2.5" className="mk-thread-dead" />
            </g>
          ))}
          <text x="12" y="243" className="mk-thread-nothing">no thread between them</text>
        </svg>
      </div>

      <div className="mk-thread-panel mk-thread-after">
        <p className="mk-thread-label">With Continuum</p>
        <svg viewBox="0 0 200 258" role="img" aria-label="The same five tools, joined by one thread that ends in a cited passage." focusable="false">
          {/* Painted first, so the cards sit on top and the line reads as
              passing behind them. */}
          <path className="mk-thread-line" d={THREAD} />
          <path className="mk-thread-line mk-thread-pulse" d={THREAD} />
          {NODES.map((node) => (
            <g key={node.label}>
              <rect x="34" y={node.y} width="138" height={CARD_H} rx="8" className="mk-thread-card mk-thread-card-live" />
              <text x="48" y={mid(node.y) + 4} className="mk-thread-text">{node.label}</text>
              <circle cx="10" cy={mid(node.y)} r="3.5" className="mk-thread-knot" />
            </g>
          ))}
          {/* Where the thread ends: something you can open. */}
          <rect x="34" y="226" width="138" height="26" rx="13" className="mk-thread-cite" />
          <text x="48" y="243" className="mk-thread-cite-text">passage 3 ↗</text>
        </svg>
      </div>

      <figcaption id="mk-thread-caption" className="sr-only">
        On the left, five tools each hold part of your work and none of them are connected. On the right, one thread runs
        through all five and ends in a citation you can open.
      </figcaption>
    </figure>
  );
}
