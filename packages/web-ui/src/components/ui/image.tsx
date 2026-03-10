import React from "react";
import { cn } from "#utils";

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: React.ReactNode;
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  ({ className, src, alt, fallback, ...props }, ref) => {
    const [error, setError] = React.useState(false);

    const handleError = () => {
      setError(true);
    };

    if (error || !src) {
      return (
        <div
          className={cn(
            "flex items-center justify-center bg-muted text-muted-foreground",
            className
          )}
          {...props}
        >
          {fallback || (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          )}
        </div>
      );
    }

    return (
      <img ref={ref} src={src} alt={alt} onError={handleError} className={className} {...props} />
    );
  }
);

Image.displayName = "Image";

export default Image;
