import { useEffect, useState } from "react";
import { TypewriterEffect } from "./ui/typewriter-effect";

interface TypewriterProps extends Omit<React.ComponentProps<typeof TypewriterEffect>, "words"> {
  words: string[];
  wordClass?: string;
  highlightClass?: string;
  highlightIndex?: number;
}

export function Typewriter({
  words,
  wordClass = "dark:text-neutral-300",
  highlightClass = "text-green-500 dark:text-green-500",
  cursorClassName = "bg-green-500 dark:bg-green-500",
  highlightIndex,
  ...props
}: TypewriterProps) {
  const position = highlightIndex ?? words.length - 1;
  return (
    <TypewriterEffect
      {...props}
      words={words.map((text, index) => ({
        text,
        className: index === position ? highlightClass : wordClass,
      }))}
      cursorClassName={cursorClassName}
    />
  );
}

interface CyclingTypewriterProps
  extends Omit<React.ComponentProps<typeof TypewriterEffect>, "words"> {
  wordSets: string[][];
  wordClass?: string;
  highlightClass?: string;
  highlightIndex?: number;
  displayDuration?: number;
  cycleDelay?: number;
}

export function CyclingTypewriter({
  wordSets,
  wordClass = "dark:text-neutral-300",
  highlightClass = "text-green-500 dark:text-green-500",
  cursorClassName = "bg-green-500 dark:bg-green-500",
  highlightIndex,
  displayDuration = 3000,
  cycleDelay = 500,
  ...props
}: CyclingTypewriterProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (wordSets.length === 0 || wordSets.length === 1) return;

    const currentWords = wordSets[currentIndex];
    // Calculate typing animation duration
    // TypewriterEffect uses: duration 0.3s per char, stagger 0.1s
    // Total time ≈ (charCount * 0.3) + (charCount * 0.1) = charCount * 0.4
    const charCount = currentWords.join(" ").length;
    const typingDuration = charCount * 400; // milliseconds

    // Total cycle time: typing duration + display duration + cycle delay
    const totalCycleTime = typingDuration + displayDuration + cycleDelay;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % wordSets.length);
    }, totalCycleTime);

    return () => clearTimeout(timer);
  }, [currentIndex, wordSets, displayDuration, cycleDelay]);

  if (wordSets.length === 0) return null;

  const currentWords = wordSets[currentIndex];
  const position = highlightIndex ?? currentWords.length - 1;

  return (
    <TypewriterEffect
      {...props}
      key={currentIndex}
      words={currentWords.map((text, index) => ({
        text,
        className: index === position ? highlightClass : wordClass,
      }))}
      cursorClassName={cursorClassName}
    />
  );
}
