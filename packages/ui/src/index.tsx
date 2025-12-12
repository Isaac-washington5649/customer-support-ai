import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: ButtonVariant;
}

export function Button({ children, variant = "primary", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors";
  const palette =
    variant === "secondary"
      ? "bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
      : "bg-black text-white hover:bg-gray-800";

  return (
    <button className={`${base} ${palette}`} {...props}>
      {children}
    </button>
  );
}
