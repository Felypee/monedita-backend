import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene3_Question: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "¿En qué?" aparece con spring
  const questionScale = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 150 },
  });

  // Parpadeo del cursor (Zeigarnik - loop abierto)
  const cursorOpacity = Math.sin(frame * 0.4) > 0 ? 1 : 0;

  // Fade out gradual al final
  const fadeOut = interpolate(frame, [50, 60], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          transform: `scale(${questionScale})`,
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: "white",
            letterSpacing: "-3px",
          }}
        >
          ¿En qué?
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 90,
              backgroundColor: "#ff4444",
              marginLeft: 10,
              opacity: cursorOpacity,
              verticalAlign: "middle",
            }}
          />
        </div>

        {/* Puntos suspensivos animados */}
        <div
          style={{
            display: "flex",
            gap: 15,
            marginTop: 30,
          }}
        >
          {[0, 1, 2].map((i) => {
            const dotOpacity = interpolate(
              frame,
              [15 + i * 8, 20 + i * 8],
              [0, 0.5],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <div
                key={i}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255,255,255,0.5)",
                  opacity: dotOpacity,
                }}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
