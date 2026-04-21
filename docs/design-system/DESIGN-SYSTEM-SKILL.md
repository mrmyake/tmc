---
name: the-movement-club-design
description: Use this skill to generate well-branded interfaces and assets for The Movement Club (boutique training studio, Loosdrecht), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available
files (`colors_and_type.css`, `assets/`, `preview/`, `ui_kits/website/`,
`ui_kits/member/`).

The brand language is **dark, warm, boutique, editorial**. Deep warm blacks
(never `#000`), stone off-whites, **one** champagne accent per view. A serif
display (Fraunces, weight 400+, SOFT 0) paired with a quiet sans (Inter).
Generous whitespace, asymmetric grids, one idea per viewport. No emoji, no
em-dashes, no blue, no pills (except tiny status chips). Motion is slow: 500–
800ms with `cubic-bezier(0.2, 0.7, 0.1, 1)`.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc),
**copy assets out** of this skill and create static HTML files for the user to
view. Always link `colors_and_type.css` — never redefine tokens.

If working on production code, copy assets and read the rules here to become
an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they
want to build or design, ask some questions, and act as an expert designer who
outputs HTML artifacts *or* production code, depending on the need.
