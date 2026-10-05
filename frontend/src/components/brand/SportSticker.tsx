import Image from "next/image";

const stickers = {
  gym: { src: "/sporthub/court-volt/sticker-gym.png", alt: "" },
  badminton: { src: "/sporthub/court-volt/sticker-badminton.png", alt: "" },
  basketball: { src: "/sporthub/court-volt/sticker-basketball.png", alt: "" },
} as const;

/** Illustrative brand decal; adjacent sport name remains the accessible label. */
export function SportSticker({
  sport,
  className,
  size = 104,
}: {
  sport: keyof typeof stickers;
  className?: string;
  size?: number;
}) {
  const sticker = stickers[sport];
  return (
    <Image
      src={sticker.src}
      alt={sticker.alt}
      aria-hidden="true"
      width={1024}
      height={1024}
      sizes={`${size}px`}
      className={className}
    />
  );
}
