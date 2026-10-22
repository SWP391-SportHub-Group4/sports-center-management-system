# Media editor

`/manager/media` is the Center Manager homepage editor. The manager layout and page restrict access to `CenterManager`; the upload and publish APIs enforce the backend Center Manager policy. `/manager/landing-page` redirects here. Reading published landing content remains public.

Media focuses on images and featured Coaches. Its simplified landing replica follows the homepage order: Hero, community bookmarks, photo banner, arena tour, court booking and FAQ. Text and titles are read-only. The page title/description and published/help/Open homepage/section-jump toolbar are hidden. Image replacement controls fade and slide into view on hover or keyboard focus and remain visible on touch devices.

The public community, gallery, arena and booking layouts are restored to the pre-Media baseline `3662b1b7` (parent of `6aefa33d`, “Media page”). This retains published overrides, Media Save, live Coach selection/counts and catalog-driven sports. Coach frames use 3:2; existing saved fit/position/zoom still render, but Media no longer exposes Coach-framing controls. Public booking has a 540px desktop minimum height and a 4:3 mobile frame; its upload crop remains 4:5, displayed with responsive cover cropping. Public frames therefore need not match the Media crop ratio at every viewport.

The local landing content/images were subsequently restored against fetched `origin/develop` at `f76a8b04f8d6b068f34c4d39def94466fe479e3d`. Source English defaults and raster assets already matched that baseline; saved editorial overrides caused the difference. A one-time revision-guarded transaction removed those overrides, retained the three-Coach selection, left all seven catalog sports unchanged and recorded the SYSTEM audit action `RESTORE_LANDING_PAGE_DEVELOP`. The prior document is backed up at `.tmp/landing-backups/before-develop-1792596898405.json` (ignored local file); the maintenance script is `.tmp/restore-landing-develop.mjs`.

That content restoration applied only to the local document, with no automatic startup reset, migration, source change, application rebuild or restart. Its live `localhost:3000` checks at 1440px desktop and 390px mobile confirmed original hero/arena/booking content, the three original gallery assets, all seven sports, three Coaches and no horizontal overflow; evidence is `.impeccable/review/develop-content-verification.json`. This historical database operation is separate from the fixed, repository-stored **Restore original** snapshot below.

## Editing and publishing

- Choose a local JPG, PNG or WebP image, up to 10 MB, using a replacement button. Drag the crop preview with a mouse or touch to pan; pointer capture keeps the drag active beyond the preview and movement clamps to the image overflow. Arrow keys pan, with Shift moving faster. Zoom in when an image fits its frame exactly to create room to pan. Horizontal/vertical sliders stay synchronized; **Reset crop** restores centered positioning and 1× zoom. Landscape frames use 3:2; court booking uses 4:5. Cropped JPEG output never enlarges a small original.
- **Apply image** uploads the crop through the existing `POST /api/manager/media/images` adapter and places its returned URL in the draft preview. It does not publish the homepage. Canceling the crop leaves the draft unchanged. Upload failures keep the crop available for retry.
- Coach (HLV) photos and identities come from their profiles. The lime/yellow **Choose coaches** button opens three horizontal cards. Drag a card's grip with mouse/touch or focus it and press Left/Right to reorder. **Change coach** below each card opens replacement search only for that slot and excludes already selected Coaches. Mobile uses a native horizontal scroller. Cancel closes without applying; **Apply changes** updates the draft. Exactly three available, distinct Coaches are required; positional numbers, suggestion controls and image-framing controls are absent.
- **Restore original → Restore to draft** restores 17 image slots and the three-Coach selection captured at `2026-10-21T15:34:58Z` in `frontend/src/features/manager/media-restore-baseline.json`. This fixed snapshot does not change after future Media saves. Catalog names/new sports remain live; unavailable captured Coaches fall back to available current/suggested Coaches. Locked text is preserved. Restore changes only the draft until Save.
- A bottom **Preview / Cancel / Save changes** bar slides in when the draft differs from the last published document. **Save changes** publishes the draft through `PUT /api/landing-page`, including the current revision. A successful response becomes the new published baseline, while the fixed restore snapshot stays unchanged.
- **Preview** opens the shared dialog with the actual public `/?media-preview=true` route in an iframe, including its layout, backdrop, gallery and FAQ. Draft values are sent by same-origin `postMessage`, validated against the expected source/origin, without draft storage or publishing. The preview prevents leaving the page or changing the login session; same-page navigation and public interactions remain available. Escape closes it and focus returns to the trigger.
- **Cancel → Discard changes** restores all draft values to the last published document, including image/Coach edits and a pending restore. It does not delete an image already uploaded to storage.
- Ordinary links away from Media prompt while edits or image work are pending. Reload/closing the page uses the browser's unload warning. A save conflict preserves the draft; **Load latest content** asks before discarding it and reloading the published version.

Live image upload requires backend `CLOUDINARY_URL` configuration in the form `cloudinary://<api-key>:<api-secret>@<cloud-name>`. Keep credentials on the backend. The browser test suite mocks storage responses; it does not verify live Cloudinary credentials or delivery.

## Sports gallery

The public “Energy across every court” gallery and Media use `GET /api/public/sports-gallery` to show every catalog sport, including inactive sports, ordered by catalog sort order and ID. This minimal response includes identity, image, order and active state; it exposes no service availability or readiness data. The fixed Conditioning gallery entry is removed; the arena tour is unchanged. Sport names are authoritative catalog data and read-only captions in Media. Rename them through the direct **Sport** navigation entry (`/manager/sports`).

Each image override uses `gallery.sports.{sportId}.image`, so renaming or reordering a sport preserves its image. Existing `gallery.photos.0/1/2.src` overrides remain fallbacks for the immutable badminton/basketball/gym codes. Old `en`/`vi` gallery captions are ignored and filtered on publish; the backend rejects name overrides such as `gallery.sports.3.name`. New sports appear without a Media publish, using their catalog image or a neutral local placeholder. Replacing their gallery image follows the normal draft/crop/Save flow.

Media provides a horizontal strip with touch and native keyboard scrolling. Round previous/next buttons sit outside opposite ends of the image strip in dedicated gutters, centered on the image height. They use the primary green with white chevrons, lime hover and subtle directional motion, with disabled and focus states; targets are 48px on desktop and 44px on mobile. The top-right magnifier expands an animated name search and focuses it. Escape closes and clears search; a no-match state offers **Clear search**. Empty catalogs and refresh failures have explicit messages and retry guidance.

Successful Sports saves and activation changes notify the current window and other same-origin tabs. Focus/visibility refresh and polling every 15 seconds while visible cover other sessions. Gallery refresh preserves the Media draft.

## Sources and verification

- Route: `frontend/src/app/manager/media/page.tsx`.
- Draft, publish and discard handling: `frontend/src/features/manager/media-editor.tsx`.
- Landing replica and actions: `frontend/src/features/manager/media-landing-preview.tsx`.
- Fixed restore: `frontend/src/features/manager/media-restore.ts` and `media-restore-baseline.json`.
- Actual public draft preview: `frontend/src/features/manager/media-homepage-preview.tsx` and `frontend/src/components/homepage/landing-content-context.tsx`.
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

The eleven mocked-API scenarios cover restored public frames and existing published overrides, real file selection/canvas cropping and pixel changes, read-only copy, unpublished public-route preview, fixed restore after publishing, Coach reordering/replacement with Apply/Save, discard/navigation guards, upload failure/save conflicts, desktop/touch controls, gallery search/read-only names/navigation/alignment, legacy/stable images, empty/error states and Sports-page synchronization with open Media/public tabs.

From the repository root, run the three backend name-validation cases:

```powershell
dotnet test backend/SportHub.Security.Tests/SportHub.Security.Tests.csproj --filter FullyQualifiedName~LandingSportGalleryTests
```

Live Cloudinary verification is separate. This Media simplification changes frontend behavior only, with no backend change or migration. Application Docker rebuild remains user-managed.
