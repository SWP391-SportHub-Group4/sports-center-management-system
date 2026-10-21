# Media editor

`/manager/media` is the Center Manager homepage editor. The manager layout and page restrict access to `CenterManager`; the upload and publish APIs enforce the backend Center Manager policy. `/manager/landing-page` redirects here. Reading published landing content remains public.

The lightweight preview follows the homepage order: Hero, community bookmarks, photo banner, arena tour, court booking and FAQ. It shares homepage copy, content resolution and image-frame specifications. Image replacement controls fade and slide into view on hover or keyboard focus; they remain visible on touch devices. Text edits happen inline; featured-coach selection and framing remain in a dialog.

## Editing and publishing

- Double-click editable text, focus it and press Enter/F2/Space, or tap it on touch devices to open a plain-text textarea. Enter or blur finishes editing; Shift+Enter inserts a newline. Escape restores that field to its value when editing began. Finishing with blank text restores the previous value and shows feedback. Changes remain in the draft until the main **Save changes** action.
- Choose a local JPG, PNG or WebP image, up to 10 MB, using a replacement button. Drag the crop preview with a mouse or touch to pan; pointer capture keeps the drag active beyond the preview and movement clamps to the image overflow. Arrow keys pan, with Shift moving faster. Zoom in when an image fits its frame exactly to create room to pan. Horizontal/vertical sliders stay synchronized; **Reset crop** restores centered positioning and 1× zoom. Landscape frames use 3:2; court booking uses 4:5. Cropped JPEG output never enlarges a small original.
- **Apply image** uploads the crop through the existing `POST /api/manager/media/images` adapter and places its returned URL in the draft preview. It does not publish the homepage. Canceling the crop leaves the draft unchanged. Upload failures keep the crop available for retry.
- Coach (HLV) photos and identities come from their profiles. Managers choose exactly three active coaches and adjust framing in the featured-coach dialog; applying the dialog updates the draft. Coach identity text and live showcase counts are read-only in Media.
- Hero sport labels and the community introduction share override keys with the public homepage, so saved copy appears there as it does in the preview.
- A bottom Save/Cancel bar slides in when the draft differs from the last published document. **Save changes** publishes the complete draft through `PUT /api/landing-page`, including the current revision. A successful response becomes the new published baseline.
- **Cancel → Discard changes** restores all draft values to that baseline, including image, text and coach edits. It does not delete an image already uploaded to storage.
- Ordinary links away from Media prompt while edits or image work are pending. Reload/closing the page uses the browser's unload warning. Opening the public homepage in a new tab remains available. A save conflict preserves the draft; **Load latest content** asks before discarding it and reloading the published version.

Live image upload requires backend `CLOUDINARY_URL` configuration in the form `cloudinary://<api-key>:<api-secret>@<cloud-name>`. Keep credentials on the backend. The browser test suite mocks storage responses; it does not verify live Cloudinary credentials or delivery.

## Sports gallery

The public “Energy across every court” gallery and Media use `GET /api/public/sports-gallery` to show every catalog sport, including inactive sports, ordered by catalog sort order and ID. This minimal response includes identity, image, order and active state; it exposes no service availability or readiness data. The fixed Conditioning gallery entry is removed; the arena tour is unchanged. Sport names are authoritative catalog data and read-only captions in Media. Rename them through **Services → Sports**.

Each image override uses `gallery.sports.{sportId}.image`, so renaming or reordering a sport preserves its image. Existing `gallery.photos.0/1/2.src` overrides remain fallbacks for the immutable badminton/basketball/gym codes. Old `en`/`vi` gallery captions are ignored and filtered on publish; the backend rejects name overrides such as `gallery.sports.3.name`. New sports appear without a Media publish, using their catalog image or a neutral local placeholder. Replacing their gallery image follows the normal draft/crop/Save flow.

Media provides a horizontal strip with touch and native keyboard scrolling. Round previous/next buttons sit outside opposite ends of the image strip in dedicated gutters, centered on the image height. They use the primary green with white chevrons, lime hover and subtle directional motion, with disabled and focus states; targets are 48px on desktop and 44px on mobile. The top-right magnifier expands an animated name search and focuses it. Escape closes and clears search; a no-match state offers **Clear search**. Empty catalogs and refresh failures have explicit messages and retry guidance.

Successful Sports saves and activation changes notify the current window and other same-origin tabs. Focus/visibility refresh and polling every 15 seconds while visible cover other sessions. Gallery refresh preserves Media image/text drafts.

## Sources and verification

- Route: `frontend/src/app/manager/media/page.tsx`.
- Draft, publish and discard handling: `frontend/src/features/manager/media-editor.tsx`.
- Landing replica and actions: `frontend/src/features/manager/media-landing-preview.tsx`.
- Inline plain-text editing: `frontend/src/features/manager/media-inline-text.tsx`.
- Canvas crop: `frontend/src/features/manager/media-image-cropper.tsx`.
- Layout, hover/focus/touch controls and motion: `frontend/src/features/manager/media-editor.module.css`.
- Shared ratios: `frontend/src/components/homepage/image-specs.ts`; profile-backed coach selection: `frontend/src/features/manager/featured-coach-picker.tsx`.
- Shared public hero and community copy: `frontend/src/components/homepage/PerformanceSections.tsx`, `HomepageStats.tsx` and `homepage-content.ts`.
- Catalog gallery resolution/refresh/public rendering: `frontend/src/components/homepage/sport-gallery.ts`, `use-sport-gallery.ts` and `TrainingPhotoMarquee.tsx`; Media search/scrolling: `frontend/src/features/manager/media-sport-gallery.tsx`.
- Catalog change notifications: `frontend/src/lib/sport-catalog-events.ts` and `frontend/src/features/catalog/api.ts`.
- Existing upload/publish endpoints and storage: `backend/SportHub.Administration/Api/MediaImagesController.cs`, `LandingPageController.cs`, and `backend/SportHub.Administration/Infrastructure/CloudinaryMediaImageStorage.cs`.
- Public gallery endpoint: `backend/SportHub.Scheduling/Catalog/Api/SportsController.cs`; projection: `backend/SportHub.Scheduling/Catalog/Application/SportCatalogService.cs` and `SportGalleryResponse.cs`.

The extension consumes the incumbent Court & Volt tokens and shared UI primitives. The design sources remain `PRODUCT.md`, `DESIGN-TOKENS.md` and `frontend/src/styles/tokens.css`; no new visual system is introduced. Existing documentation still describes token integration as pending, while `frontend/src/app/layout.tsx` imports the tokens and font families. That documentation drift is outside this extension.

From `frontend`, build and run the focused browser suite:

```powershell
npm run build
npm run test:e2e -- tests/media-editor.spec.ts
```

The nine mocked-API scenarios cover real file selection/canvas cropping and pixel changes, inline editing/publication, discard/navigation guards, upload failure/save conflicts, desktop/touch controls, gallery search/read-only names, arrow navigation and disabled states, outside gutters and image-centered arrow alignment, native keyboard scrolling and mobile overflow, legacy/stable images, empty/error states and Sports-page create/rename synchronization with open Media and public tabs.

From the repository root, run the three backend name-validation cases:

```powershell
dotnet test backend/SportHub.Security.Tests/SportHub.Security.Tests.csproj --filter FullyQualifiedName~LandingSportGalleryTests
```

Live Cloudinary verification is separate. Rebuilding both backend and frontend Docker services remains user-managed.
