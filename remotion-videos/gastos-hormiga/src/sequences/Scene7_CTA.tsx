import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";

export const Scene7_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 200 },
  });

  // Glitch effect en los primeros frames
  const glitchOffset = frame < 5 ? (Math.random() - 0.5) * 10 : 0;

  // Pulsing glow
  const glowIntensity = 20 + Math.sin(frame * 0.3) * 10;

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at center, #1a0505 0%, #0a0a0a 70%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
      }}
    >
      {/* Pregunta principal */}
      <div
        style={{
          transform: `scale(${scale}) translateX(${glitchOffset}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 90,
            fontWeight: 900,
            color: "white",
            textShadow: `0 0 ${glowIntensity}px rgba(255,100,100,0.5)`,
            lineHeight: 1.1,
          }}
        >
          ¿Cuánto
        </div>
        <div
          style={{
            fontSize: 90,
            fontWeight: 900,
            color: "#ff4444",
            textShadow: `0 0 ${glowIntensity * 1.5}px rgba(255,50,50,0.6)`,
            lineHeight: 1.1,
          }}
        >
          perdiste tú?
        </div>
      </div>

      {/* Indicador de interacción */}
      {frame > 15 && (
        <div
          style={{
            marginTop: 40,
            opacity: interpolate(frame, [15, 25], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 15,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "pulse 1s infinite",
            }}
          >
            <div
              style={{
                fontSize: 28,
                transform: `translateY(${Math.sin(frame * 0.2) * 3}px)`,
              }}
            >
              👇
            </div>
          </div>

          <div
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.4)",
              fontWeight: 500,
            }}
          >
            comenta tu número
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
