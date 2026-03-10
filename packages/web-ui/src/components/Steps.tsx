import { Check } from "lucide-react";
import type React from "react";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

export interface Step {
  id: string;
  title: string;
  description?: string;
  status: "completed" | "current" | "upcoming";
}

export interface StepsProps {
  steps: Step[];
  className?: string;
  onStepClick?: (step: number) => void;
}

export const Steps: React.FC<StepsProps> = ({ steps, className, onStepClick }) => {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      {/* Vertical layout for mobile/tablet */}
      <ol className="lg:hidden space-y-6">
        {steps.map((step, stepIdx) => (
          <li key={step.id} className="relative">
            <div className="flex items-start">
              {/* Step indicator */}
              <div className="flex-shrink-0">
                {step.status === "completed" ? (
                  <button type="button" onClick={() => onStepClick?.(stepIdx)}>
                    <Badge
                      variant="default"
                      className="h-10 w-10 rounded-full p-0 flex items-center justify-center"
                    >
                      <Check className="h-5 w-5" />
                    </Badge>
                  </button>
                ) : step.status === "current" ? (
                  <Badge
                    variant="default"
                    className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium"
                  >
                    {stepIdx + 1}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium bg-background"
                  >
                    {stepIdx + 1}
                  </Badge>
                )}
              </div>

              {/* Step content */}
              <div className="ml-4 min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.status === "completed" || step.status === "current"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p
                    className={cn(
                      "text-sm mt-1",
                      step.status === "completed" || step.status === "current"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            </div>

            {/* Connecting line - vertical */}
            {stepIdx !== steps.length - 1 && (
              <div className="absolute left-5 top-10 -ml-px mt-2 h-6">
                <Separator
                  orientation="vertical"
                  className={cn(
                    "h-full",
                    step.status === "completed" ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              </div>
            )}
          </li>
        ))}
      </ol>

      {/* Horizontal layout for desktop */}
      <ol className="hidden lg:flex items-center justify-between">
        {steps.map((step, stepIdx) => (
          <li key={step.id} className="relative flex flex-col items-center flex-1">
            {/* Step indicator */}
            <div className="relative z-10 flex-shrink-0">
              {step.status === "completed" ? (
                <button type="button" onClick={() => onStepClick?.(stepIdx)}>
                  <Badge
                    variant="default"
                    className="h-10 w-10 rounded-full p-0 flex items-center justify-center"
                  >
                    <Check className="h-5 w-5" />
                  </Badge>
                </button>
              ) : step.status === "current" ? (
                <Badge
                  variant="default"
                  className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium"
                >
                  {stepIdx + 1}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium bg-background"
                >
                  {stepIdx + 1}
                </Badge>
              )}
            </div>

            {/* Step content */}
            <div className="mt-3 text-center max-w-32">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.status === "completed" || step.status === "current"
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.title}
              </p>
              {step.description && (
                <p
                  className={cn(
                    "text-xs mt-1",
                    step.status === "completed" || step.status === "current"
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                  )}
                >
                  {step.description}
                </p>
              )}
            </div>

            {/* Connecting line - horizontal */}
            {stepIdx !== steps.length - 1 && (
              <div className="absolute left-1/2 top-5 w-full h-0.5 -z-10">
                <Separator
                  orientation="horizontal"
                  className={cn(
                    "w-full",
                    step.status === "completed" ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

// Keep the individual components for specific use cases
export const VerticalSteps: React.FC<StepsProps> = ({ steps, className }) => {
  return (
    <nav aria-label="Progress" className={cn("", className)}>
      <ol className="space-y-6">
        {steps.map((step, stepIdx) => (
          <li key={step.id} className="relative">
            <div className="flex items-start">
              {/* Step indicator */}
              <div className="flex-shrink-0">
                {step.status === "completed" ? (
                  <Badge
                    variant="default"
                    className="h-10 w-10 rounded-full p-0 flex items-center justify-center"
                  >
                    <Check className="h-5 w-5" />
                  </Badge>
                ) : step.status === "current" ? (
                  <Badge
                    variant="default"
                    className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium"
                  >
                    {stepIdx + 1}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium bg-background"
                  >
                    {stepIdx + 1}
                  </Badge>
                )}
              </div>

              {/* Step content */}
              <div className="ml-4 min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.status === "completed" || step.status === "current"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p
                    className={cn(
                      "text-sm mt-1",
                      step.status === "completed" || step.status === "current"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            </div>

            {/* Connecting line */}
            {stepIdx !== steps.length - 1 && (
              <div className="absolute left-5 top-10 -ml-px mt-2 h-6">
                <Separator
                  orientation="vertical"
                  className={cn(
                    "h-full",
                    step.status === "completed" ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export interface HorizontalStepsProps {
  steps: Step[];
  className?: string;
}

export const HorizontalSteps: React.FC<HorizontalStepsProps> = ({ steps, className }) => {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between">
        {steps.map((step, stepIdx) => (
          <li key={step.id} className="relative flex flex-col items-center flex-1">
            {/* Step indicator */}
            <div className="relative z-10 flex-shrink-0">
              {step.status === "completed" ? (
                <Badge
                  variant="default"
                  className="h-10 w-10 rounded-full p-0 flex items-center justify-center"
                >
                  <Check className="h-5 w-5" />
                </Badge>
              ) : step.status === "current" ? (
                <Badge
                  variant="default"
                  className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium"
                >
                  {stepIdx + 1}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm font-medium bg-background"
                >
                  {stepIdx + 1}
                </Badge>
              )}
            </div>

            {/* Step content */}
            <div className="mt-3 text-center max-w-32">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.status === "completed" || step.status === "current"
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.title}
              </p>
              {step.description && (
                <p
                  className={cn(
                    "text-xs mt-1",
                    step.status === "completed" || step.status === "current"
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                  )}
                >
                  {step.description}
                </p>
              )}
            </div>

            {/* Connecting line */}
            {stepIdx !== steps.length - 1 && (
              <div className="absolute left-1/2 top-5 w-full h-0.5 -z-10">
                <Separator
                  orientation="horizontal"
                  className={cn(
                    "w-full",
                    step.status === "completed" ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

Steps.displayName = "Steps";
VerticalSteps.displayName = "VerticalSteps";
HorizontalSteps.displayName = "HorizontalSteps";
