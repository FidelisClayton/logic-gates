# logic-gates

**Try it:** https://fidelisclayton.github.io/logic-gates/

A logic gate emulator for students learning digital logic. Place input switches, gates and outputs on a canvas, wire them, toggle the inputs and watch each wire carry a 0 or a 1, with a live truth table beside the canvas. Runs in any browser, desktop or tablet touch; nothing leaves the browser.

Stack: Vite, React and Tailwind CSS v4 in plain JavaScript. The look is the approved draft "A minimal" (tokens in `src/index.css`, dark and light). UI in English, Spanish, Portuguese (Brazil), German and French.

## Run

```
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # static site in dist/
npm run preview    # serve dist/ on 127.0.0.1
npm test           # node --test src/
```

Live at https://fidelisclayton.github.io/logic-gates/. Every push to `main` runs the tests, builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## What it does

- **Add parts:** drag a row from the left rail, click or tap it, press its key (`I Q N A 3 D O R X E`), or press `⌘K` / `Ctrl+K`.
- **Wire:** drag from an output port to an input port, or tap an output port and then an input port. A wire that would make a loop is refused. Connecting to an occupied input replaces its wire.
- **Edit:** tap a node or wire to select it (Duplicate `⌘D`, Delete `⌫`). Drag a node to move it; drag empty canvas to pan. `⌘Z` / `⇧⌘Z` undo and redo (toggling an input is not a step).
- **Auto format:** `⇧F`, the canvas button or `⌘K` lays the circuit out left to right by signal flow, as one undo step.
- **Truth table:** up to 6 inputs, current row highlighted, "Cover OUT to predict" hides the output column until you click a row.
- **Notation:** the right column (desk) and the bottom sheet (below 1024px) have two tabs, Truth table (default) and Notation. Notation shows each OUT as algebra (`A·B`, `A + B`, `A ⊕ B`, NOT as an overline) with one row per gate and its live value; hovering or focusing a row, or a gate on the canvas, highlights the matching part of the circuit and the panel. Below it, an expression editor builds a circuit: tap keypad tiles, drag a tile to a drop caret, or type (`(a+b)(c+d)`, `'` after a letter or bracket for NOT, `! ~ ¬` before). Errors show live; Build circuit replaces the current circuit or adds to the canvas, as one undo step with an Undo toast. On phones the keypad sits at the foot of the expanded sheet, above the toolbar.
- **Circuits:** a sidebar at the far left lists every circuit (name and part count). Click one to open it; the "New circuit" row adds one; the `⋯` on a row renames it inline, saves a copy or deletes it. The header icon button or `⌘K` "Toggle sidebar" hides it, and the choice is remembered. Below 1280px it starts closed and opens over the parts rail; it closes on selection, `Esc` or a tap outside. Everything autosaves to `localStorage`.
- **Share:** the Share button copies a link with the circuit in the URL hash (`#c=...`). Opening one loads it as an unsaved copy that saves on its first edit or on Save.
- **Language and theme:** language follows the browser on first visit; the language and theme buttons in the header save the choice.

## Layout

- `src/logic.js`: pure logic (evaluate, cycle check, truth table, encode/decode with validation). Tested in `src/logic.test.js`.
- `src/layout.js`: `autoLayout`, pure, only changes x/y; wires spanning several columns reserve a slot per column with dummy nodes. Tested in `src/layout.test.js`.
- `src/geometry.js`: ports, bounds and square-wire routing (A* on a 12px lattice around node boxes, trunk sharing for fan-out; full re-route of 40 wires costs ~10ms, so a drag re-routes only the dragged node's wires). Tested in `src/geometry.test.js` and `src/route.test.js`.
- `src/i18n.js`: the five dictionaries; `src/i18n.test.js` checks they have the same keys and placeholders.
- `src/notation.js`: pure circuit to expression, tokens, parser and expression to circuit; tested in `src/notation.test.js`. `src/components/NotationPanel.jsx`, `ExprEditor.jsx`, `Keypad.jsx` and `Expr.jsx` are the Notation tab.
- `src/useEditor.js`: circuit state and the undo stack. `src/components/`: Header, Sidebar, PartsRail, Canvas, TruthTable, SelectionBar, CommandPalette, popovers.

## Puts on the machine

Nothing. Browser `localStorage` keys: `logic-gates:circuits`, `:cur`, `:theme`, `:locale`, `:sidebar`.
