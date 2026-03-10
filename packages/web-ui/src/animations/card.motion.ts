import type { MotionNodeOptions } from "framer-motion";

export const cardMotion: Partial<MotionNodeOptions> = {
  layout: true,
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
  transition: { type: "spring", stiffness: 160, damping: 28 },
};
