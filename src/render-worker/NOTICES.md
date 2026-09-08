# Runtime and originality notices

No npm package or lockfile change is required by this foundation. Existing Node 24, TypeScript, Vitest, Playwright and Electron are reused for compilation/tests and the isolated synthetic playback harness. Electron is not part of the render container or worker runtime.

The rendering prerequisite is **Manim Community 0.21.0**, pinned to the founder-approved ARM64 image:

`manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3`

Manim Community is MIT licensed; copyright is held by its developers. Its [v0.21.0 license](https://github.com/ManimCommunity/manim/blob/v0.21.0/LICENSE) and notices remain in the upstream image. This repository references that image and contains original preset source; it does not vendor Manim or redistribute the image. Image components retain their respective licenses (including Python, NumPy, Cairo, Pango, fonts and FFmpeg); a future image distribution must retain its full upstream notices rather than treating the entire image as MIT.

The two recipes use original geometry, layout and choreography authored for Applied Research. 3b1b/videos and 3Blue1Brown are mathematical/visual references only. No scene source, clips, logos, audio, fonts or other assets were copied from those works. Rendering uses the installed image's DejaVu Sans font through plain Pango `Text`; no downloaded visual assets are used.

The worker uses administrator-installed FFprobe and FFmpeg for host media validation. They are not bundled or installed by this change. FFmpeg licensing depends on the installed build configuration (LGPL/GPL components); record `ffmpeg -version` and `ffmpeg -L` for the target deployment before redistributing binaries. The evidence directory records the tested machine/tool versions.

Specific official APIs checked for the installed 0.21 release:

- [Plain Text / Pango](https://docs.manim.community/en/stable/reference/manim.mobject.text.text_mobject.Text.html): supports fixed fonts and plain strings without a TeX compiler.
- [UpdateFromAlphaFunc](https://docs.manim.community/en/stable/reference/manim.animation.updaters.update.UpdateFromAlphaFunc.html): supplies alpha for continuous preset geometry updates.
- [ManimConfig](https://docs.manim.community/en/stable/reference/manim._config.utils.ManimConfig.html) and [v0.21.0 defaults](https://github.com/ManimCommunity/manim/blob/v0.21.0/manim/_config/default.cfg): fixed Cairo renderer, resolution, frame rate, output format, cache and media paths.

The actual pinned image was executed and reported Manim `0.21.0`, Python `3.14.7`, `aarch64`, UID `501` on this machine. This evidence verifies the approved runtime without installing a new rendering framework or silently changing foundations.

The repair also checks the [0.21.0 Arrow stroke-width limiter](https://github.com/ManimCommunity/manim/blob/v0.21.0/manim/mobject/geometry/line.py). Short-arrow stroke width is bounded by both the requested width and the configured length ratio. The presets retain their palette and use a capped stroke verified against decoded moving-video pixels.
