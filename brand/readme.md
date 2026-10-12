# Hourly brand book, Meter

## Context
Hourly sells options on the hourly rental price of AI chips (Ornn OCPI index: H100 SXM, H200, B200, A100) on Solana, settled by oracle. The reader owns or rents GPUs and thinks in dollars per GPU-hour, not in Greeks. Compute is a utility, so the product is a meter: prices and balances roll like odometer digits.

## Content fundamentals
Voice: plain, short, concrete. Say what you get and what it costs.
Case: sentence case for headings and buttons. Product name is lowercase: hourly.
Punctuation: no em dashes, no en dashes. Ranges use "to".

| We say | We never say |
| --- | --- |
| Lock what your GPUs earn | Unlock alpha |
| Floor revenue, Collar, Cap compute cost | Put, call, strangle |
| Firm price | Premium quote |
| Test money | Free money |

## Visual foundations
Colour rule: four primitives. Enamel is the housing, black is the window, paper is the digit and the card, signal orange marks only the digit that is moving, the live dot, and the Execute button. Nothing else is orange.
Background rule: flat enamel. No gradient, no texture, no glass.
Border and shadow: 2px black borders on controls and cards, 1px rules between sections. Radius 0. No shadow.
Type: Bricolage Grotesque 700 lowercase wordmark and headings, tracked tight. DM Mono for everything numeric and for body. Closed scale of five steps: 11, 13, 16, 32, display.
Motion: hover inverts black and paper in 120ms. Reduced motion turns it off. The odometer does not animate yet (see caveats).

## Iconography
No icon set. The numbers are the picture. The only drawn thing is the mark.

## Logo
The mark is a digit caught mid-roll in a black window, split by one orange line. Files in assets/: mark.svg, mark-inverse.svg, lockup.svg (embeds a font subset so it renders as an image).
Minimum size: 16px mark, 80px lockup. Clear space: half the mark width on every side.
Permitted: black on enamel, paper on black. Forbidden: recolouring the orange line, rotating, outlining, adding a shadow, setting the wordmark in capitals.

## Index
tokens/ (colors, fonts, typography, spacing, base), assets/, guidelines/specimen.html, directions2.html (the options considered), old-freight/ (retired).

## Caveats
Every item below is a default I chose, not a ratified decision.
1. Bricolage Grotesque and DM Mono were picked by me. Not ratified.
2. ink-2 (#3b3935), ink-3 (#6a665e) and enamel-deep are derived defaults.
3. Error red and up green are defaults, not designed.
4. The mark is a first draft. It reads as an abstract glyph at 32px and is unverified below 16px.
5. Risk named in the direction sheet: Meter is the closest of the three options to a normal fintech.
6. No icon set. No dark mode.
7. Motion is a default (120ms ease-out). The odometer cells are static.
8. Components are not extracted to React files. The app uses the skin in app/public/meter.css.
9. The Freight identity was retired and is kept in old-freight/.
10. Gate 4 not met: no components/ or ui_kits/ folders. The live app is the sample screen and it uses meter.css, not extracted components.
11. Spec sheet shows hover, focus and disabled only. Loading, empty, stale states are not drawn.
12. Media queries use a literal 760px, since CSS variables do not work in media queries.
