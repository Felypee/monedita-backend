import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { CounterAnimation } from "../components/CounterAnimation";

const counterValues = [2, 5, 15, 50, 150, 350, 600, 847];

export const Scene5_Counter: React.FC = () => {
  const frame = useCurrentFrame();

  // Background pulse basado en el valor actual
  const progress = frame / 90;
  const bgRed = interpolate(progress, [0, 1], [10, 40]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at center, rgba(${bgRed * 3}, 0, 0, 0.3) 0%, #0a0a0a 70%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 60,
      }}
    >
      {/* Texto superior */}
      <div
        style={{
          fontSize: 42,
          fontWeight: 500,
          color: "rgba(255,255,255,0.6)",
          textAlign: "center",
        }}
      >
        Pero sumaron...
      </div>

      {/* Contador animado */}
      <CounterAnimation values={counterValues} duration={85} />

      {/* Texto inferior que aparece al final */}
      {frame > 70 && (
        <div
          style={{
            fontSize: 32,
            color: "rgba(255,100,100,0.8)",
            textAlign: "center",
            opacity: interpolate(frame, [70, 85], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          mientras no mirabas
        </div>
      )}
    </AbsoluteFill>
  );
};
