"use client";

import NextImage, { type ImageProps } from "next/image";
import { useState } from "react";
import { HOMEPAGE_BLUR_DATA, HOMEPAGE_PLACEHOLDER } from "./image-placeholder";

type HomepageImageProps = ImageProps & { fallbackSrc?: string };
function ImageWithFallback({
  src,
  alt,
  onError,
  fallbackSrc = HOMEPAGE_PLACEHOLDER,
  ...props
}: HomepageImageProps) {
  const [failed, setFailed] = useState(false);
  const fallback = failed || !src;
  const source = fallback ? fallbackSrc : src;
  return (
    <NextImage
      {...props}
      src={source}
      alt={
        fallback && alt
          ? fallbackSrc === HOMEPAGE_PLACEHOLDER
            ? "SportHub sports equipment illustration"
            : "SportHub default user avatar"
          : alt
      }
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
export default function HomepageImage(props: HomepageImageProps) {
  const key =
    typeof props.src === "string"
      ? props.src
      : "src" in props.src
        ? props.src.src
        : props.src.default.src;
  return <ImageWithFallback key={key} {...props} />;
}
