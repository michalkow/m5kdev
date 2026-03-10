import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Card } from "#components/ui/card";
import { cn } from "#utils";

function BlurCardHeader({
  title,
  subtitle,
  type,
  date,
}: {
  title: string;
  subtitle: string;
  type: string;
  date: string;
}) {
  return (
    <div className="w-full px-4 py-4">
      <div className="hidden lg:block">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-white drop-shadow-md">{title}</span>
          <span className="inline-block rounded-full bg-white/20 text-xs text-white font-semibold px-2 py-0.5 drop-shadow-md">
            {type}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300 drop-shadow-md">{subtitle}</span>
          <span className="text-xs text-neutral-300 drop-shadow-md italic">{date}</span>
        </div>
      </div>

      <div className="block lg:hidden">
        <div className="inline-block rounded-full bg-white/20 text-xs text-white font-semibold px-2 py-0.5 drop-shadow-md">
          {type}
        </div>
        <div className="text-lg font-semibold text-white drop-shadow-md">{title}</div>
        <div className="text-sm text-neutral-300 drop-shadow-md">{subtitle}</div>
        <div className="text-xs text-neutral-300 drop-shadow-md italic">{date}</div>
      </div>
    </div>
  );
}

interface BlurCardProps {
  image: string;
  title: string;
  subtitle: string;
  type: string;
  date: string;
  description: string;
  className?: string;
  link?: ReactNode;
}

export function BlurCard({
  image,
  title,
  subtitle,
  type,
  date,
  description,
  className,
  link,
}: BlurCardProps) {
  // Detect touch device
  const isTouchDevice =
    typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const [isOpen, setIsOpen] = useState(false);

  // Handler for tap on mobile
  const handleCardClick = () => {
    if (isTouchDevice) setIsOpen((open) => !open);
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-0 h-80 w-full flex flex-col justify-start",
        className
      )}
      onClick={isTouchDevice ? handleCardClick : undefined}
      style={{ touchAction: "manipulation" }}
    >
      <motion.div
        whileHover={isTouchDevice ? undefined : "hover"}
        initial="rest"
        animate={isTouchDevice && isOpen ? "hover" : "rest"}
        className="relative w-full h-full flex flex-col justify-end"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          height: "100%",
        }}
      >
        {/* Overlay for blur and dim */}
        <motion.div
          variants={{
            rest: { opacity: 0, backdropFilter: "blur(0px)" },
            hover: { opacity: 1, backdropFilter: "blur(8px)" },
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="absolute inset-0 z-10 bg-black/70 pointer-events-none rounded-xl"
          style={{ WebkitBackdropFilter: "blur(8px)" }}
        />
        {/* Header wrapper */}
        <motion.div
          variants={{
            rest: { height: "5rem" },
            hover: { height: "100%" },
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="w-full flex flex-col justify-start bg-black/70 pointer-events-none rounded-xl z-20"
          style={{
            overflow: "hidden",
            WebkitBackdropFilter: "blur(8px)",
            backdropFilter: "blur(8px)",
          }}
        >
          <BlurCardHeader title={title} subtitle={subtitle} type={type} date={date} />
          <div className="w-full h-full px-4 pb-4 flex flex-col justify-between">
            <p className="text-neutral-100">{description}</p>
            <div className="flex items-center justify-end pointer-events-auto">{link}</div>
          </div>
        </motion.div>
        {/* For accessibility, add an invisible img tag */}
        <img src={image} alt={title} className="invisible w-0 h-0" />
      </motion.div>
    </Card>
  );
}
