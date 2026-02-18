import { Lottie, LottieAnimationData } from "@remotion/lottie";
import { useCurrentFrame, staticFile, cancelRender, continueRender, delayRender } from "remotion";
import { useEffect, useState } from "react";

interface LottieAnimationProps {
  src: string; // Path relativo en public/ (ej: "lottie/wallet.json")
  loop?: boolean;
  playbackRate?: number;
  style?: React.CSSProperties;
}

export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  src,
  loop = true,
  playbackRate = 1,
  style = {},
}) => {
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender("Loading Lottie animation"));

  useEffect(() => {
    fetch(staticFile(src))
      .then((res) => res.json())
      .then((data) => {
        setAnimationData(data);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Error loading Lottie:", err);
        cancelRender(err);
      });
  }, [src, handle]);

  if (!animationData) {
    return null;
  }

  return (
    <Lottie
      animationData={animationData}
      playbackRate={playbackRate}
      loop={loop}
      style={{
        width: 400,
        height: 400,
        ...style,
      }}
    />
  );
};

// Componente alternativo si no tienes el JSON descargado
export const LottiePlaceholder: React.FC<{
  name: string;
  style?: React.CSSProperties;
}> = ({ name, style }) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.1) * 0.1 + 1;

  return (
    <div
      style={{
        width: 300,
        height: 300,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 10,
        transform: `scale(${pulse})`,
        border: "2px dashed rgba(255,255,255,0.2)",
        ...style,
      }}
    >
      <div style={{ fontSize: 60 }}>💰</div>
      <div
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.4)",
          textAlign: "center",
        }}
      >
        Lottie: {name}
      </div>
    </div>
  );
};
