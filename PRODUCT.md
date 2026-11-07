# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite, React 19 and Tailwind CSS v4, plain JavaScript, static site.

## Users

Students learning digital logic (intro course level). They build small circuits to understand what each gate does and how signals combine.

## Product Purpose

A logic gate emulator: place input switches, gates and outputs on a canvas, wire them, toggle inputs and see the result. Success means a student can build a circuit, predict its output, and check that prediction without help.

## Operating Context

Used on desktop (mouse + keyboard) and on tablets with touch. Controls must work with fingers: large hit targets for ports and wires, no hover-only actions.

## Capabilities and Constraints

- Node types today: input switch (ON/OFF), OUTPUT, NOT, AND, AND (3 inputs), NAND, OR, NOR, XOR.
- Wires connect an output port to an input port; nodes can be deleted.
- In scope for drafts: live truth table for the current circuit, signal state (0/1) visible on wires, saving and sharing named circuits.
- Not in scope yet: custom chips / packaging a circuit as a reusable block.

## Evidence on Hand

Reference screenshots of an existing emulator with poor UI and UX (gate picker in a native select, "Add node" button, full-screen toggle, yellow-filled active nodes). Treat them as anti-reference for the look and as the source for the feature set. No brand name, logo, or user research exists; do not invent them.

## Product Principles

- Make the signal visible: a student should see where a 1 flows without reading labels.
- Direct manipulation over forms: place gates by dragging or tapping from a visible palette, not by picking from a dropdown and pressing a button.
- Prediction before answer: the truth table and outputs support checking a guess, not replacing it.
- Touch is first-class, not a fallback.
