import { Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface BlushIllustrationProps {
  src: string; // Path en public/illustrations/
  alt: string;
  width?: number;
  height?: number;
  delay?: number;
  animation?: "fadeIn" | "slideUp" | "scale" | "bounce";
  style?: React.CSSProperties;
}

export const BlushIllustration: React.FC<BlushIllustrationProps> = ({
  src,
  alt,
  width = 300,
  height = 300,
  delay = 0,
  animation = "scale",
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  let transform = "";
  let opacity = 1;

  switch (animation) {
    case "fadeIn":
      opacity = interpolate(adjustedFrame, [0, 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;

    case "slideUp":
      const slideY = interpolate(adjustedFrame, [0, 20], [50, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      transform = `translateY(${slideY}px)`;
      break;

    case "scale":
      const scale = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 12, stiffness: 200 },
      });
      transform = `scale(${Math.max(0, scale)})`;
      break;

    case "bounce":
      const bounceScale = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 6, stiffness: 150 },
      });
      transform = `scale(${Math.max(0, bounceScale)})`;
      break;
  }

  if (adjustedFrame < 0) {
    return null;
  }

  return (
    <Img
      src={staticFile(src)}
      alt={alt}
      style={{
        width,
        height,
        objectFit: "contain",
        opacity,
        transform,
        ...style,
      }}
    />
  );
};

// Placeholder cuando no tienes la imagen descargada
export const BlushPlaceholder: React.FC<{
  name: string;
  emoji?: string;
  width?: number;
  height?: number;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ name, emoji = "🎨", width = 200, height = 200, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  const scale = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  if (adjustedFrame < 0) return null;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "rgba(255,200,100,0.1)",
        borderRadius: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 8,
        transform: `scale(${Math.max(0, scale)})`,
        border: "2px dashed rgba(255,200,100,0.3)",
        ...style,
      }}
    >
      <div style={{ fontSize: 50 }}>{emoji}</div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          textAlign: "center",
          padding: "0 10px",
        }}
      >
        Blush: {name}
      </div>
    </div>
  );
};
