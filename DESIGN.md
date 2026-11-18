---
name: GPT6 Demos Gallery
description: A light screenshot gallery and in-page walkthrough portal for the interactive demos.
colors:
  primary: "#2457d6"
  primary-hover: "#1944ae"
  canvas: "#fff"
  ink: "#17191e"
  muted: "#626771"
  line: "#e4e6eb"
  surface: "#f5f6f8"
  root-arrow: "#6b707a"
  selection: "#dce6ff"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(2.75rem, 5vw, 4.25rem)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-.04em"
  root-display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 650
    letterSpacing: "-.045em"
  title:
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.025em"
  root-title:
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-.02em"
  dialog-title:
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.025em"
  body:
    fontSize: ".9375rem"
    lineHeight: 1.65
  root-body:
    fontSize: "1rem"
    lineHeight: 1.55
  dialog-body:
    fontSize: ".9375rem"
    lineHeight: 1.75
  label:
    fontSize: ".8125rem"
    lineHeight: 1.5
  action:
    fontSize: ".875rem"
    fontWeight: 600
  preview-action:
    fontSize: ".75rem"
    fontWeight: 600
rounded:
  root-preview: "8px"
  preview: "12px"
  dialog: "16px"
  action: "8px"
  preview-action: "24px"
  circle: "50%"
spacing:
  small: "8px"
  compact: "12px"
  regular: "16px"
  medium: "20px"
  large: "24px"
  section: "32px"
  row: "48px"
  page: "64px"
components:
  launch:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
    padding: "12px 18px"
  launch-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.canvas}"
  preview-action:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.preview-action}"
    rounded: "{rounded.preview-action}"
    padding: "9px 13px"
  preview-action-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
  close:
    backgroundColor: "transparent"
    rounded: "{rounded.circle}"
    width: "44px"
    height: "44px"
  close-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  play-disc:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    width: "72px"
    height: "72px"
  dialog:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    width: "min(900px, calc(100% - 48px))"
---

# Design System: GPT6 Demos Gallery

## Overview

**Creative North Star: "The Screenshot Gallery"**

The gallery is a light, minimalist frame for real application screenshots. White space, dark system sans text, quiet gray supporting copy, and a single blue interaction accent preserve the identity established by the root index.html. Screenshots supply the variety and color.

This system governs the root gallery and its portal/ extension only. It does not govern the independent demo applications. The root retains its compact direct-launch grid; the portal extends that language with larger images and an in-page video preview.

**Key Characteristics:**

- White ground and system sans typography.
- Unboxed screenshot-and-caption entries.
- Blue links, hover states, and visible keyboard focus.
- Flat gallery with elevation reserved for overlaid controls and dialogs.

The source of truth is the inline stylesheet in `index.html` and `portal/portal.css`; interaction behavior lives in `portal/portal.js`. The surface-specific direction is recorded in `.impeccable/surfaces/portal-index-html.md`. These tokens describe the implemented gallery, not a new identity proposal.

## Colors

The palette uses one clear blue against white and cool neutral grays. Frontmatter values are normative.

### Primary

- **Interaction Blue** (`primary`): root hover and focus; portal links, categories, title punctuation, preview hover, play hover, and launch action.
- **Deep Interaction Blue** (`primary-hover`): the launch action’s hover state.

### Neutral

- **White Canvas** (`canvas`): page, dialog, preview label, and play disc.
- **Dark Ink** (`ink`): headings, default controls, code, and player background.
- **Supporting Gray** (`muted`): descriptions, captions, secondary links, and metadata.
- **Quiet Line** (`line`): screenshot borders and collection/footer separators.
- **Image Ground** (`surface`): letterboxing around contained screenshots and close-button hover.
- **Root Arrow Gray** (`root-arrow`): the incumbent direct-launch arrow.
- **Selection Blue** (`selection`): portal text selection with dark ink.

**The Screenshot Color Rule.** Let application screenshots supply the gallery’s visual variety; keep the surrounding interface neutral with blue interaction cues.

## Typography

All gallery UI inherits the native system sans stack recorded in `display`. No remote font is required. Headings use tight tracking and medium-to-bold weights; paragraph copy remains open and readable.

The root uses `root-display`, `root-title`, and `root-body`. The portal uses `display`, `title`, and `body`; longer dialog text uses `dialog-body`, with a maximum measure of 75ch. Card descriptions have a maximum measure of 60ch. Categories use `label`; small preview and new-tab metadata use 12px text. Portal dialog headings retain the browser’s bold h2 weight (700).

At the portal’s 900px breakpoint card titles become 1.1875rem, then 1.3125rem at 600px when the layout becomes one column. Dialog titles become 1.5rem at 600px. The portal invitation is 1.25rem desktop and 1.0625rem on mobile.

## Layout

The root gallery’s centered container is at most 1600px wide, with 56px 40px 40px padding. Its grid has four columns and 36px × 24px gaps. At 1000px it becomes two columns with 36px 24px page padding; at 560px it becomes one column with 28px gaps and 28px 20px page padding.

The portal’s centered container is at most 1344px wide, including 64px 56px 32px padding. Its two-column grid uses 48px row and 32px column gaps. At 900px, page padding becomes 40px 28px 28px, the introduction stacks, and grid gaps become 36px × 24px. At 600px, the gallery becomes one column with 32px gaps and 32px 20px 24px page padding. The footer also stacks.

Both gallery variants preserve a 2:1 image frame and `object-fit: contain`. Captions sit outside the image without a shared panel. Portal card headings start 20px below the image, or 16px on mobile.

The portal dialog uses the frontmatter width and a maximum height of `calc(100dvh - 48px)`. Its player is 16:9. Content padding is 28px 36px 32px. At 600px the dialog width and maximum height leave 24px total viewport clearance, the radius becomes 12px, and content padding becomes 24px 20px. Long dialogs scroll internally while the gallery’s body scroll is locked.

## Elevation & Depth

The root gallery has no shadows. The portal retains flat gallery entries and uses shadows only to separate controls laid over images and the modal above its backdrop.

- Preview label: `0 3px 12px #17191e1a`.
- Dialog: `0 24px 90px #17191e33`; backdrop: `#17191e99`.
- Play disc: `0 8px 24px #0003`; player-label text shadow: `0 2px 8px #000`.

**The Flat Gallery Rule.** Keep gallery entries flat; reserve elevation for the preview overlay controls and modal.

## Shapes

Use the frontmatter radius tokens: restrained curved screenshot corners, a slightly rounder desktop dialog, compact launch actions, a pill preview label, and circular play/close controls. Screenshot borders are 1px. The player itself is a clean rectangle inside the dialog. Inline SVG arrows, play marks, and close marks share the surrounding text color.

## Components

### Gallery entries

The root entry is a direct-launch anchor. The portal entry is a full-width, left-aligned button with a screenshot, preview label, title and arrow, blue category, and supporting description. Hover changes the title/arrow and screenshot border to blue; the preview label changes to blue with white text. Keyboard focus is a 3px blue outline, offset 7px on the root and 6px in the portal.

### Launch and secondary link

The launch action uses `launch` and `launch-hover`, with a 20px gap before the external-link icon. The quieter YouTube link is muted, underlined, and uses a smaller arrow. The linked dialog title is dark by default and blue with an underline on hover. The title and launch links open the app in a new tab, retaining the portal.

### Preview label

The white `preview-action` pill sits 14px from the image’s bottom and right edges with a 15px play icon and 7px internal gap. It is part of the parent preview button, not a nested interactive control.

### Preview dialog and player

A native dialog opens with the category and a 44px circular close control above the player. For entries with walkthroughs, the poster uses the corresponding YouTube maximum-resolution thumbnail, falling back to the existing application screenshot when the remote image fails or is a tiny placeholder. The poster is shown at 0.78 opacity over dark ink, with a centered play disc and explicit label. The disc becomes 56px on mobile.

Screenshot-only previews show the application capture at full opacity with a launch link. The iframe is created only after Play. Closing by Escape, the close control, or a backdrop click removes the player and restores focus to the originating entry. Modal arrival lasts 260ms using `cubic-bezier(.16, 1, .3, 1)`, translating from 14px below and releasing a small clipping inset. Reduced-motion preference disables that animation. The poster’s focus ring is inset by 6px to stay visible within the player.

The gallery reuses the repository’s screenshots unchanged. YouTube poster images are externally sourced from the README video IDs. Review captures and asset provenance are recorded under `.impeccable/review/`; they are evidence, not shipping gallery artwork.

## Do's and Don'ts

### Do:

- Do preserve the root gallery’s white, system sans, and blue identity.
- Do reuse the existing application screenshots without changing their artwork.
- Do keep gallery images contained within their widescreen frames.
- Do preserve visible keyboard focus and reduced-motion behavior.
- Do treat the portal as an extension of the gallery, with its own documented spacing and dialog patterns.

### Don't:

- Don’t apply this gallery system to the independent applications.
- Don’t wrap the screenshot and caption together in a raised panel.
- Don’t autoplay walkthroughs when a preview opens.
- Don’t replace the actual screenshots with decorative imagery.
