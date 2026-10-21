"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { IconClose } from "./icons";
import { Button, type ButtonProps } from "./primitives/Button";
import styles from "./CloseButton.module.css";

export function CloseButton({
  label,
  iconOnly: iconOnlyProp,
  className,
  variant = "ghost",
  size = "sm",
  ...props
}: Omit<ButtonProps, "children" | "icon"> & { label?: string; iconOnly?: boolean }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const iconOnly = iconOnlyProp ?? /^\/(admin|manager)(\/|$)/.test(pathname);
  const closeLabel = label ?? t.common.close;

  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      className={[className, iconOnly ? styles.icon : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={closeLabel}
      title={iconOnly ? closeLabel : undefined}
    >
      {iconOnly ? <IconClose size={20} /> : closeLabel}
    </Button>
  );
}
