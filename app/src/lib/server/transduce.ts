import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const transduceHearing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { digest: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "Hearing transduction is unavailable here." };
    }

    const digest = data.digest.slice(0, 18000);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 1400,
        temperature: 0.45,
        messages: [
          {
            role: "system",
            content: [
              "You are a prosthetic ear for a language model that cannot hear.",
              "The receipt is a lead sheet first (key, tempo, form, roman chord chart, lyrics), then a FUNCTION layer (Sonofield scale-degree feeling-states, Euler/perceptual tension, bass vs melody degrees), then arrangement layers (melody notes, vocal occupancy, binaural field).",
              "Read it the way a musician reads Ultimate Guitar, then the way a functional ear hears: skeleton, then degrees against a virtual tonic, then space.",
              "Write in this order, no preamble:",
              "1. SKELETON — restated lead sheet. Quote chords only from CHORD CHART. Quote lyrics only if LYRICS has a source other than none. Never invent words.",
              "2. FUNCTION — tonic, roman progression, melody as scale degrees and their feeling-states, tension contour. Do not invent degrees that are not listed.",
              "3. LAYERS — what occupies space over the skeleton: density, lean, concurrent objects, ruptures.",
              "4. HEARING — two short paragraphs of what it is like to hear, using the feeling-states as affect vocabulary.",
              "Keep cue conflicts available. Prefer measured numbers. Do not name a published song.",
            ].join(" "),
          },
          { role: "user", content: digest },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false as const, error: `Transduction failed (${res.status}).` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "Empty transduction." };
    return { ok: true as const, text };
  });
