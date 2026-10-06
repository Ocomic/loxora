# Bundled typefaces

The app bundles its typefaces and never loads them from the internet (Milestone 14, section 8).
The font files come from the Fontsource npm packages listed in `packages/app/package.json` and
are copied into the built web client by Vite. All three are licensed under the SIL Open Font
License 1.1; the license texts are in this folder.

| Typeface | Use | Package | License |
|---|---|---|---|
| Orbitron | headings and buttons | `@fontsource/orbitron` | [orbitron-OFL.txt](./orbitron-OFL.txt) |
| Exo 2 | text | `@fontsource/exo-2` | [exo-2-OFL.txt](./exo-2-OFL.txt) |
| Share Tech Mono | labels | `@fontsource/share-tech-mono` | [share-tech-mono-OFL.txt](./share-tech-mono-OFL.txt) |
