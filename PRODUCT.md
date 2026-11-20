# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

GPT6 Demos is a collection of fifteen browser demos and one native desktop demo. Its portal lets visitors discover the demos, watch walkthroughs, and open applications.

## Operating Context

The root README and index.html define the current demos, images, video links, and local ports. run-all.sh starts fifteen browser demos on ports 3001–3015 by default and a portal server on port 3000.

## Capabilities and Constraints

The requested new portal lives in portal/. Gallery items open a preview with a fuller description and either a screenshot or an embedded YouTube walkthrough. Video plays in the page on request. Demo title and launch links open the app in a new tab, preserving the portal. Use plain HTML, CSS, and JavaScript with the existing screenshots. YouTube playback requires internet access and an HTTP origin; apps require their local servers.

## Brand Commitments

User request: minimalist, enticing, clear, light design, based on the root index.html. Existing identity: GPT6 Demos, screenshot-led gallery.

## Evidence on Hand

README.md contains descriptions of the demos and YouTube links where available. index.html contains screenshot paths, concise descriptions, and localhost app URLs. images/ contains existing application screenshots; images/portal.png shows the complete plain gallery.

## Open Decisions

No additional audience or deployment requirements were supplied. The portal follows the existing local development workflow.
