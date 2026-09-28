import type { CSSProperties, HTMLAttributes } from "react";

export type SkeletonVariant = "text" | "circular" | "rectangular" | "rounded";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}

export const Skeleton = ({
  variant = "text",
  width,
  height,
  className = "",
  style,
  ...props
}: SkeletonProps) => {
  const isCircular = variant === "circular";
  const resolvedWidth = width ?? (isCircular && height !== undefined ? height : isCircular ? 40 : undefined);
  const resolvedHeight = height ?? (isCircular && width !== undefined ? width : isCircular ? 40 : undefined);

  const dynamicStyle: CSSProperties = {
    ...style,
    ...(resolvedWidth !== undefined
      ? { width: typeof resolvedWidth === "number" ? `${resolvedWidth}px` : resolvedWidth }
      : {}),
    ...(resolvedHeight !== undefined
      ? { height: typeof resolvedHeight === "number" ? `${resolvedHeight}px` : resolvedHeight }
      : {}),
    ...(isCircular ? { aspectRatio: "1 / 1", flexShrink: 0 } : {}),
  };

  return (
    <div
      className={`ui-skeleton ui-skeleton-${variant} ${className}`.trim()}
      style={dynamicStyle}
      aria-hidden="true"
      {...props}
    />
  );
};

export default Skeleton;
