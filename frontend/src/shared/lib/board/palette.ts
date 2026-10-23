// tldraw's default palette has no Miro-like yellows: its pale yellow is beige,
// its sticky notes orange-ish and frame backgrounds near-white. These light-theme
// overrides give yellow fills, notes and frames Miro's tones. Applied by the
// board canvas; backend/scripts/import-miro.ts applies them too, so it matches
// Miro colours against what the board actually renders.
const PALETTE_OVERRIDES = {
  yellow: {
    semi: '#fbe89c', // pale fill (fill style 'solid')
    fill: '#ffdc4a', // full fill (fill style 'fill')
    noteFill: '#fff9b1',
    frameFill: '#fff6b6', // frame background, with frame colours on
    frameHeadingFill: '#fff6b6',
  },
};

// Mutates tldraw's DefaultColorThemePalette, which the editor reads at render time.
export function applyPaletteOverrides(palette: { lightMode: object }): void {
  const theme = palette.lightMode as Record<string, object>;
  for (const [color, values] of Object.entries(PALETTE_OVERRIDES)) Object.assign(theme[color], values);
}
