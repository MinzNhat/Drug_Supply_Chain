# VoiceReaderAI · NAVER Vietnam AI Hackathon Demo

VoiceReaderAI is a mobile reading assistant that keeps distracted readers engaged by instantly capturing any on-screen text, narrating it with CLOVA Voice, and saving AI-powered summaries plus clean notes. This repository contains the official landing page we use for the NAVER Vietnam AI Hackathon 2025 submission.

![Preview](/public/preview.png)

## Table of Contents

- [Overview](#overview)
- [Highlights](#highlights)
- [Getting Started](#getting-started)
- [Content Structure](#content-structure)
- [Brand Assets](#brand-assets)
- [Contributing](#contributing)
- [License](#license)

## Overview

The landing page is built with **Next.js 15**, **App Router**, **Tailwind CSS v4**, **ShadCN UI**, and **Framer Motion**. It showcases the full VoiceReaderAI story—problem, solution, tech stack, pricing, roadmap, FAQ, and beta APK download CTA.

## Highlights

- ⚡️ Scroll-triggered reveal animations for every major section
- 🧠 Detailed problem/solution copy tailored to ADHD & dyslexic readers
- 🏗️ "How it works" workflow covering CLOVA OCR/Voice, LangChain, Gemini, and Pinecone
- 💸 Hackathon-ready pricing plans (Free, Pro, Team Sync)
- 📱 Hero CTA provides a direct APK download (with Android icon)
- 🧩 Tech stack grid with branded logos pulled from `/public`

## Getting Started

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000` to preview the site. Update content in `app/` and `components/` as needed.

## Content Structure

- `app/page.tsx` – Section layout + scroll reveal wrapper
- `components/hero.tsx` – Logo badge, APK CTA, highlight chips
- `components/problem-solution.tsx` – Storytelling about the attention gap
- `components/workflow.tsx` – Three-step flow + dual-path lanes
- `components/partners.tsx` – Tech stack cards with logos
- `components/pricing.tsx` – VoiceReaderAI pricing tiers
- `components/next-steps.tsx` – Post-hackathon roadmap
- `components/faq.tsx` – Business + product FAQs using the accordion UI

## Brand Assets

Place logos/illustrations inside `/public`. The stack currently uses:

- `logo_2.png` (VoiceReaderAI)
- `clova_ocr.png`, `clova_voice.png`
- `gemini.png`, `langchain.png`, `pinecone.png`
- `expressjs.png`, `naver_cloud.jpg`, `jetpack.jpg`

Swap these files to update the visuals-components reference them with `next/image`.

## Contributing

PRs are welcome! Please open an issue describing the change you’d like to make (copy tweaks, animations, asset updates, etc.) before submitting larger adjustments.

## License

MIT © VoiceReaderAI
