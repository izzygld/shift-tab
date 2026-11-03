# Shift+Tab

**Navigate the web the way millions of people do every day. Then fix it.**

Shift+Tab is a free, open source puzzle game about web accessibility, built for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026) (theme: **SHIFT**).

You're a first-time contributor to **Commons**, the website of a small community nonprofit. People who use a keyboard, a screen reader, zoom, or switch access have filed issues: they can't sign up, donate, or find their way. Each level is one issue:

1. **Reproduce** it with the same assistive technology the reporter uses.
2. **Fix** it by choosing (and later writing) a suggested change.
3. **Verify** it with automated accessibility checks (axe-core) and by replaying it.
4. **Merge**, and hear back from the person who reported it.

> This game does not simulate disability. It teaches how assistive technology works and what developers need to build so it works well.

## Play

- Web: https://izzygld.github.io/shift-tab/ (deployed from `main`)
- itch.io: coming at jam submission

## Run locally

```sh
npm install
npm run dev       # local dev server
npm run validate  # check all levels
npm run build     # production build in dist/
```

## Accessibility of the game itself

The game aims for WCAG 2.2 AA or better: fully keyboard operable, screen reader friendly, no flashing, reduced-motion aware, and no timed failure. If anything gets in your way, please [report an accessibility barrier](https://github.com/izzygld/shift-tab/issues/new?template=accessibility-barrier.yml).

## Contributing

Levels are plain data (`levels/<id>/level.json` + `page.html`), so you can add one with a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [language guide](docs/SPEC.md#4-language-and-framing-guide).

## Purpose

- Teaches high-impact WCAG 2.2 success criteria through play.
- Aligned with UN Sustainable Development Goals 4 (Quality Education) and 10 (Reduced Inequalities).
- Planned submission to the Digital Public Goods Alliance registry after the jam.

Full proposal: [docs/SPEC.md](docs/SPEC.md).

## AI disclosure

AI coding assistants helped with scaffolding and boilerplate code. Accessibility content, issue text, and level design are human-written and are being reviewed by disabled consultants before release.

## License

- Code: [MIT](LICENSE)
- Levels and written content: [CC BY 4.0](LICENSE-CONTENT)
- Uses [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0) and [dom-accessibility-api](https://github.com/eps1lon/dom-accessibility-api) (MIT).
