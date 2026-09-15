**Comparison Target**

- Source visual truth: `/var/folders/1_/685bb9s55zbg0w56ywq74ntw0000gn/T/codex-clipboard-862662e0-0f31-4b69-9088-f3cad811b7e7.png`
- Implementation: `http://localhost:4175/`
- Desktop evidence: `qa/hero-tuning-desktop-final.png` at 1164 x 900
- Mobile evidence: `qa/hero-tuning-mobile-final.png` at 390 x 844
- State: Simplified Chinese, wallet disconnected, branded loader completed

**Full-View Comparison Evidence**

- `qa/hero-tuning-compare-final.jpg` places the supplied before state and the final browser-rendered Hero in one comparison image.
- The previous hard vertical boundary between copy and imagery is gone. The final overlay feathers across the mascot instead of splitting the frame into two panels.
- The desktop Chinese headline now holds two deliberate lines; mobile uses three balanced lines with `财富网络` kept together instead of leaving `网络` orphaned.

**Focused Region Comparison Evidence**

- The Hero is the only changed region and remains legible at comparison scale, so no additional crop was required.
- Browser measurements confirmed `documentWidth === viewportWidth` at 1164 px and 390 px after the media clipping frame was added.
- Pointer movement changed only the media `transform`, from approximately `translate3d(-7.5px, -2.8px, 0)` to `translate3d(3.89px, 3.6px, 0)`, staying inside the tested bounds.

**Required Fidelity Surfaces**

- Fonts and typography: the artistic display face is preserved. Desktop wrapping is reduced from an accidental three-line orphan to two lines; mobile wraps into three balanced groups without overflow.
- Spacing and layout rhythm: existing navigation, CTA positions, live status, stats, side rail, and Hero height remain intact. No persistent control overlaps or horizontal scrolling remain.
- Colors and visual tokens: the existing black, white, magenta, and lime system is unchanged. The shadow treatment is softer while preserving text contrast.
- Image quality and asset fidelity: the supplied TokenOS mascot image remains the original optimized raster asset, now rendered through an absolute media layer with bounded transform motion and no stretching.
- Copy and content: all localized Hero copy, statistics, labels, and commands remain unchanged.

**Findings**

- No actionable P0, P1, or P2 issues remain.

**Primary Interactions Tested**

- Branded loader completes before the Hero appears.
- Pointer parallax moves the Hero media within the 10 px x / 6 px y limits.
- The purchase CTA scrolls the NFT sale section to the 72 px header offset.
- The TokenOS logo returns the page to the top.
- Browser console checked after desktop and mobile passes: no errors or warnings.

**Comparison History**

- Iteration 1 findings: P1 hard vertical image-overlay boundary; P2 orphaned Chinese headline line; P2 transformed media contributed 4 px to narrow-desktop document width.
- Fixes: replaced the hard inset block with a feathered shadow treatment, rebalanced headline width and language-aware wrapping, moved the image into a compositor-safe media layer, and clipped that layer inside a dedicated frame.
- Post-fix evidence: `qa/hero-tuning-compare-final.jpg`, `qa/hero-tuning-desktop-final.png`, and `qa/hero-tuning-mobile-final.png` show the revised composition with exact-width browser measurements and no console errors.

**Follow-up Polish**

- None required for this Hero tuning pass.

final result: passed
