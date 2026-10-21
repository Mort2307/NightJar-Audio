# NightJar image upload, cropping and display guidelines

Updated: 21 October 2026

## Product rule — show the actual work

NightJar should display member-uploaded images without app-generated category banners, release titles or action buttons covering important visual content. Such metadata belongs next to or below the artwork. Actual approved images retain their intended composition rather than being silently stretched or cropped by a catalogue card.

- **Released audio:** Home catalogue tiles and Featured Audio use the whole approved image (`object-fit: contain`) over a soft, dimmed extension of that same image. Move category, title and play controls outside the artwork. Tapping the image can remain an accessible playback action without adding an obstructive icon.
- **Spotlight member portraits:** show the complete approved photograph above a blurred extension. Place role badges in the adjacent text area, not on top of the photo.
- **Writer/manuscript covers and Artist portfolios:** retain the whole actual artwork; Artist originals maintain their own proportions and transparent background. Labels/actions belong in adjacent content regions.
- **Profile avatars and banners:** these have intentional shapes. Avatars can be circular; banners can crop on different screens and may intentionally display the member's chosen tagline. Explain the safe region before export rather than promising no crop.
- **Accessibility:** preserve image alt text or decorative `alt=""` for ambient duplicates. All controls remain keyboard focusable with at least 44px practical touch targets. Vision/high-contrast overrides remain available.
- **Uploads:** moderation, approval, image bytes, storage permissions, and file limits stay unchanged. Do not auto-edit existing approved artwork to suit a new card.

## Image Studio — recommendations by upload type

| Upload type | Prepared frame / recommended composition | What the member should know |
| --- | --- | --- |
| Release cover | Square 1:1; Image Studio exports 768 × 768 px | Square preferred, portrait/landscape accepted. Home and Featured show the complete **prepared** image; metadata is outside. Use the preview to keep key text and faces visible. |
| Writer manuscript cover | Square 1:1; export 768 × 768 px | Prepared image displayed whole in Writer and Marketplace. Leave breathing room around lettering. |
| Artist portfolio | Original aspect ratio; longest side up to 2048 px | Artist visual work is not forcibly squared; transparent originals may remain transparent. |
| Profile portrait | Square 1:1; displayed in circular avatars in some places | Keep the face within the gold circle and away from square corners. |
| Social/profile images | Square 1:1 when using Image Studio | Actual surfaces vary; allow some margin and preview before saving. |
| Profile banner | 16:7; export 1408 × 616 px | Wide image; screen widths vary. Keep important text and faces away from edges, especially near custom tagline placement. |

### Crucial distinction: display framing versus upload editing

- **Show whole picture** prepares the full original image in a target frame. Where the aspect ratios differ, Image Studio exports dark padding *inside the saved image*. The published display cannot remove those baked-in margins.
- **Fill frame (crop)** deliberately removes edges **from the prepared upload itself**. This is not reversible by changing card CSS. The preview must clearly show the intended cut.
- Published release cards should not apply a new destructive crop. The blurred ambient backdrop is **display-only** and reuses the existing approved image URL.
- On any device, keep faces, artwork titles and other essential information completely inside the prepared image. Avoid placing essential words at the outermost edge.

## Acceptance checks

1. On Android and desktop verify a portrait with text at top and bottom, a square image, and a landscape image; important content remains visible without covering category labels.
2. Featured Audio title and category appear *below* the cover; play remains operable. Other Home release labels/buttons do not obstruct art.
3. Spotlight role badge sits alongside portrait, not on top; portrait itself remains fully visible.
4. Writer images and Artist portfolios remain full-image; circular avatar and banner behaviour is intentional and clearly described.
5. Image Studio guidance covers every supported shape; Reset, drag, pinch, sliders, keyboard, cancel and moderation still work.
6. Test default and Vision Access styles, small-screen wrapping and focus states.
7. Confirm missing-artwork logo, age gate, scheduled releases, and access restrictions are unchanged.

New UI refinements must be checked against this policy before merge.
