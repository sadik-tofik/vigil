# TwilightBook — Cockpit & Developer Documentation

The official Next.js web application for **TwilightBook**, providing a real-time trading cockpit and developer documentation site for Solana's 24/7 tokenized-equity discrete batch auction venue.

## Overview

- **Trading Cockpit (`/`)**: Real-time terminal with live Pyth uncertainty band tracking, continuous vs. discrete batch auction mode switching, circular countdown ring, anti-sniping freeze window, depth chart, interactive order entry, and keeper settlement controls.
- **Developer Documentation (`/docs`)**: Modeled on `solana.com/docs` with persistent top navigation, collapsible left sidebar, right-rail sticky table of contents, and instant `Cmd+K` search.

## Tech Stack

- **Framework**: Next.js 15+ (App Router)
- **Styling**: Tailwind CSS v4 & custom design tokens
- **Typography**: Geist Sans & Geist Mono (monospace tabular numbers for financial data)
- **Icons**: Lucide React

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Production build
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to access the Cockpit or [http://localhost:3000/docs](http://localhost:3000/docs) for the Developer Documentation.
