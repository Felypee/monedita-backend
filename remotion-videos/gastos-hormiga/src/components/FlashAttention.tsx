import { useCurrentFrame, interpolate, AbsoluteFill } from "remotion";

interface FlashAttentionProps {
  children: React.ReactNode;
  flashColor?: string;
  flashDuration?: number;
}

export const FlashAttention: React.FC<FlashAttentionProps> = ({
  children,
  flashColor = "white",
  flashDuration = 8,
}) => {
  const frame = useCurrentFrame();

  // Flash en frames 0-5
  const flashOpacity = interpolate(
    frame,
    [0, 3, flashDuration],
    [0.9, 0.9, 0],
    { extrapolateRight: "clamp" }
  );

  // Scale de impacto
  const scale = interpolate(frame, [0, 12], [1.15, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ transform: `scale(${scale})` }}>
      {children}
      <AbsoluteFill
        style={{
          backgroundColor: flashColor,
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
