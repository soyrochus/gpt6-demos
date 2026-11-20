---
name: Temblor
description: Desktop arena launcher and first-person match HUD.
colors:
  burn: "#ff7846"
  ink: "#f6f2e8"
  muted: "#c5c4b6"
  panel: "#171b19"
typography:
  display:
    fontSize: "clamp(4rem, 11vw, 10rem)"
    fontWeight: 950
    lineHeight: 0.93
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Arial, sans-serif"
  hud-label:
    fontSize: "11px"
    letterSpacing: "0.1em"
  hud-value:
    fontSize: "38px"
    lineHeight: 1
rounded:
  button: "2px"
spacing:
  launcher-inset: "clamp(24px, 5vw, 76px)"
  action-gap: "12px"
components:
  button-primary:
    backgroundColor: "{colors.burn}"
    textColor: "#1a100c"
    rounded: "{rounded.button}"
    padding: "14px 20px"
  button-secondary:
    backgroundColor: "#1b211fff"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "14px 20px"
  volume:
    width: "45%"
  vitals:
    backgroundColor: "#0c100de6"
    padding: "8px 16px"
  score:
    backgroundColor: "#0b100cdb"
    padding: "8px 12px"
---

# Temblor

## Overview

The launcher shows the arena before the player enters it. A darkened levelshot gives the title, match rules and Play button a readable left edge. During play, four small groups of information leave the opponent and crosshair in view.

## Colors

Orange marks the main action, keyboard focus, range controls and the slashes between match details. Warm off-white carries headings and primary values. Muted ivory carries supporting labels. Charcoal surfaces keep text legible over changing map textures.

## Typography

The launcher title is heavy, italic and uppercase. The map name and match conditions sit together on one line when space permits. The HUD sets short uppercase labels above much larger tabular health, armor and ammo values.

## Layout

The launcher distributes the identity, action group and footer down the viewport. Below 650 px the footer stacks, actions wrap more tightly and the header retains just the mark and name. In the HUD, map and time sit at top left, both scores at top right, vitals at bottom left and the current weapon and ammo at bottom right.

## Elevation & Depth

The launcher darkens the levelshot most strongly behind its copy. Dialogs use an opaque panel, a thin border and a shadow over a dimmed backdrop. The HUD uses translucent dark plates and a text shadow to hold contrast while the camera moves.

## Shapes

The slanted orange mark repeats the motion of the title. Buttons have nearly square corners. The centered white crosshair rotates into an X on a hit.

## Components

Play pairs its label with a right-pointing triangle. Secondary buttons open the importer, controls and map details. Keyboard focus uses a 3 px orange outline with a 5 px offset. In a match, the score strip keeps both players and the frag limit together. The health and armor plate shares a baseline with the ammunition plate.
