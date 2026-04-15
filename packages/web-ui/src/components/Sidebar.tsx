"use client";

import {
  Button,
  type ButtonProps,
  Input,
  type InputProps,
  Modal,
  Separator,
  type SeparatorProps,
  Skeleton,
  Tooltip,
} from "@heroui/react";
import { mergeProps } from "@react-aria/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import * as React from "react";

import { useIsMobile } from "../hooks/use-mobile";
import { cn } from "../lib/utils";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

/** Expanded rail width (16rem) — keep spacer + fixed column in sync. */
const SIDEBAR_W_EXPANDED = "w-64";
/** Mobile drawer width (18rem). */
const SIDEBAR_W_MOBILE = "w-72";

interface SidebarContextValue {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function cloneAsChild(
  child: React.ReactElement,
  props: Record<string, unknown> & { className?: string; ref?: React.Ref<unknown> }
): React.ReactElement {
  if (!React.isValidElement(child)) {
    throw new Error("asChild expects a single valid React element child.");
  }
  const childProps = child.props as Record<string, unknown> & { className?: string };
  const mergedClassName = cn(
    typeof props.className === "string" ? props.className : undefined,
    typeof childProps.className === "string" ? childProps.className : undefined
  );
  const merged = mergeProps(childProps, { ...props, className: mergedClassName });
  return React.cloneElement(child, merged as never);
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile();
    const [openMobile, setOpenMobile] = React.useState(false);
    const [_open, _setOpen] = React.useState(defaultOpen);
    const open = openProp ?? _open;
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value;
        if (setOpenProp) {
          setOpenProp(openState);
        } else {
          _setOpen(openState);
        }
        // biome-ignore lint/suspicious/noDocumentCookie: persisted sidebar open state for layout
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      },
      [setOpenProp, open]
    );

    const toggleSidebar = React.useCallback(() => {
      return isMobile ? setOpenMobile((o) => !o) : setOpen((o) => !o);
    }, [isMobile, setOpen]);

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar]);

    const state = open ? "expanded" : "collapsed";

    const contextValue = React.useMemo<SidebarContextValue>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, isMobile, openMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          style={style}
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-zinc-100",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider";

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "flex h-full flex-col border-r border-default-200 bg-white text-neutral-900",
            SIDEBAR_W_EXPANDED,
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Modal isOpen={openMobile} onOpenChange={setOpenMobile}>
          <Modal.Backdrop className="z-50" />
          <Modal.Container
            className={cn(
              "fixed inset-0 z-50 flex max-h-none max-w-none items-stretch justify-start bg-transparent p-0 shadow-none",
              "data-[placement]:p-0"
            )}
          >
            <Modal.Dialog
              className={cn(
                "m-0 flex h-full max-h-full max-w-[min(100vw,18rem)] flex-col rounded-none border-0 bg-white p-0 text-neutral-900 shadow-none outline-none",
                SIDEBAR_W_MOBILE
              )}
            >
              <div
                data-sidebar="sidebar"
                data-mobile="true"
                className="flex h-full w-full flex-col"
              >
                {children}
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal>
      );
    }

    return (
      <div
        ref={ref}
        className="group peer hidden text-neutral-900 md:block"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
      >
        <div
          className={cn(
            "relative h-svh bg-transparent transition-[width] duration-200 ease-linear",
            SIDEBAR_W_EXPANDED,
            "group-data-[collapsible=offcanvas]:w-0",
            "group-data-[side=right]:rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:w-[calc(3rem+1rem+2px)]"
              : "group-data-[collapsible=icon]:w-12"
          )}
        />
        <div
          className={cn(
            "fixed inset-y-0 z-10 hidden h-svh transition-[left,right,width] duration-200 ease-linear md:flex",
            SIDEBAR_W_EXPANDED,
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:-left-64"
              : "right-0 group-data-[collapsible=offcanvas]:-right-64",
            variant === "floating" || variant === "inset"
              ? "p-2 group-data-[collapsible=icon]:w-[calc(3rem+1rem+2px)]"
              : "group-data-[collapsible=icon]:w-12 group-data-[side=left]:border-r group-data-[side=right]:border-l border-default-200",
            className
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className={cn(
              "flex h-full w-full flex-col border-default-200 bg-white",
              "group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm",
              "group-data-[variant=inset]:rounded-lg group-data-[variant=inset]:border group-data-[variant=inset]:shadow-sm"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Sidebar.displayName = "Sidebar";

const SidebarTrigger = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, onPress, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <Button
        ref={ref}
        data-sidebar="trigger"
        variant="ghost"
        isIconOnly
        size="sm"
        className={cn("h-7 w-7 min-w-7", className)}
        onPress={(e) => {
          onPress?.(e);
          toggleSidebar();
        }}
        {...props}
      >
        <PanelLeft className="h-4 w-4" />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>
    );
  }
);
SidebarTrigger.displayName = "SidebarTrigger";

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <button
        ref={ref}
        type="button"
        data-sidebar="rail"
        aria-label="Toggle Sidebar"
        tabIndex={-1}
        onClick={toggleSidebar}
        title="Toggle Sidebar"
        className={cn(
          "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-default-300 group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
          "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
          "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
          "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-white",
          "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
          "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
          className
        )}
        {...props}
      />
    );
  }
);
SidebarRail.displayName = "SidebarRail";

const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<"main">>(
  ({ className, ...props }, ref) => (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm",
        className
      )}
      {...props}
    />
  )
);
SidebarInset.displayName = "SidebarInset";

const SidebarInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn("h-8 min-h-8 w-full bg-background shadow-none", className)}
      {...props}
    />
  )
);
SidebarInput.displayName = "SidebarInput";

const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
);
SidebarHeader.displayName = "SidebarHeader";

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
);
SidebarFooter.displayName = "SidebarFooter";

const SidebarSeparator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, ...props }, ref) => (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-default-200", className)}
      {...props}
    />
  )
);
SidebarSeparator.displayName = "SidebarSeparator";

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarContent.displayName = "SidebarContent";

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
);
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { asChild?: boolean }
>(({ className, asChild = false, children, ...props }, ref) => {
  const classes = cn(
    "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-neutral-600 outline-none transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 focus-visible:ring-default-400 [&>svg]:size-4 [&>svg]:shrink-0",
    "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
    className
  );
  if (asChild && React.isValidElement(children)) {
    return cloneAsChild(React.Children.only(children) as React.ReactElement, {
      ...props,
      ref,
      className: classes,
      "data-sidebar": "group-label",
    });
  }
  return (
    <div ref={ref} data-sidebar="group-label" className={classes} {...props}>
      {children}
    </div>
  );
});
SidebarGroupLabel.displayName = "SidebarGroupLabel";

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ className, asChild = false, children, ...props }, ref) => {
  const classes = cn(
    "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-neutral-800 outline-none transition-transform hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-default-400 [&>svg]:size-4 [&>svg]:shrink-0",
    "after:absolute after:-inset-2 after:md:hidden",
    "group-data-[collapsible=icon]:hidden",
    className
  );
  if (asChild && React.isValidElement(children)) {
    return cloneAsChild(React.Children.only(children) as React.ReactElement, {
      ...props,
      ref,
      className: classes,
      "data-sidebar": "group-action",
    });
  }
  return (
    <button ref={ref} type="button" data-sidebar="group-action" className={classes} {...props}>
      {children}
    </button>
  );
});
SidebarGroupAction.displayName = "SidebarGroupAction";

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
);
SidebarGroupContent.displayName = "SidebarGroupContent";

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
);
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
);
SidebarMenuItem.displayName = "SidebarMenuItem";

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-neutral-800 outline-none transition-[width,height,padding] hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-default-400 active:bg-default-100 disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-default-200 data-[active=true]:font-medium data-[active=true]:text-neutral-900 data-[state=open]:hover:bg-default-100 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-default-100",
        outline:
          "border border-default-200 bg-background shadow-sm hover:border-default-300 hover:bg-default-100 hover:shadow-sm",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type SidebarMenuButtonTooltip =
  | string
  | (React.ComponentProps<typeof Tooltip.Content> & { children?: React.ReactNode });

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: SidebarMenuButtonTooltip;
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(
  (
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const { isMobile, state } = useSidebar();
    const classes = cn(sidebarMenuButtonVariants({ variant, size }), className);

    const inner = asChild ? (
      cloneAsChild(React.Children.only(children) as React.ReactElement, {
        ...rest,
        ref,
        "data-sidebar": "menu-button",
        "data-size": size,
        "data-active": isActive,
        className: classes,
      })
    ) : (
      <button
        ref={ref}
        type="button"
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        className={classes}
        {...rest}
      >
        {children}
      </button>
    );

    if (!tooltip) {
      return inner;
    }

    const showTip = state === "collapsed" && !isMobile;
    const contentProps: React.ComponentProps<typeof Tooltip.Content> =
      typeof tooltip === "string" ? { children: tooltip } : { ...tooltip };

    if (!showTip) {
      return inner;
    }

    return (
      <Tooltip>
        <Tooltip.Trigger className="flex w-full min-w-0">{inner}</Tooltip.Trigger>
        <Tooltip.Content placement="right" offset={8} {...contentProps} />
      </Tooltip>
    );
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    showOnHover?: boolean;
  }
>(({ className, asChild = false, showOnHover = false, children, ...props }, ref) => {
  const classes = cn(
    "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-neutral-800 outline-none transition-transform hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-default-400 peer-hover/menu-button:text-neutral-900 [&>svg]:size-4 [&>svg]:shrink-0",
    "after:absolute after:-inset-2 after:md:hidden",
    "peer-data-[size=sm]/menu-button:top-1",
    "peer-data-[size=default]/menu-button:top-1.5",
    "peer-data-[size=lg]/menu-button:top-2.5",
    "group-data-[collapsible=icon]:hidden",
    showOnHover &&
      "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-neutral-900 md:opacity-0",
    className
  );
  if (asChild && React.isValidElement(children)) {
    return cloneAsChild(React.Children.only(children) as React.ReactElement, {
      ...props,
      ref,
      className: classes,
      "data-sidebar": "menu-action",
    });
  }
  return (
    <button ref={ref} type="button" data-sidebar="menu-action" className={classes} {...props}>
      {children}
    </button>
  );
});
SidebarMenuAction.displayName = "SidebarMenuAction";

const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-neutral-600",
        "peer-hover/menu-button:text-neutral-900 peer-data-[active=true]/menu-button:text-neutral-900",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuBadge.displayName = "SidebarMenuBadge";

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean;
  }
>(({ className, showIcon = false, ...props }, ref) => {
  const width = React.useMemo(() => `${Math.floor(Math.random() * 40) + 50}%`, []);
  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 flex-1 rounded-md"
        data-sidebar="menu-skeleton-text"
        style={{ maxWidth: width }}
      />
    </div>
  );
});
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";

const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-default-200 px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuSub.displayName = "SidebarMenuSub";

const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  ({ ...props }, ref) => <li ref={ref} {...props} />
);
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & {
    asChild?: boolean;
    size?: "sm" | "md";
    isActive?: boolean;
  }
>(({ asChild = false, size = "md", isActive, className, children, ...props }, ref) => {
  const classes = cn(
    "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-neutral-800 outline-none hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-default-400 active:bg-default-100 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-neutral-700",
    "data-[active=true]:bg-default-200 data-[active=true]:text-neutral-900",
    size === "sm" && "text-xs",
    size === "md" && "text-sm",
    "group-data-[collapsible=icon]:hidden",
    className
  );
  if (asChild && React.isValidElement(children)) {
    return cloneAsChild(React.Children.only(children) as React.ReactElement, {
      ...props,
      ref,
      "data-sidebar": "menu-sub-button",
      "data-size": size,
      "data-active": isActive,
      className: classes,
    });
  }
  return (
    <a
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={classes}
      {...props}
    >
      {children}
    </a>
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
