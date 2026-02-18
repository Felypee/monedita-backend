import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { BlushPlaceholder } from "../components/BlushIllustration";

export const Scene6_Ants: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textScale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 150 },
  });

  // Hormigas animadas
  const antPositions = [
    { x: 0, delay: 0 },
    { x: 80, delay: 10 },
    { x: 160, delay: 20 },
    { x: 240, delay: 30 },
    { x: 320, delay: 40 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0a0a0a 0%, #050505 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 50,
      }}
    >
      {/* Ilustración principal - persona preocupada */}
      <BlushPlaceholder
        name="worried-person"
        emoji="😰"
        width={280}
        height={280}
        style={{ marginBottom: 20 }}
      />
      {/*
      Cuando descargues de Blush (colección "Open Peeps" o "Amigos"):
      <BlushIllustration
        src="illustrations/worried-person.png"
        alt="Persona preocupada"
        width={280}
        height={280}
        animation="scale"
      />
      */}

      {/* Texto principal */}
      <div
        style={{
          transform: `scale(${textScale})`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.2,
          }}
        >
          Las hormigas
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 600,
            color: "#ff6b6b",
            marginTop: 10,
          }}
        >
          se llevan tu quincena
        </div>
      </div>

      {/* Fila de hormigas animadas */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 40,
          position: "relative",
          height: 60,
          width: 400,
        }}
      >
        {antPositions.map((ant, i) => {
          const antFrame = frame - ant.delay;
          if (antFrame < 0) return null;

          const walkCycle = Math.sin(antFrame * 0.5) * 5;
          const opacity = interpolate(antFrame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Movimiento hacia la derecha
          const moveX = interpolate(
            antFrame,
            [0, 60],
            [0, 150],
            { extrapolateRight: "extend" }
          );

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: ant.x + moveX,
                top: walkCycle,
                fontSize: 40,
                opacity,
                transform: `scaleX(-1)`, // Mirando a la derecha
              }}
            >
              🐜
            </div>
          );
        })}

        {/* Moneda siendo llevada */}
        {frame > 30 && (
          <div
            style={{
              position: "absolute",
              left: 200 + interpolate(frame - 30, [0, 60], [0, 150]),
              top: Math.sin(frame * 0.3) * 3,
              fontSize: 30,
              opacity: interpolate(frame, [30, 40], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            💰
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
