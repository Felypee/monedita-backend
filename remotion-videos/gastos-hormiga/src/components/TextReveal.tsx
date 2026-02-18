import { useCurrentFrame, interpolate } from "remotion";

interface TextRevealProps {
  text: string;
  delay?: number;
  revealDuration?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  delay = 0,
  revealDuration = 20,
  fontSize = 72,
  color = "white",
  fontWeight = 700,
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(
    frame,
    [delay, delay + revealDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const visibleChars = Math.floor(text.length * progress);

  const opacity = interpolate(
    frame,
    [delay, delay + 5],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        fontSize,
        color,
        fontWeight,
        fontFamily: "Inter, system-ui, sans-serif",
        textAlign: "center",
        opacity,
        lineHeight: 1.2,
      }}
    >
      <span>{text.slice(0, visibleChars)}</span>
      <span style={{ opacity: 0.15 }}>{text.slice(visibleChars)}</span>
      {progress < 1 && (
        <span
          style={{
            display: "inline-block",
            width: 4,
            height: fontSize * 0.8,
            backgroundColor: color,
            marginLeft: 4,
            opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
            verticalAlign: "middle",
          }}
        />
      )}
    </div>
  );
};
