import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { cn } from "#utils";

const pageAlertVariants = cva(
  "relative w-full border-b px-4 py-3 text-sm transition-all duration-300 ease-in-out",
  {
    variants: {
      variant: {
        default: "bg-background border-border text-foreground",
        info: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-100",
        success:
          "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/50 dark:border-green-800 dark:text-green-100",
        warning:
          "bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-950/50 dark:border-yellow-800 dark:text-yellow-100",
        destructive:
          "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/50 dark:border-red-800 dark:text-red-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const iconMap = {
  default: Info,
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  destructive: AlertCircle,
} as const;

interface PageAlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof pageAlertVariants> {
  title?: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  dismissible?: boolean;
  defaultOpen?: boolean;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

const PageAlert = React.forwardRef<HTMLDivElement, PageAlertProps>(
  (
    {
      className,
      variant = "default",
      title,
      description,
      icon,
      dismissible = true,
      defaultOpen = true,
      onDismiss,
      children,
      ...props
    },
    ref
  ) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    const [isAnimatingOut, setIsAnimatingOut] = React.useState(false);
    const IconComponent = icon || iconMap[variant || "default"];

    const handleDismiss = React.useCallback(() => {
      setIsAnimatingOut(true);
      // Wait for animation to complete before removing from DOM
      setTimeout(() => {
        setIsOpen(false);
        onDismiss?.();
      }, 300); // Match the animation duration
    }, [onDismiss]);

    if (!isOpen) {
      return null;
    }

    const content = (
      <div
        ref={ref}
        role="alert"
        className={cn(
          pageAlertVariants({ variant }),
          isAnimatingOut && "transform -translate-y-full opacity-0",
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          {IconComponent && <IconComponent className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            {title && <div className="font-medium leading-none tracking-tight mb-1">{title}</div>}
            {description && <div className="text-sm opacity-90 leading-relaxed">{description}</div>}
            {children}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
              aria-label={t("web-ui:alert.dismissLabel")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );

    return content;
  }
);

PageAlert.displayName = "PageAlert";

export { PageAlert, type PageAlertProps };
