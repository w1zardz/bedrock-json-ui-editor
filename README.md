# Bedrock JSON UI Editor

A free, open-source **visual editor** for Minecraft Bedrock Edition JSON UI files. Edit scoreboard, HUD, shimmer, and any UI element positions without manually tweaking JSON.

**[Live Editor](https://w1zardz.github.io/bedrock-json-ui-editor/)**

## Features

- **Drag on the preview** — grab any box and move it; the `offset` is rewritten as you drag, snapped to the current step size
- **Real UI pixels** — the preview is a Bedrock screen (427×240 desktop, 520×240 phone, 320×240 tablet), so every number on screen is the number the client uses
- **Parent-relative layout** — children are measured against their own parent, which is how you catch a label spilling out of its panel
- **Off-screen is shown, not hidden** — anything past the edge is hatched in red and called out in the status bar instead of being quietly clamped into view
- **HUD landmarks** — hotbar, health, hunger, chat, sidebar and the client logo are drawn as guides, so you can line an element up against what the game already draws
- **Real text preview** — labels render your sample string with the declared `text_alignment`, and `wrap_content` / `100%c` are measured from that text instead of a made-up constant
- **References resolved** — `element@namespace.other` inheritance and `factory.control_name` entries are drawn where the player will actually see them
- **Live measurements** — the status bar shows size and the distance from the selection to all four screen edges
- **Keyboard + undo** — arrow keys nudge (Shift ×10), Ctrl+Z / Ctrl+Shift+Z walk the history
- **Visual Property Editing** — adjust `offset`, `size`, `anchor_from`, `anchor_to`, `alpha`, `layer`, and more with intuitive controls
- **Nudge Buttons** — move elements up/down/left/right with configurable step size (0.5px to 20px)
- **Long Press** — hold nudge buttons for continuous movement (perfect for mobile)
- **Element Tree** — navigate your JSON UI structure with collapsible tree, search, and type badges
- **Mobile-First** — fully optimized for phones and tablets with tab navigation
- **Draft autosave** — your work is kept in the browser and restored on the next visit
- **Export** — copy to clipboard or download the modified JSON file
- **No Backend** — runs entirely in your browser, works offline

## How to Use

1. Open the [editor](https://w1zardz.github.io/bedrock-json-ui-editor/)
2. Paste your JSON UI file (e.g., `scoreboard.json`, `hud_screen.json`)
3. Click **Parse & Edit**
4. Select elements from the tree, or click them straight on the preview
5. Drag boxes on the preview, nudge with the arrow keys, change anchors, tweak alpha/layer
6. Pick your screen size and type a sample string to see real text in place
7. Click **Export JSON** to get the result

## Common Use Cases

- **Move the scoreboard** up or down on screen
- **Adjust shimmer** animation position and size
- **Reposition HUD elements** like hotbar, health, hunger
- **Fine-tune offsets** that are hard to guess from raw JSON
- **Edit UI mods** for PocketMine-MP / PMMP servers

## Supported Properties

| Property | Editor |
|---|---|
| `offset` | Nudge buttons (arrow keys) + direct input |
| `size` | Width/height text inputs |
| `anchor_from` / `anchor_to` | Dropdown with all 9 anchor points |
| `alpha` | Number slider (0-1) |
| `layer` | Number input |
| `visible` / `enabled` | Checkbox toggle |
| Animation `from`/`to`/`duration`/`easing` | Direct input |
| `$variables` | Text input |
| `text` / `text_alignment` | Rendered with your sample string, aligned as declared |
| `factory` / `@` references | Drawn in place inside their owner |
| `100%c`, `wrap_content`, `100% - 4px` | Measured from the actual content |

## Tech Stack

Pure HTML + CSS + JavaScript. No frameworks, no build step, no dependencies. Deploys to GitHub Pages as-is.

## Contributing

Issues and PRs welcome! If you have ideas for new features or find bugs, please [open an issue](https://github.com/w1zardz/bedrock-json-ui-editor/issues).

## License

MIT
