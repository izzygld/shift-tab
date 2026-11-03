# Shift+Tab: proposal and spec (v0.2)

> **Tagline:** Navigate the web the way millions of people do every day. Then fix it.
> **Jam:** GitHub Game Off 2026, theme "SHIFT". Deadline Dec 1, 2026, 13:37 PST.
> **Format:** Free, open source, plays in the browser, hosted on GitHub Pages and itch.io.
> **Team:** Solo ([@izzygld](https://github.com/izzygld)).

## 1. Summary

Shift+Tab is a short puzzle game that teaches web accessibility. Players use real web pages with the tools disabled people use every day: keyboard navigation, screen readers, zoom and magnification, and switch or voice input. They find the barriers that block those users, fix the HTML, and confirm the fix by playing again.

The game does **not** try to simulate what it's like to be disabled. It teaches how assistive technology works and what developers need to build so it works well.

## 2. Problem

- About 1 in 6 people worldwide live with a significant disability (WHO).
- Most home pages still have detectable accessibility failures. The WebAIM Million report regularly finds about 95%. *(Check the latest figure before publishing.)*
- In 2026 this is a legal requirement as well as best practice: the ADA Title II web rule has compliance deadlines starting April 2026, and the European Accessibility Act has been enforced since June 2025.
- Most developers learn accessibility from long checklists. Few have ever used a site with only a keyboard or a screen reader.

## 3. Goals and non-goals

**Goals**

- Teach 8–10 high-impact WCAG 2.2 criteria through play.
- Build the habit: navigate, notice, fix, verify.
- Make the game itself WCAG 2.2 AA or better.
- Open source, with levels as data that anyone can extend by pull request.
- Eligible as a Digital Public Good (SDG 4 Quality Education, SDG 10 Reduced Inequalities).

**Non-goals**

- Disability simulation, or "empathy through hardship" games.
- Replacing real assistive technology testing or certification.
- Being a full WCAG course. The game links to the official W3C resources.

## 4. Language and framing guide

| Use | Avoid |
|---|---|
| disabled people / people with disabilities (follow the person's preference) | the disabled, handicapped, differently abled, special needs |
| screen reader user, keyboard user, switch user | "the blind user" as a character type |
| mouse user, typical setup | normal user, regular user |
| wheelchair user | wheelchair-bound, confined to a wheelchair |
| has low vision / is Deaf / hard of hearing | suffers from, afflicted with, victim of |
| barrier, inaccessible, blocked | broken person, impaired user |
| quick check, confidence check | sanity check |
| placeholder, sample value | dummy |
| gap, oversight, missed issue | blind spot, turn a blind eye |
| allowlist / blocklist, main | whitelist / blacklist, master |
| "the website failed the user" | "the user couldn't handle it" |

**Framing rules**

- The website is the problem, never the person (social model of disability).
- "Nothing about us without us": disabled people review content, shape the issue voices, and are paid to playtest. Credit them.
- No characters who exist only to be "helped". Reporters are capable people doing ordinary things.
- No "inspiration" framing, no pity music or visuals.
- Say "assistive technology", not "special tools".

## 5. Theme fit (SHIFT)

- **Shift+Tab** is the real shortcut for moving focus backward.
- **Shift perspective:** switch between input and output modes.
- **Shift left:** fix accessibility before code ships.
- **Shift the default:** accessible from the start, not an add-on.

## 6. Setting and player role

**Decision: the player has no name. They are "you", a first-time contributor.** The named people are the issue reporters.

Why: "your first open source contribution" is a story GitHub already tells, so the game reinforces it. Players see themselves in the role instead of watching a hero. And the reporters stay at the center, which matches the framing rules.

The project is **Commons**, the open source website of a fictional community nonprofit (donations, volunteer signup, events). A community event is coming up Friday, and people using assistive technology have filed issues because they can't take part.

Each level follows the real open source workflow:

**Issue → reproduce → suggested change → checks → reporter confirms → merge.**

The final screen links to real open source accessibility issues (for example, on For Good First Issue), so the game ends with a real first contribution.

## 7. Core loop

1. **Read the issue**, written in the reporter's own voice.
2. **Reproduce it** in the mode the issue names. This step can be skipped, so there is never a hard failure state.
3. **Notice** the barrier: focus disappears, the screen reader says "button" with no name, and so on.
4. **Fix it** using suggested changes (see section 7a).
5. **Verify it:** automated checks run (axe-core plus custom rules), then the player replays in that mode.
6. **Merge:** the reporter replies and the site improves.

### 7a. How fixing works

**Decision: a hybrid built on "suggested changes" diffs.**

- **Levels 1–3:** Pick from 2–3 suggested changes, each shown as a red/green code diff like a code review suggestion. At least one wrong option is plausible, and some wrong options **pass automated checks but are still wrong** (for example, `alt="logo"`). That teaches the most important lesson in accessibility testing: automated tools catch only some problems.
- **Levels 4+:** A "write your own change" editor unlocks, limited to the relevant part of the page and validated by the same checks.

Why: it mirrors code review and CI checks that every developer knows, beginners and non-coders can play from minute one, and it's a natural way to show automated accessibility checks running in CI.

## 8. Modes (perspective shifts)

| Mode | What the player experiences | Status |
|---|---|---|
| Keyboard only | Tab, Shift+Tab, Enter, Space, arrows; mouse is off for the page | Built |
| Screen reader view | Live readout of role, name and state on focus, with optional speech and adjustable rate | Built |
| Zoom and reflow | 200% text, 400% zoom / 320px reflow | Planned |
| Switch and voice | Scanning selection, "click [name]" commands | Planned |
| Contrast and color | Contrast and color-only meaning checks, framed as a design test | Planned |

## 9. Levels

| # | Level | Barrier | WCAG 2.2 | Status |
|---|---|---|---|---|
| 1 | Find Your Way | Focus outline removed | 2.4.7, 1.4.11 | Built |
| 2 | Nameless Buttons | Unnamed icon button, logo link with no alt text | 1.1.1, 2.4.4, 4.1.2 | Built |
| 3 | Div Soup | Clickable `<div>`s that keyboards can't reach | 2.1.1, 4.1.2 | Planned |
| 4 | No Way Out | Modal traps keyboard focus | 2.1.2 | Planned |
| 5 | Form Fail | Placeholder used as label, errors shown only in red | 1.3.1, 3.3.1, 1.4.1 | Planned |
| 6 | Small Targets | Tiny tap targets, drag-only controls | 2.5.8, 2.5.7 | Planned |
| 7 | Friday Night (final) | Donation checkout combining earlier barriers, plus a timeout | 2.2.1 + earlier | Planned |

Stretch: reflow (1.4.10), contrast (1.4.3), headings and landmarks (1.3.1 / 2.4.1), focus hidden under sticky headers (2.4.11), motion (2.2.2, 2.3.3).

## 10. The game's own accessibility (release gate)

- Fully playable with a keyboard only, and with NVDA and VoiceOver.
- Focus is managed when content changes, and status messages go to a live region.
- Captions or visual equivalents for any audio.
- Respects reduced-motion and forced-colors settings; no flashing.
- No timers that can fail the player; reproduce steps can be skipped.
- Pass/fail is shown in text, not by color alone.
- An accessibility statement and an issue template for reporting barriers.

## 11. Technical approach

- TypeScript and Vite, as a static site on GitHub Pages, deployed by GitHub Actions.
- Levels are real HTML/CSS in an iframe (`srcdoc`), so focus, ARIA and zoom behave like a real browser.
- Checks: axe-core injected into the level page, plus custom checks (for example, focus indicator size and contrast).
- Screen reader view: `dom-accessibility-api` (computes accessible names and roles), plus the Web Speech API for optional speech.
- Content as data: `levels/<id>/level.json` + `page.html`, checked by `scripts/validate-levels.mjs` in CI.
- Privacy: no tracking, no accounts; progress is saved in local storage only.

## 12. Audio direction

- Short audio cues for focus moving, a barrier being hit, and checks passing, each with a visual equivalent.
- Optional speech in the screen reader view with adjustable rate (up to 3x), showing respectfully that experienced users often listen fast.

## 13. Partners and outreach (later)

- Candidates: Knowbility (AccessU), AbleGamers, W3C WAI resources, Deque (axe-core).
- Paid playtesters: 3–5 disabled testers covering screen reader, keyboard/switch, and low vision.

## 14. Digital Public Good checklist

- [x] OSI-approved license (MIT code, CC BY 4.0 content)
- [x] SDG mapping: 4 and 10
- [x] Clear ownership and documentation
- [x] No personal data collected
- [ ] Do-no-harm review: language guide + consultant sign-off
- [ ] Submit to the Digital Public Goods Alliance registry after the jam

## 15. Timeline

| Dates | Milestone |
|---|---|
| Nov 3–7 | Spec, repo, Pages, engine, levels 1–2 ✅ |
| Nov 8–14 | Levels 3–4, sound cues, polish shell |
| Nov 15–21 | "Write your own change" editor, levels 5–6 |
| Nov 22–26 | Level 7, playtests, accessibility audit of the game |
| Nov 27–Dec 1 | Polish, itch.io page, final README, AI disclosure, **submit** |
| Dec 3 | International Day of Persons with Disabilities: launch post |
| May 20, 2027 | Global Accessibility Awareness Day: second push, community levels |

## 16. Success metrics

- Players who complete all levels.
- WCAG criteria fixed per player.
- Community levels and translations merged.
- Partner endorsement or a GitHub mention.
- Jam ranking (Innovation, Theme).

## 17. Risks

| Risk | Mitigation |
|---|---|
| Comes across as disability simulation or "inspiration" content | Language guide, consultant review, focus on the tools rather than the people |
| Screen reader view differs from real screen readers | Labeled as approximate, with links to free NVDA and VoiceOver guides |
| Scope for one solo month | 7 levels max; stretch levels after the jam |
| The game itself is inaccessible | Release gate in section 10, with tester sign-off |

## 18. Open questions

- Which partner to contact first (deferred).
