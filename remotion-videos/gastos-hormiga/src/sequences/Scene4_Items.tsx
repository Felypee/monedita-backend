import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { BlushPlaceholder } from "../components/BlushIllustration";

interface ItemData {
  emoji: string;
  text: string;
  blushName: string;
  delay: number;
}

const items: ItemData[] = [
  { emoji: "☕", text: "Cafés", blushName: "coffee-cup", delay: 0 },
  { emoji: "🍫", text: "Snacks", blushName: "snack-food", delay: 15 },
  { emoji: "🛒", text: '"Solo $5"', blushName: "shopping-bag", delay: 30 },
];

export const Scene4_Items: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0a0a0a 0%, #0f0a05 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 50,
        padding: "100px 50px",
      }}
    >
      {items.map((item, index) => {
        const itemFrame = frame - item.delay;

        const scale = spring({
          frame: itemFrame,
          fps,
          config: { damping: 10, stiffness: 200 },
        });

        const slideX = interpolate(
          itemFrame,
          [0, 15],
          [index % 2 === 0 ? -100 : 100, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        if (itemFrame < 0) return null;

        return (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 30,
              transform: `scale(${Math.max(0, scale)}) translateX(${slideX}px)`,
              backgroundColor: "rgba(255,255,255,0.03)",
              padding: "25px 50px",
              borderRadius: 25,
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {/* Ilustración Blush placeholder */}
            <BlushPlaceholder
              name={item.blushName}
              emoji={item.emoji}
              width={120}
              height={120}
              style={{ border: "none", backgroundColor: "transparent" }}
            />
            {/*
            Cuando descargues de Blush, usa:
            <BlushIllustration
              src={`illustrations/${item.blushName}.png`}
              alt={item.text}
              width={120}
              height={120}
              animation="bounce"
            />
            */}

            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: "white",
              }}
            >
              {item.text}
            </div>
          </div>
        );
      })}

      {/* Texto inferior */}
      {frame > 60 && (
        <div
          style={{
            fontSize: 36,
            color: "rgba(255,255,255,0.4)",
            marginTop: 20,
            opacity: interpolate(frame, [60, 75], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          "pequeños gastos"
        </div>
      )}
    </AbsoluteFill>
  );
};
