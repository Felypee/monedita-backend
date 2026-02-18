import { AbsoluteFill } from "remotion";
import { FlashAttention } from "../components/FlashAttention";
import { LossNumber } from "../components/LossNumber";

interface Scene1Props {
  amount: number;
}

export const Scene1_LossNumber: React.FC<Scene1Props> = ({ amount }) => {
  return (
    <FlashAttention flashColor="#ff0000">
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at center, #1a0000 0%, #0a0a0a 70%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LossNumber amount={amount} />
      </AbsoluteFill>
    </FlashAttention>
  );
};
