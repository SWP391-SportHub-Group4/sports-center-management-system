"use client";

import NextImage, { type ImageProps } from "next/image";
import { useState } from "react";
import { HOMEPAGE_BLUR_DATA, HOMEPAGE_PLACEHOLDER } from "./image-placeholder";

function ImageWithFallback({ src, alt, onError, ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  const fallback = failed || !src;
  const source = fallback ? HOMEPAGE_PLACEHOLDER : src;
  return (
    <NextImage
      {...props}
      src={source}
      alt={fallback && alt ? "SportHub sports equipment illustration" : alt}
      unoptimized={
        props.unoptimized ??
        (typeof source === "string" && /^https?:\/\//.test(source))
      }
      placeholder="blur"
      blurDataURL={HOMEPAGE_BLUR_DATA}
      onError={(event) => {
        if (!fallback) setFailed(true);
        onError?.(event);
      }}
    />
  );
}

/** Inline preview paints before network images; failed requests use the local asset. */
export default function HomepageImage(props: ImageProps) {
  const key =
    typeof props.src === "string"
      ? props.src
      : "src" in props.src
        ? props.src.src
        : props.src.default.src;
  return <ImageWithFallback key={key} {...props} />;
}
