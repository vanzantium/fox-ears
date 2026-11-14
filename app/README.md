# Fox Ears

A prosthetic listening instrument. Play a file or the demo etude; the song paints; seal a map (lead sheet + field + Sonofield function). Repeat listens refine a **Jukebox** song model without treating the same digital file as extra evidence.

Three memories per recording (never collapsed):

- **Song model** — measured hypotheses (tonic family, pulse, climax, open questions)
- **Listening history** — sealed receipts per pass (orientation → recurrence → harmonic → vocal → contradiction → familiar)
- **Zaau appraisal** — interpreted, grounded in that listen’s evidence; cannot rewrite the model

## Run

```bash
npm install
npm run dev
```

Dev server: `http://0.0.0.0:8080`

```bash
npm run typecheck
```

Stack: TanStack Start + React 19 + Vite + Tailwind v4. Optional sign-in for saved maps and Grok transduction (`XAI_API_KEY`). Lyrics lookup uses [lrclib.net](https://lrclib.net) by filename (`Artist - Title`); Fox Ears will not invent words.

## Pass along

This zip is source only (`node_modules` omitted). After `npm install`, play a track, **Seal map**, then open **Jukebox**.
