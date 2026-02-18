import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { LottiePlaceholder } from "../components/LottieAnimation";

export const Scene2_WalletLottie: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textY = interpolate(frame, [15, 30], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const walletScale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0a0a0a 0%, #1a0505 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
      }}
    >
      {/* Lottie Wallet - reemplazar con el real */}
      <div style={{ transform: `scale(${walletScale})` }}>
        <LottiePlaceholder
          name="wallet-with-coins"
          style={{ width: 350, height: 350 }}
        />
        {/*
        Cuando descargues el Lottie, usa:
        <LottieAnimation
          src="lottie/wallet-with-coins.json"
          style={{ width: 350, height: 350 }}
        />
        */}
      </div>

      {/* Texto */}
      <div
        style={{
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "white",
            lineHeight: 1.3,
          }}
        >
          Eso perdiste
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 400,
            color: "rgba(255,255,255,0.6)",
            marginTop: 10,
          }}
        >
          el mes pasado
        </div>
      </div>
    </AbsoluteFill>
  );
};
