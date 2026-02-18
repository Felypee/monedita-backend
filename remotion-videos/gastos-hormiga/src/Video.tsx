import { AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import { Scene1_LossNumber } from "./sequences/Scene1_LossNumber";
import { Scene2_WalletLottie } from "./sequences/Scene2_WalletLottie";
import { Scene3_Question } from "./sequences/Scene3_Question";
import { Scene4_Items } from "./sequences/Scene4_Items";
import { Scene5_Counter } from "./sequences/Scene5_Counter";
import { Scene6_Ants } from "./sequences/Scene6_Ants";
import { Scene7_CTA } from "./sequences/Scene7_CTA";

export const GastosHormiga: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Audio opcional - descomentar cuando tengas el archivo */}
      {/* <Audio src={staticFile("audio/beat.mp3")} volume={0.4} /> */}

      {/* ESCENA 1: Número de pérdida con flash (0-1s) */}
      <Sequence from={0} durationInFrames={30}>
        <Scene1_LossNumber amount={847} />
      </Sequence>

      {/* ESCENA 2: Wallet Lottie + "Eso perdiste" (1-3s) */}
      <Sequence from={30} durationInFrames={60}>
        <Scene2_WalletLottie />
      </Sequence>

      {/* ESCENA 3: "¿En qué?" pausa dramática (3-5s) */}
      <Sequence from={90} durationInFrames={60}>
        <Scene3_Question />
      </Sequence>

      {/* ESCENA 4: Items con ilustraciones Blush (5-8s) */}
      <Sequence from={150} durationInFrames={90}>
        <Scene4_Items />
      </Sequence>

      {/* ESCENA 5: Contador subiendo (8-11s) */}
      <Sequence from={240} durationInFrames={90}>
        <Scene5_Counter />
      </Sequence>

      {/* ESCENA 6: Las hormigas + ilustración (11-14s) */}
      <Sequence from={330} durationInFrames={90}>
        <Scene6_Ants />
      </Sequence>

      {/* ESCENA 7: CTA final (14-15s) */}
      <Sequence from={420} durationInFrames={30}>
        <Scene7_CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
