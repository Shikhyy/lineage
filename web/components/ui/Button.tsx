"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Magnetic } from "./Magnetic";

type Common = { variant?: "solid" | "line" | "light"; children: ReactNode; magnetic?: boolean; arrow?: boolean; className?: string };
type AnchorProps = Common & { href: string } & Omit<ComponentProps<"a">, "href" | "className" | "children">;
type ButtonProps = Common & { href?: undefined } & Omit<ComponentProps<"button">, "className" | "children">;

export function Button(props: AnchorProps | ButtonProps) {
  const cls = [
    "btn",
    props.variant === "line" ? "btn--line" : props.variant === "light" ? "btn--light" : "",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <span>{props.children}</span>
      {props.arrow !== false && (
        <span className="btn-arrow" aria-hidden="true">
          →
        </span>
      )}
    </>
  );

  let el: ReactNode;
  if (props.href !== undefined) {
    const rest: Record<string, unknown> = { ...props };
    for (const k of ["variant", "children", "magnetic", "arrow", "className", "href"]) delete rest[k];
    const href = props.href;
    const internal = href.startsWith("/") && !href.startsWith("//");
    el = internal ? (
      <Link href={href} className={cls} {...rest}>
        {body}
      </Link>
    ) : (
      <a href={href} className={cls} {...rest}>
        {body}
      </a>
    );
  } else {
    const rest: Record<string, unknown> = { ...props };
    for (const k of ["variant", "children", "magnetic", "arrow", "className", "href"]) delete rest[k];
    el = (
      <button className={cls} {...rest}>
        {body}
      </button>
    );
  }
  return props.magnetic === false ? <>{el}</> : <Magnetic>{el}</Magnetic>;
}
