# BOEKUNA — Canonical Brand Identity

Status: **canonical source of truth**  
Approved reference: user-supplied BOEKUNA identity board, 5 October 2026  
Applies to: public BOEKUNA brand, marketing website, social/brand applications and future visual alignment work.

This document supersedes older marketing palette directions such as **Calm Control teal**, **lime/cyan**, and black/white-only editorial experiments. Those may remain in repository history or product-specific legacy layers, but they are not the source of truth for BOEKUNA brand presentation.

## Core identity

BOEKUNA should feel direct, sober, trustworthy, simple and practical.

Primary brand expression:
- **Boekuna.**
- Descriptor: **Boekhouden zonder gedoe.**
- Brand promise language should stay simple and avoid unnecessary bookkeeping jargon.

## Canonical colours

| Role | HEX |
|---|---|
| Primary anthracite | `#1B1F23` |
| Accent green | `#63D471` |
| Light gray | `#F6F7F8` |
| Text gray | `#8A949C` |
| White | `#FFFFFF` |

Rules:
- Anthracite is the primary ink/dark-surface colour.
- Green is the single brand accent for dots, primary CTAs, active states and small highlights.
- Light gray is the default quiet supporting surface.
- White is the main canvas.
- Text gray is for secondary copy and metadata.
- Pale green tints may be derived from `#63D471` for quiet backgrounds; do not introduce a second cyan/teal brand accent.
- Do **not** use `#E7FE55` or `#BFE7EC` as BOEKUNA brand colours.
- Do **not** use `#123B3A` / `#2B736C` as the public marketing brand palette.

## Typography

### Headlines
**Space Grotesk**

Use for:
- H1–H3
- large statements
- major numerical callouts
- BOEKUNA wordmark treatment when the outlined/custom asset is not used

### Interface and body copy
**Inter**

Use for:
- paragraphs
- navigation
- buttons
- form labels
- tables
- interface text
- captions and metadata

## Wordmark

Default light-background treatment:
- “Boekuna” in anthracite `#1B1F23`
- terminal dot in green `#63D471`

Dark-background treatment:
- “Boekuna” in white `#FFFFFF`
- terminal dot remains green `#63D471`

Do not recolour the wordmark lime, cyan, teal or decorative gradients.

## App / favicon expression

Preferred compact expression:
- green `#63D471` field
- anthracite `#1B1F23` “B.” mark

A white-field variant with anthracite B and green dot is acceptable where a green field is unsuitable.

## Visual language

Use:
- bright white canvas
- restrained light-gray sections
- green as a deliberate accent, not a wash over every surface
- generous whitespace
- simple outlined icons
- rounded but practical cards/controls
- real, natural entrepreneur imagery when photography is used

Avoid:
- cyan/lime palette systems
- petrol/teal as main brand colour
- excessive gradients
- fake finance imagery
- over-designed bookkeeping language
- decorative screenshots when the page does not need them

## Brand values

- Direct
- Nuchter
- Betrouwbaar
- Eenvoudig
- Praktisch

## Marketing website contract

The public website may use a strong editorial composition and motion system, provided:
1. the canonical palette above remains intact;
2. Space Grotesk + Inter remain the typography pair;
3. screenshots/mockups are only used when explicitly approved;
4. the BOEKUNA green is `#63D471`;
5. the layout never introduces lime/cyan as alternate brand colours;
6. accessibility and reduced-motion behavior remain intact.

## Current correction

PR #212 restores this canonical identity after an incorrect lime/cyan marketing pass. Regression tests explicitly block the incorrect colour tokens and removed lime-logo assets from returning.
