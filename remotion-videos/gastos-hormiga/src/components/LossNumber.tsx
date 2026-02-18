import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";

interface LossNumberProps {
  amount: number;
  delay?: number;
}

export const LossNumber: React.FC<LossNumberProps> = ({ amount, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring para entrada dramática
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 8, stiffness: 200 },
  });

  // Shake effect
  const shakeIntensity = interpolate(
    frame - delay,
    [0, 5, 15, 25],
    [0, 8, 4, 0],
    { extrapolateRight: "clamp" }
  );
  const shakeX = Math.sin((frame - delay) * 2) * shakeIntensity;
  const shakeY = Math.cos((frame - delay) * 2.5) * shakeIntensity * 0.5;

  // Glow pulsante
  const glowIntensity = interpolate(
    frame - delay,
    [10, 15, 20, 25],
    [20, 40, 30, 25],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${Math.max(0, scale)}) translate(${shakeX}px, ${shakeY}px)`,
      }}
    >
      <div
        style={{
          fontSize: 180,
          fontWeight: 900,
          color: "#ff2222",
          textShadow: `0 0 ${glowIntensity}px rgba(255,0,0,0.8), 0 0 ${glowIntensity * 2}px rgba(255,0,0,0.4)`,
          fontFamily: "Inter, system-ui, sans-serif",
          letterSpacing: "-8px",
        }}
      >
        -${amount}
      </div>
    </div>
  );
};
