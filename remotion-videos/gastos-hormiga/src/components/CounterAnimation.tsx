import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface CounterAnimationProps {
  values: number[];
  duration?: number;
}

export const CounterAnimation: React.FC<CounterAnimationProps> = ({
  values,
  duration = 90,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calcular qué valor mostrar
  const framesPerValue = duration / values.length;
  const currentIndex = Math.min(
    Math.floor(frame / framesPerValue),
    values.length - 1
  );
  const currentValue = values[currentIndex];

  // Detectar cambio de valor para animación
  const isNewValue = frame % framesPerValue < 5;

  const scale = spring({
    frame: frame % framesPerValue,
    fps,
    config: { damping: 10, stiffness: 300 },
  });

  // Color progresivo (verde → amarillo → rojo)
  const colorProgress = currentIndex / (values.length - 1);
  const r = Math.round(interpolate(colorProgress, [0, 0.5, 1], [100, 255, 255]));
  const g = Math.round(interpolate(colorProgress, [0, 0.5, 1], [255, 255, 50]));
  const b = Math.round(interpolate(colorProgress, [0, 0.5, 1], [100, 50, 50]));

  // Tamaño progresivo
  const fontSize = interpolate(
    currentIndex,
    [0, values.length - 1],
    [80, 160],
    { extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 900,
          color: `rgb(${r}, ${g}, ${b})`,
          transform: `scale(${isNewValue ? scale : 1})`,
          textShadow: `0 0 30px rgba(${r}, ${g}, ${b}, 0.5)`,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        ${currentValue}
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: 400,
          height: 8,
          backgroundColor: "rgba(255,255,255,0.1)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${((currentIndex + 1) / values.length) * 100}%`,
            height: "100%",
            backgroundColor: `rgb(${r}, ${g}, ${b})`,
            borderRadius: 4,
            transition: "width 0.1s ease",
          }}
        />
      </div>
    </div>
  );
};
