# Contributing to Shift+Tab

Thanks for helping make the web work for more people.

## Ways to help

- **Report a barrier in the game.** Use the [accessibility barrier template](https://github.com/izzygld/shift-tab/issues/new?template=accessibility-barrier.yml). These are top priority.
- **Add a level.** One accessibility issue, one page, a few suggested fixes.
- **Translate** issue text and feedback (coming after the jam).

## Level format

Each level is a folder in `levels/`:

```
levels/03-your-level/
  level.json   # issue, task, suggested fixes, checks
  page.html    # the broken page the player explores
```

Key fields in `level.json`:

| Field | Purpose |
|---|---|
| `id` | Must match the folder name |
| `order` | Position in the level list (unique) |
| `wcag` | Success criteria taught, with links to the W3C Understanding docs |
| `modes` | `keyboard`, `screen-reader`, and/or `pointer` (mouse or touch) |
| `issue` | Number, title, reporter (name + assistive technology they use), body paragraphs |
| `task` | What the player does to reproduce the barrier. `goalSelector` marks an element whose click completes it, `goalKey` a key press (for example `Escape`). For time-based goals, the page can run `document.dispatchEvent(new CustomEvent('shift-tab:goal'))` |
| `fixes` | Groups of suggested changes. Each group has a `find` snippet (must appear exactly once in `page.html`) and `options` with `replace`, `correct`, and `feedback` |
| `checks` | axe-core rule IDs and/or custom checks that must pass to merge. Custom checks: `focus-indicator`, `native-controls`, `modal-escape`, `visible-label`, `error-identification`, `no-drag-only`, `timing-adjustable`, `state-exposed` |
| `merged` | The reporter's reply and "what you learned" bullets |

Run `npm run validate` before opening a pull request. CI runs it too.

Include at least one plausible wrong option per group. Learning why a fix doesn't work is part of the game. Wrong options that still pass automated checks are especially valuable, because they teach that automated tools don't catch everything.

## Writing guidelines

Please follow the [language and framing guide](docs/SPEC.md#4-language-and-framing-guide). In short:

- The website is the problem, never the person.
- Reporters are capable people doing everyday things like donating, registering, or checking out. Write them that way, with no pity and no "inspiration" framing.
- Use "disabled people" or "people with disabilities", and respect individual preference. Avoid "suffers from", "wheelchair-bound", "special needs", "normal user", and idioms like "blind spot" or "sanity check".
- Name the technology: "screen reader user", "keyboard user", "switch user".

Issue text for new levels is reviewed by disabled consultants before release.

## Security

Level pages run in an iframe on the game's origin. Don't include external scripts or network requests in `page.html`; level pull requests are reviewed for this.
