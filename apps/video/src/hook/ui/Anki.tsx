import { fade } from "./primitives";

/**
 * Anki's deck browser (f174).
 *
 * The toolbar, the Deck / New / Due table and the blue Study Now button are
 * what identify Anki instantly. The `::` subdeck syntax is Anki-specific and
 * costs nothing to get right.
 */

const BLUE = "#2f6fb0";

const decks = [
  { name: "SAT Math", indent: 0, due: 43, fresh: 12 },
  { name: "Advanced Geometry", indent: 1, due: 31, fresh: 8 },
  { name: "Circles & Parabolas", indent: 1, due: 12, fresh: 4 },
  { name: "Reading & Writing", indent: 0, due: 0, fresh: 0 },
];

export const AnkiUI: React.FC<{ local: number }> = ({ local }) => {
  const shown = fade(local, 3, 12);

  return (
    <div
      style={{
        height: "100%",
        backgroundColor: "#ffffff",
        opacity: shown,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 14,
          justifyContent: "center",
          padding: "7px 0",
          borderBottom: "1px solid #e6e6e3",
          fontSize: 10,
          color: "#4a4a47",
        }}
      >
        {["Decks", "Add", "Browse", "Stats", "Sync"].map((item) => (
          <span key={item} style={{ fontWeight: item === "Decks" ? 600 : 400, color: item === "Decks" ? "#1c1c1a" : "#6b6b67" }}>
            {item}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: "9px 12px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 30px 30px",
            fontSize: 8.5,
            color: "#8d8d89",
            paddingBottom: 4,
            borderBottom: "1px solid #ededea",
          }}
        >
          <span>Deck</span>
          <span style={{ textAlign: "right" }}>New</span>
          <span style={{ textAlign: "right" }}>Due</span>
        </div>

        {decks.map((deck) => (
          <div
            key={deck.name}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 30px 30px",
              alignItems: "center",
              padding: "5px 0",
              fontSize: 10,
              color: "#2b2b29",
              borderBottom: "1px solid #f4f4f2",
            }}
          >
            <span style={{ paddingLeft: deck.indent * 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {deck.name}
            </span>
            <span style={{ textAlign: "right", color: deck.fresh ? "#2f6fb0" : "#c2c2be" }}>{deck.fresh}</span>
            <span style={{ textAlign: "right", color: deck.due ? "#c0392b" : "#c2c2be" }}>{deck.due}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 12px 12px", display: "grid", justifyItems: "center", gap: 6 }}>
        <div
          style={{
            padding: "6px 20px",
            borderRadius: 5,
            backgroundColor: BLUE,
            color: "#ffffff",
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          Study Now
        </div>
        <span style={{ fontSize: 8.5, color: "#8d8d89" }}>Studied 0 cards in 0 minutes today.</span>
      </div>
    </div>
  );
};
