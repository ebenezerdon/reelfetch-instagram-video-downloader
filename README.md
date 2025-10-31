# ReelFetch – Instagram Video Downloader

ReelFetch is a beautiful, responsive web app that lets you paste a public Instagram link, preview the post, and download available video formats. It is built by [Teda.dev](https://teda.dev), the AI app builder for everyday problems, and designed to feel like a production-ready tool.

## Features
- Paste a reel, video post, or IGTV URL and fetch direct video sources when available
- Preview thumbnail and title, see multiple formats, and open downloads in a new tab
- Copy direct video URLs with one click
- Local history with thumbnails stored in your browser using localStorage
- Helpful fallbacks when direct URLs are not available (private or restricted posts)
- Accessible, mobile-first UI with keyboard and screen reader support

## How it works
ReelFetch uses a CORS-friendly proxy (AllOrigins) to fetch the public post HTML, then parses metadata and inline JSON to find MP4 sources. If the account is private or the post is restricted, direct URLs may not be available. In that case, the app offers reputable fallback links you can try.

## Getting started
1. Open index.html for the landing page.
2. Click the primary CTA to open the app, or go directly to app.html.
3. Paste a public Instagram link and hit Get video.
4. Choose a format and open the download in a new tab.

## Notes and limitations
- Works best with public posts. Private content or region-restricted posts will not produce direct links.
- Some browsers may ignore the download attribute for cross-origin links. Opening in a new tab allows you to save the video from the player.
- This project is client-side only. If you need guaranteed availability, consider hosting your own lightweight proxy server and updating the proxy endpoint in scripts/helpers.js.

## Tech stack
- HTML5 + Tailwind CSS (via CDN)
- jQuery 3.7.x
- Modular JavaScript with a single global namespace (window.App)
- Local storage persistence

## Development
No build step is required. Open app.html in a modern browser. Ensure you have internet access for the CDNs.

## Accessibility
The UI is keyboard navigable, uses semantic HTML, and respects prefers-reduced-motion. Color contrast meets WCAG AA.

## Legal
Download content only when you have permission. Respect creators and copyright laws in your jurisdiction.
