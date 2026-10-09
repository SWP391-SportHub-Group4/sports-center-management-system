# Hero arena media

The homepage uses an original architectural 3D arena illustration rendered to an
8-second seamless video. All geometry is defined in `hero-arena-scene.html`.
There are no downloaded stock clips, textures or models. This scene illustrates
the brand; it does not document a real facility.

Surfaces use deterministic procedural oak and rubber maps, physical clearcoat,
prefiltered room reflections, 4096px directional shadows and soft contact shadows.
The render uses 1.25 pixel ratio before downsampling, with higher-quality H.264
and VP9 encoding to retain surface details.

## Regenerate

From `frontend`, install project dependencies and Playwright Chromium, then make
FFmpeg available on `PATH` or point `FFMPEG_PATH` at the executable:

```powershell
$env:FFMPEG_PATH = 'C:/tools/ffmpeg.exe'
npm run media:hero
```

FFmpeg must support H.264 (`libx264`) and VP9 (`libvpx-vp9`). Use
`npm run media:hero -- --poster-only` to preview scene composition first.
The renderer starts a temporary server bound to localhost and closes it after
capture. The three output files live in `public/sporthub/hero`.

Three.js is a development dependency used by this renderer. Visitors receive
native video, a responsive poster image and CSS motion, without a Three.js bundle.

## Runtime behavior

- WebM where supported, with MP4 fallback; muted inline playback.
- The poster stays visible while video loads or playback is unavailable.
- Reduced motion and browser data saver omit the video source entirely.
- One fixed background instance covers homepage, sign-in and sign-up through the shared footer.
- The background is mounted on `/`, `/login` and `/register`; playback stops when the document is hidden.
- Pointer parallax is limited to mouse input and reduced motion disables it.
- Hero copy uses native CSS scroll timelines where supported; the background stays fixed.

Motion references are recorded in `public/sporthub/hero/provenance.json`.
