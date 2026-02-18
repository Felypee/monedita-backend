import { Composition } from "remotion";
import { GastosHormiga } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GastosHormiga"
        component={GastosHormiga}
        durationInFrames={450} // 15 segundos a 30fps
        fps={30}
        width={1080}
        height={1920} // Formato vertical TikTok/Reels
        defaultProps={{}}
      />
    </>
  );
};
