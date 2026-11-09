export type ServiceImageKind = "membership" | "class" | "room";

export interface ServiceImage {
  imageId: string;
  url: string;
  altText: string;
  sortOrder: number;
  width: number;
  height: number;
}

export interface ServiceGallery {
  kind: ServiceImageKind;
  id: number;
  version: string;
  coverImageId: string | null;
  images: ServiceImage[];
}

export function galleryCover(gallery?: ServiceGallery | null) {
  return (
    gallery?.images?.find((image) => image.imageId === gallery.coverImageId) ??
    gallery?.images?.[0]
  );
}
