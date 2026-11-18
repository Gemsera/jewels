# Cluster Jewel Layout Lab (PoE1)

Interactive tool that shows where notables, jewel sockets and small passives land on
Path of Exile 1 cluster jewels (rare Large/Medium/Small and Megalomaniac), on every
cluster socket of the passive tree, plus one-click searches on pathofexile.com/trade.

## Deploy on GitHub Pages
1. Create a repository and upload **the contents of this folder** (index.html at the repo root).
2. Repository → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
3. Open `https://<your-user>.github.io/<repo>/` after a minute.

Everything is static (no build step). `.nojekyll` makes Pages serve files as-is.
To test locally run `python3 -m http.server` in this folder and open http://localhost:8000
(opening index.html directly from disk won't work because data.json is loaded with fetch).

## Files
- `index.html` – page layout and styling (Bulma 1.0.2 + custom dark theme)
- `app.js` – UI, rendering, trade links
- `cluster.js` – cluster placement engine (port of Path of Building's `PassiveSpec:BuildSubgraph`)
- `data.json` – tree 3.30 geometry, cluster sockets/proxies/orbit offsets, notables, enchants, trade stat IDs
- `css/bulma.min.css` – Bulma (MIT license)

## Credits
Placement logic and game data derived from [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding) (MIT).
Unofficial fan tool, not affiliated with or endorsed by Grinding Gear Games.

## SEO / social previews
`index.html` contains a meta description, Open Graph and Twitter card tags, and schema.org
`WebApplication` data. Link previews (Discord, Reddit, X) work best with an **absolute** image URL:
once you know your Pages address, change `og:image` and `twitter:image` from `og-image.png` to
`https://<your-user>.github.io/<repo>/og-image.png`, and optionally add
`<link rel="canonical" href="https://<your-user>.github.io/<repo>/">`.
