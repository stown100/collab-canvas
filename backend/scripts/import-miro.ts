/**
 * Imports a Miro board into a new collab-canvas board.
 *
 *   nvm use 22   # PDF pages are rendered by pdf.js through @napi-rs/canvas (Node ≥ 22)
 *   npm run import:miro -- <miro-board-id> --owner <email> [--title "…"] [--apply]
 *
 * Reads the board through the Miro REST API (MIRO_ACCESS_TOKEN, scope
 * boards:read) and converts supported items to tldraw records: frames, texts,
 * sticky notes, shapes, images, PDF pages (rendered to images), link embeds,
 * mind maps (from the experimental API) and connectors between imported items.
 * Text is laid out with tldraw's own fonts, so sizes match the editor. Square
 * stickies become notes; rectangular ones — and any whose text can't fit a
 * note — become resizable coloured boxes. Files go to the asset store (R2), records
 * to board_records, and the board's Liveblocks room is seeded with the same
 * records (LIVEBLOCKS_SECRET_KEY). Without --apply it only reports what would
 * be imported and validates every record against the tldraw schema.
 *
 * Colours are matched to tldraw's palette with the app's overrides
 * (frontend/src/shared/lib/board/palette.ts); coloured frames keep their background.
 * The content is moved so its top-left corner sits at the canvas origin, where
 * boards open. Items the API returns without content (isSupported: false —
 * drawings, tables, flip cards, emoji, stamps, free-standing connectors) or
 * without a real position (e.g. table cells) can't be imported; they are listed
 * as skipped.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type {
  TLArrowBinding,
  TLArrowShape,
  TLAssetId,
  TLDefaultColorStyle,
  TLDefaultDashStyle,
  TLDefaultHorizontalAlignStyle,
  TLDefaultVerticalAlignStyle,
  TLFrameShape,
  TLGeoShape,
  TLImageAsset,
  TLImageShape,
  TLNoteShape,
  TLPageId,
  TLParentId,
  TLRecord,
  TLRichText,
  TLShape,
  TLShapeId,
  TLTextShape,
} from '@tldraw/tlschema';
import type { IndexKey } from '@tldraw/utils';
import { getPool } from '../src/services/db';
import { createAsset, deleteAsset } from '../src/services/boardAssets';
import { saveRecords, type RecordsDelta } from '../src/services/boardRecords';
// The app's palette overrides, so imported colours are matched to what the board renders.
import { applyPaletteOverrides } from '../../frontend/src/shared/lib/board/palette';

dotenv.config({ path: path.join(__dirname, '../.env') });

// TypeScript compiles `import()` to `require()` under CommonJS; this keeps a
// real dynamic import for the ES-module-only packages (tldraw schema, pdf.js).
const importEsm = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>;

type TlSchemaModule = typeof import('@tldraw/tlschema');
type TlUtilsModule = typeof import('@tldraw/utils');
type PdfjsModule = typeof import('pdfjs-dist');

const MIRO_API = 'https://api.miro.com/v2';
// Mind map node content is only available from the experimental API.
const MIRO_EXPERIMENTAL_API = 'https://api.miro.com/v2-experimental';
const LIVEBLOCKS_API = 'https://api.liveblocks.io/v2';
const TLDRAW_CDN = 'https://cdn.tldraw.com';
const PAGE_ID = 'page:page' as TLPageId;

// Files are served through Vercel functions, so keep each well under 4.5 MB.
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;
const PDF_PAGE_LONG_SIDE = 2000;

// tldraw text sizes: shapes use size 's' and `scale` to get any font size.
const BASE_FONT_SIZE = 18;
const LABEL_PADDING = 16;
const LINE_HEIGHT = 1.35;
const LIST_INDENT_EM = 1.5;
const NOTE_SIZE = 200;
// Font size ranges for fitting sticky text: notes in their unscaled 200px space,
// boxes in board pixels.
const NOTE_MAX_FONT_SIZE = 32;
const NOTE_MIN_FONT_SIZE = 8;
const STICKY_BOX_MAX_FONT_SIZE = 32;
const MIN_LABEL_FONT_SIZE = 6;
// Per-string widths vary around the average font ratio; a little slack keeps
// Miro's single-line texts on one line.
const TEXT_WIDTH_SLACK = 1.04;

// ---------------------------------------------------------------------------
// Miro API
// ---------------------------------------------------------------------------

interface MiroItem {
  id: string;
  type: string;
  isSupported?: boolean;
  data?: Record<string, any>;
  style?: Record<string, string>;
  geometry?: { width?: number; height?: number; rotation?: number };
  position?: { x: number; y: number; relativeTo?: string };
  parent?: { id: string };
}

interface MiroConnector {
  id: string;
  isSupported?: boolean;
  startItem?: { id: string };
  endItem?: { id: string };
  style?: Record<string, string>;
}

function miroToken(): string {
  const token = process.env.MIRO_ACCESS_TOKEN;
  if (!token) throw new Error('MIRO_ACCESS_TOKEN is not set in backend/.env');
  return token;
}

// Retries server errors and rate limits — the Miro API returns occasional 5xx.
async function miroGet<T>(url: string, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${miroToken()}` } });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status >= 500 || res.status === 429;
    if (!retryable || i >= attempts) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Miro API ${res.status}: ${body.message ?? res.statusText} (${url})`);
    }
    const retryAfter = Number(res.headers.get('retry-after')) || i;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
  }
}

async function miroList<T>(boardId: string, endpoint: string, api = MIRO_API): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const query = `limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await miroGet<{ data: T[]; cursor?: string }>(
      `${api}/boards/${encodeURIComponent(boardId)}/${endpoint}?${query}`,
    );
    out.push(...page.data);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

// Image and document URLs answer with a short-lived download link.
async function miroDownload(resourceUrl: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const { url } = await miroGet<{ url: string }>(resourceUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} (${resourceUrl})`);
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream',
  };
}

// ---------------------------------------------------------------------------
// Styles: Miro → tldraw
// ---------------------------------------------------------------------------

const STICKY_COLORS: Record<string, TLDefaultColorStyle> = {
  gray: 'grey',
  light_yellow: 'yellow',
  yellow: 'yellow',
  orange: 'orange',
  light_green: 'light-green',
  green: 'green',
  dark_green: 'green',
  cyan: 'light-blue',
  light_pink: 'light-red',
  pink: 'light-red',
  violet: 'violet',
  red: 'red',
  light_blue: 'light-blue',
  blue: 'blue',
  dark_blue: 'blue',
  black: 'black',
};

const SERIF_FONTS = new Set(['georgia', 'tiempos_text', 'eb_garamond', 'abril_fatface', 'pt_serif', 'merriweather', 'playfair_display', 'bodoni', 'serif']);
const MONO_FONTS = new Set(['roboto_mono', 'ibm_plex_mono', 'source_code_pro', 'monospace']);

const GEO_SHAPES: Record<string, TLGeoShape['props']['geo']> = {
  rectangle: 'rectangle',
  round_rectangle: 'rectangle',
  circle: 'ellipse',
  triangle: 'triangle',
  rhombus: 'diamond',
  parallelogram: 'rhombus',
  trapezoid: 'trapezoid',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  star: 'star',
  cloud: 'cloud',
  cross: 'x-box',
  left_arrow: 'arrow-left',
  right_arrow: 'arrow-right',
  left_right_arrow: 'arrow-right',
};

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

// sRGB hex → CIELAB (D65), where distance follows perceived colour difference
// far better than raw RGB (e.g. mauve isn't matched to mint green).
function toLab(hex: string): [number, number, number] | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// The candidate whose hex is perceptually closest to `color`.
function closest<T extends { hex: string }>(color: string, candidates: T[]): T | null {
  const lab = toLab(color);
  if (!lab) return null;
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const [l, a, b] = toLab(candidate.hex)!;
    const distance = (l - lab[0]) ** 2 + (a - lab[1]) ** 2 + (b - lab[2]) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [candidate, distance];
  }
  return best;
}

type ColorTheme = TlSchemaModule['DefaultColorThemePalette']['lightMode'];

// Matches Miro colours to tldraw colours as the board renders them: the light
// theme with the app's palette overrides applied (see main).
function colorMatcher(theme: ColorTheme, colorNames: readonly TLDefaultColorStyle[]) {
  const swatches = (key: 'solid' | 'semi' | 'fill' | 'frameFill') =>
    colorNames.map((color) => ({ color, hex: theme[color][key] }));
  // A box paints its fill as the colour's pale tint (fill 'solid') or its full colour (fill 'fill').
  const fills = [
    ...swatches('semi').map((s) => ({ ...s, fill: 'solid' as const })),
    ...swatches('fill').map((s) => ({ ...s, fill: 'fill' as const })),
  ].filter((s) => s.color !== 'white');
  const strokes = swatches('solid');
  const frames = swatches('frameFill');

  return {
    // Stroke / text colour.
    color: (hex: string | undefined, fallback: TLDefaultColorStyle = 'black') =>
      (hex && closest(hex, strokes)?.color) || fallback,
    // Colour and fill style that paint closest to a Miro fill.
    fill: (hex: string): { color: TLDefaultColorStyle; fill: 'solid' | 'fill' } => {
      const match = closest(hex, fills);
      return match ? { color: match.color, fill: match.fill } : { color: 'yellow', fill: 'solid' };
    },
    // Frame colour whose background is closest to a Miro frame fill.
    frame: (hex: string) => closest(hex, frames)?.color ?? 'black',
  };
}

function isWhitish(color: string | undefined): boolean {
  const rgb = color && parseHex(color);
  return !!rgb && rgb.every((c) => c > 235);
}

type Font = 'sans' | 'serif' | 'mono';

function fontFor(family: string | undefined): Font {
  if (family && SERIF_FONTS.has(family)) return 'serif';
  if (family && MONO_FONTS.has(family)) return 'mono';
  return 'sans';
}

function dashFor(style: string | undefined): TLDefaultDashStyle {
  return style === 'dashed' ? 'dashed' : style === 'dotted' ? 'dotted' : 'solid';
}

function horizontalAlign(align: string | undefined): TLDefaultHorizontalAlignStyle {
  return align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
}

function verticalAlign(align: string | undefined): TLDefaultVerticalAlignStyle {
  return align === 'middle' ? 'middle' : align === 'bottom' ? 'end' : 'start';
}

// Miro's fonts are often narrower than tldraw's IBM Plex. Text scaled by the
// width ratio keeps Miro's line breaks, and so its height and layout. Measured as
// the advance width of sample board text in the Miro font (from Google Fonts;
// Gelasio for the Georgia-like Tiempos) over the tldraw font it maps to. Fonts
// not listed (Noto Sans, Open Sans) are at least as wide and keep their size.
const FONT_WIDTH_RATIO: Record<string, number> = {
  pt_sans: 0.93,
  fredoka_one: 0.973,
  eb_garamond: 0.795,
  abril_fatface: 0.951,
  georgia: 0.924,
  tiempos_text: 0.924,
};

// Font size to use in tldraw: Miro's, shrunk for narrower Miro fonts (never enlarged).
function fontSizeOf(item: MiroItem, fallback = 14): number {
  const size = Number(item.style?.fontSize) || fallback;
  return size * Math.min(1, FONT_WIDTH_RATIO[item.style?.fontFamily ?? ''] ?? 1);
}

// ---------------------------------------------------------------------------
// Rich text: Miro HTML → tldraw (TipTap) JSON
// ---------------------------------------------------------------------------

type Mark = { type: string; attrs?: Record<string, string> };
type Inline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
type Block = { type: string; content?: (Block | Inline)[] };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const MARK_TAGS: Record<string, string> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  s: 'strike',
  strike: 'strike',
  del: 'strike',
  code: 'code',
  a: 'link',
};

// Converts the HTML subset Miro uses (p, br, strong/em/u/s, a, ol/ul/li, span)
// into nodes tldraw's editor understands. Inline colors and fonts are dropped.
function htmlToRichText(html: string): TLRichText {
  const blocks: Block[] = [];
  const lists: Block[] = []; // open <ol>/<ul>, innermost last
  const listItems: Block[] = []; // open <li>, innermost last
  const marks: { tag: string; mark: Mark | null }[] = [];
  let paragraph: Block | null = null;

  const container = (): Block[] => (listItems.length ? (listItems[listItems.length - 1].content as Block[]) : blocks);
  const openParagraph = (): Block => {
    if (!paragraph) {
      paragraph = { type: 'paragraph', content: [] };
      container().push(paragraph);
    }
    return paragraph;
  };
  const closeParagraph = () => {
    if (!paragraph) return;
    const content = paragraph.content as Inline[];
    while (content.length && content[content.length - 1].type === 'hardBreak') content.pop();
    if (!content.length) delete paragraph.content;
    paragraph = null;
  };
  const activeMarks = (): Mark[] | undefined => {
    const seen = new Map<string, Mark>();
    for (const { mark } of marks) if (mark) seen.set(mark.type, mark);
    return seen.size ? [...seen.values()] : undefined;
  };

  for (const [, closing, rawTag, attrs, text] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    if (text !== undefined) {
      const value = decodeEntities(text);
      if (!value) continue;
      if (!paragraph && !value.trim()) continue;
      const node: Inline = { type: 'text', text: value };
      const active = activeMarks();
      if (active) node.marks = active;
      (openParagraph().content as Inline[]).push(node);
      continue;
    }

    const tag = rawTag.toLowerCase();
    if (tag === 'br') {
      (openParagraph().content as Inline[]).push({ type: 'hardBreak' });
    } else if (tag === 'p' || tag === 'div') {
      closeParagraph();
      if (!closing) openParagraph();
    } else if (tag === 'ol' || tag === 'ul') {
      closeParagraph();
      if (!closing) {
        const list: Block = { type: tag === 'ol' ? 'orderedList' : 'bulletList', content: [] };
        container().push(list);
        lists.push(list);
      } else {
        const list = lists.pop();
        if (list && !list.content?.length) container().splice(container().indexOf(list), 1);
      }
    } else if (tag === 'li') {
      closeParagraph();
      if (!closing && lists.length) {
        const list = lists[lists.length - 1];
        // Miro (Quill) writes every list as <ol>; bullets are marked on the items.
        const kind = /data-list="(bullet|ordered)"/i.exec(attrs)?.[1];
        if (kind && !list.content!.length) list.type = kind === 'bullet' ? 'bulletList' : 'orderedList';
        const item: Block = { type: 'listItem', content: [] };
        list.content!.push(item);
        listItems.push(item);
      } else if (closing) {
        // TipTap requires a list item to start with a paragraph.
        const item = listItems.pop();
        if (item && item.content?.[0]?.type !== 'paragraph') item.content = [{ type: 'paragraph' }, ...(item.content ?? [])];
      }
    } else if (tag in MARK_TAGS || tag === 'span') {
      if (closing) {
        const at = marks.map((m) => m.tag).lastIndexOf(tag);
        if (at >= 0) marks.splice(at, 1);
      } else {
        const type = MARK_TAGS[tag];
        const href = type === 'link' ? decodeEntities(/href="([^"]*)"/i.exec(attrs)?.[1] ?? '') : '';
        const mark = !type ? null : type === 'link' ? (href ? { type, attrs: { href } } : null) : { type };
        marks.push({ tag, mark });
      }
    }
  }
  closeParagraph();

  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] } as TLRichText;
}

// ---------------------------------------------------------------------------
// Text layout, measured with tldraw's own fonts
// ---------------------------------------------------------------------------

const FONT_FILES: Record<Font, { regular: string; bold: string }> = {
  sans: { regular: 'IBMPlexSans-Medium', bold: 'IBMPlexSans-Bold' },
  serif: { regular: 'IBMPlexSerif-Medium', bold: 'IBMPlexSerif-Bold' },
  mono: { regular: 'IBMPlexMono-Medium', bold: 'IBMPlexMono-Bold' },
};
const fontFamily = (font: Font, bold: boolean) => `tl_${font}${bold ? '_bold' : ''}`;

// The installed version of a package (its exports may hide package.json).
function packageVersion(name: string): string {
  for (let dir = path.dirname(require.resolve(name)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    const pkg = fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pkg?.name === name) return pkg.version;
  }
  throw new Error(`Cannot find the version of ${name}`);
}

// Registers the fonts tldraw renders text with (from its CDN), so wrapping and
// heights computed here match the editor.
async function loadFonts(): Promise<void> {
  const version = packageVersion('@tldraw/tlschema');
  for (const [font, files] of Object.entries(FONT_FILES) as [Font, { regular: string; bold: string }][]) {
    for (const bold of [false, true]) {
      const file = bold ? files.bold : files.regular;
      const res = await fetch(`${TLDRAW_CDN}/${version}/fonts/${file}.woff2`);
      if (!res.ok) throw new Error(`Font download failed: ${res.status} (${file})`);
      GlobalFonts.register(Buffer.from(await res.arrayBuffer()), fontFamily(font, bold));
    }
  }
}

type Run = { text: string; bold: boolean };
type Line = { runs: Run[]; indent: number };

// Lines of a rich text document (paragraphs, split at hard breaks) as styled
// runs; list items carry their nesting depth for indentation.
function textLines(doc: TLRichText): Line[] {
  const lines: Line[] = [];
  const walk = (node: any, depth: number) => {
    if (node.type === 'paragraph') {
      let runs: Run[] = [];
      for (const child of node.content ?? []) {
        if (child.type === 'hardBreak') {
          lines.push({ runs, indent: depth });
          runs = [];
        } else if (child.text) {
          runs.push({ text: child.text, bold: !!child.marks?.some((m: Mark) => m.type === 'bold') });
        }
      }
      lines.push({ runs, indent: depth });
    } else {
      const inList = node.type === 'bulletList' || node.type === 'orderedList';
      for (const child of node.content ?? []) walk(child, inList ? depth + 1 : depth);
    }
  };
  walk(doc, 0);
  return lines;
}

const measureContext = createCanvas(1, 1).getContext('2d');

// Rows a line takes when wrapped at maxWidth like CSS: between words, and
// anywhere inside a word longer than the line.
function wrappedRows(runs: Run[], font: Font, fontSize: number, maxWidth: number): number {
  let rows = 1;
  let x = 0;
  for (const { text, bold } of runs) {
    measureContext.font = `${fontSize}px ${fontFamily(font, bold)}`;
    for (const token of text.split(/(\s+)/)) {
      if (!token) continue;
      const width = measureContext.measureText(token).width;
      if (!token.trim()) {
        if (x > 0) x += width;
        continue;
      }
      if (x > 0 && x + width > maxWidth) {
        rows++;
        x = 0;
      }
      if (width > maxWidth) {
        rows += Math.ceil(width / maxWidth) - 1;
        x = width % maxWidth;
      } else x += width;
    }
  }
  return rows;
}

// Height of rich text laid out at this font size and width, as tldraw renders it.
function measureTextHeight(doc: TLRichText, font: Font, fontSize: number, width: number): number {
  const rows = textLines(doc).reduce((sum, { runs, indent }) => {
    const lineWidth = Math.max(width / 2, width - indent * LIST_INDENT_EM * fontSize);
    return sum + wrappedRows(runs, font, fontSize, lineWidth);
  }, 0);
  return Math.max(1, rows) * fontSize * LINE_HEIGHT;
}

// Width of the longest line when nothing wraps.
function measureTextWidth(doc: TLRichText, font: Font, fontSize: number): number {
  return Math.max(0, ...textLines(doc).map(({ runs }) =>
    runs.reduce((sum, { text, bold }) => {
      measureContext.font = `${fontSize}px ${fontFamily(font, bold)}`;
      return sum + measureContext.measureText(text).width;
    }, 0),
  ));
}

// Largest font size, from max down to min in half-pixel steps, at which the text
// fits the label area `box` gives for that size; null if it doesn't fit at min.
function fitFontSize(
  doc: TLRichText,
  font: Font,
  box: (fontSize: number) => { width: number; height: number },
  max: number,
  min: number,
): number | null {
  for (let size = max; size >= min; size -= 0.5) {
    const { width, height } = box(size);
    if (width > 0 && measureTextHeight(doc, font, size, width) <= height) return size;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Files: images and PDF pages
// ---------------------------------------------------------------------------

interface PendingAsset {
  assetId: TLAssetId;
  name: string;
  mimeType: string;
  bytes: Buffer;
  w: number;
  h: number;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

// Reads the image's pixel size and shrinks oversized files (re-encoded as WebP,
// which keeps transparency) so they stay servable.
async function prepareImage(bytes: Buffer, mimeType: string): Promise<{ bytes: Buffer; mimeType: string; w: number; h: number }> {
  const image = await loadImage(bytes);
  let { width: w, height: h } = image;
  if (bytes.length <= MAX_ASSET_BYTES && Math.max(w, h) <= MAX_IMAGE_SIDE) return { bytes, mimeType, w, h };

  for (let side = Math.min(Math.max(w, h), MAX_IMAGE_SIDE); ; side = Math.round(side * 0.75)) {
    const scale = side / Math.max(image.width, image.height);
    w = Math.max(1, Math.round(image.width * scale));
    h = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(w, h);
    canvas.getContext('2d').drawImage(image, 0, 0, w, h);
    const encoded = await canvas.encode('webp', 85);
    if (encoded.length <= MAX_ASSET_BYTES || side < 512) return { bytes: encoded, mimeType: 'image/webp', w, h };
  }
}

async function loadPdfjs(): Promise<{ pdfjs: PdfjsModule; root: string }> {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('Rendering PDF pages needs Node ≥ 22 (pdf.js loads @napi-rs/canvas). Run `nvm use 22`.');
  }
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await importEsm<PdfjsModule>(pathToFileURL(path.join(root, 'legacy/build/pdf.mjs')).href);
  return { pdfjs, root };
}

async function renderPdfPages(
  pdf: Buffer,
  { pdfjs, root }: { pdfjs: PdfjsModule; root: string },
): Promise<{ bytes: Buffer; w: number; h: number }[]> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep,
    cMapUrl: path.join(root, 'cmaps') + path.sep,
    cMapPacked: true,
    verbosity: 0,
  }).promise;

  const pages: { bytes: Buffer; w: number; h: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PDF_PAGE_LONG_SIDE / Math.max(base.width, base.height) });
    // pdf.js' own canvas factory, so its internal canvases come from the same @napi-rs/canvas.
    const { canvas, context } = (doc as any).canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({ bytes: await canvas.encode('jpeg', 85), w: canvas.width, h: canvas.height });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

// Miro shows each page of a multi-page PDF as its own item but doesn't say which
// page — they are laid out in reading order, so rows top to bottom, then left to right.
function readingOrder(items: MiroItem[], center: (item: MiroItem) => { x: number; y: number }): MiroItem[] {
  const sorted = [...items].sort((a, b) => center(a).y - center(b).y);
  const rows: MiroItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    const tolerance = (item.geometry?.height ?? 0) / 2;
    if (row && Math.abs(center(row[0]).y - center(item).y) < tolerance) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => center(a).x - center(b).x));
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

// Stacking inside a frame: page scans and pictures at the back, notes on top.
const LAYER: Record<string, number> = { frame: 0, document: 1, image: 2, shape: 3, textbox: 3, mindmap_node: 3, sticky_note: 4, text: 5, embed: 5, arrow: 6 };
const EMPTY_RICH_TEXT = { type: 'doc', content: [{ type: 'paragraph' }] } as TLRichText;

interface Converted {
  records: TLRecord[];
  assets: PendingAsset[];
  imported: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
}

async function convert(
  items: MiroItem[],
  connectors: MiroConnector[],
  tl: TlSchemaModule,
  utils: TlUtilsModule,
  log: (message: string) => void,
): Promise<Converted> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const imported: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const warnings: string[] = [];
  const count = (bucket: Record<string, number>, key: string) => (bucket[key] = (bucket[key] ?? 0) + 1);

  const shapeId = (miroId: string) => `shape:${miroId}` as TLShapeId;
  const imageTotal = items.filter((i) => i.type === 'image').length;
  const colors = colorMatcher(tl.DefaultColorThemePalette.lightMode, tl.defaultColorNames);

  // Absolute centre of an item in board coordinates.
  const center = (item: MiroItem): { x: number; y: number } => {
    const { x = 0, y = 0, relativeTo } = item.position ?? { x: 0, y: 0 };
    const parent = item.parent && byId.get(item.parent.id);
    if (relativeTo !== 'parent_top_left' || !parent) return { x, y };
    const p = center(parent);
    return { x: p.x - (parent.geometry?.width ?? 0) / 2 + x, y: p.y - (parent.geometry?.height ?? 0) / 2 + y };
  };

  // Nearest frame among an item's ancestors (mind map nodes nest in each other):
  // tldraw nests shapes only in frames.
  const frameOf = (item: MiroItem): MiroItem | null => {
    let parent = item.parent && byId.get(item.parent.id);
    while (parent && parent.type !== 'frame') parent = parent.parent && byId.get(parent.parent.id);
    return parent || null;
  };
  const topLeft = (item: MiroItem) => {
    const c = center(item);
    return { x: c.x - (item.geometry?.width ?? 0) / 2, y: c.y - (item.geometry?.height ?? 0) / 2 };
  };

  // A tldraw shape's x/y is its top-left corner in the parent's coordinates
  // (frame or page), and it rotates around that corner — so the corner is the
  // centre minus the half-size vector turned by the rotation.
  const place = (item: MiroItem, w: number, h: number, rotation: number): { parentId: TLParentId; x: number; y: number } => {
    const frame = frameOf(item);
    const origin = frame ? topLeft(frame) : { x: 0, y: 0 };
    const c = center(item);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      parentId: frame ? shapeId(frame.id) : PAGE_ID,
      x: c.x - origin.x - (w / 2) * cos + (h / 2) * sin,
      y: c.y - origin.y - (w / 2) * sin - (h / 2) * cos,
    };
  };

  type Draft = { shape: TLShape; layer: number; order: number };
  const drafts: Draft[] = [];
  const assetRecords: TLImageAsset[] = [];
  const assets: PendingAsset[] = [];
  const bindings: TLArrowBinding[] = [];

  const base = (item: MiroItem, type: string, w: number, h: number) => {
    const rotation = ((item.geometry?.rotation ?? 0) * Math.PI) / 180;
    return {
      id: shapeId(item.id),
      typeName: 'shape' as const,
      type,
      rotation,
      index: 'a1' as IndexKey,
      isLocked: false,
      opacity: 1,
      meta: { miroId: item.id },
      ...place(item, w, h, rotation),
    };
  };
  const add = (shape: TLShape, layer: string, item: MiroItem, kind = layer) => {
    drafts.push({ shape, layer: LAYER[layer], order: items.indexOf(item) });
    count(imported, kind);
  };

  // An arrow bound to both items, inside their frame when they share one; it
  // aims at their centres unless exact (normalized) anchor points are given.
  const addArrow = (
    id: string,
    start: MiroItem,
    end: MiroItem,
    style: Pick<TLArrowShape['props'], 'color' | 'dash' | 'arrowheadStart' | 'arrowheadEnd'>,
    kind: string,
    anchors?: Record<'start' | 'end', { x: number; y: number }>,
  ) => {
    const frame = frameOf(start);
    const shared = frame && frame === frameOf(end) ? frame : null;
    const origin = shared ? topLeft(shared) : { x: 0, y: 0 };
    const a = center(start);
    const b = center(end);
    const arrowId = `shape:${id}` as TLShapeId;
    const arrow = {
      id: arrowId,
      typeName: 'shape',
      type: 'arrow',
      x: a.x - origin.x,
      y: a.y - origin.y,
      rotation: 0,
      index: 'a1' as IndexKey,
      parentId: shared ? shapeId(shared.id) : PAGE_ID,
      isLocked: false,
      opacity: 1,
      meta: { miroId: id },
      props: {
        kind: 'arc', labelColor: 'black', fill: 'none', size: 's', font: 'sans',
        start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y }, bend: 0,
        richText: EMPTY_RICH_TEXT, labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5, ...style,
      },
    } as TLArrowShape;
    drafts.push({ shape: arrow, layer: LAYER.arrow, order: Number.MAX_SAFE_INTEGER });
    count(imported, kind);
    for (const [terminal, target] of [['start', start], ['end', end]] as const) {
      bindings.push({
        id: `binding:${id}-${terminal}` as TLArrowBinding['id'],
        typeName: 'binding',
        type: 'arrow',
        fromId: arrowId,
        toId: shapeId(target.id),
        props: {
          terminal,
          normalizedAnchor: anchors?.[terminal] ?? { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: !!anchors,
          snap: 'none',
        },
        meta: {},
      });
    }
  };

  // A Miro fill worth drawing: opaque enough, not near-white, and not just the
  // background of the frame it sits on (which the frame itself already shows).
  const visibleFill = (item: MiroItem, opacity: number): string | null => {
    const color = item.style?.fillColor;
    if (!color || opacity <= 0.05 || isWhitish(color)) return null;
    return color.toLowerCase() === frameOf(item)?.style?.fillColor?.toLowerCase() ? null : color;
  };

  // A box with the text as its label, sized to the item; the label font is the
  // largest that fits (labels use size 's' scaled, with scaled padding).
  const fitLabelFontSize = (richText: TLRichText, font: Font, w: number, h: number, max: number, min: number) => {
    const box = (size: number) => {
      const padding = (LABEL_PADDING * size) / BASE_FONT_SIZE;
      return { width: w - 2 * padding, height: h - 2 * padding };
    };
    return fitFontSize(richText, font, box, max, min) ?? min;
  };

  const addImage = (item: MiroItem, asset: PendingAsset) => {
    const w = item.geometry?.width ?? asset.w;
    const h = item.geometry?.height ?? asset.h;
    assets.push(asset);
    assetRecords.push({
      id: asset.assetId,
      typeName: 'asset',
      type: 'image',
      props: {
        name: asset.name,
        src: '/api/boards/pending/assets/pending',
        w: asset.w,
        h: asset.h,
        mimeType: asset.mimeType,
        isAnimated: asset.mimeType === 'image/gif',
        fileSize: asset.bytes.length,
      },
      meta: { miroId: item.id },
    });
    add(
      {
        ...base(item, 'image', w, h),
        props: { w, h, playing: true, url: '', assetId: asset.assetId, crop: null, flipX: false, flipY: false, altText: asset.name },
      } as TLImageShape,
      item.type,
      item,
    );
  };

  for (const item of items) {
    if (item.isSupported === false) {
      count(skipped, item.type);
      continue;
    }
    // Items inside containers the API doesn't support (table cells and the like)
    // come back parentless at exactly the canvas centre — their real position is unknown.
    if (!item.parent && item.position?.x === 0 && item.position?.y === 0) {
      count(skipped, `${item.type} (no position, e.g. in a table)`);
      continue;
    }
    const w = item.geometry?.width ?? 0;
    const h = item.geometry?.height ?? 0;

    switch (item.type) {
      case 'frame': {
        const name = decodeEntities((item.data?.title ?? '').replace(/<[^>]+>/g, ''));
        // A coloured frame keeps its background (the app shows frame colours).
        const fill = item.style?.fillColor;
        const color = fill && !isWhitish(fill) ? colors.frame(fill) : 'black';
        add({ ...base(item, 'frame', w, h), props: { w, h, name, color } } as TLFrameShape, 'frame', item);
        break;
      }

      case 'text': {
        const fontSize = fontSizeOf(item);
        const scale = fontSize / BASE_FONT_SIZE;
        const font = fontFor(item.style?.fontFamily);
        const richText = htmlToRichText(item.data?.content ?? '');
        const width = (w || 200) * TEXT_WIDTH_SLACK;
        const color = colors.color(item.style?.color);
        const background = visibleFill(item, Number(item.style?.fillOpacity ?? 0));

        // Text with a coloured background becomes a filled box with the text as its
        // label, widened by tldraw's label padding so the text keeps Miro's width.
        if (background) {
          const padding = LABEL_PADDING * scale;
          const boxW = width + 2 * padding;
          const boxH = measureTextHeight(richText, font, fontSize, width) + 2 * padding;
          add(
            {
              ...base(item, 'geo', boxW, boxH),
              props: {
                geo: 'rectangle', w: boxW, h: boxH, growY: 0, scale, url: '', dash: 'solid', ...colors.fill(background),
                labelColor: color, size: 's', font, align: horizontalAlign(item.style?.textAlign), verticalAlign: 'start', richText,
              },
            } as TLGeoShape,
            'textbox',
            item,
            'text → box',
          );
          break;
        }
        add(
          {
            ...base(item, 'text', width, measureTextHeight(richText, font, fontSize, width)),
            props: {
              color, size: 's', font, textAlign: horizontalAlign(item.style?.textAlign) as TLTextShape['props']['textAlign'],
              w: width / scale, richText, scale, autoSize: false,
            },
          } as TLTextShape,
          'text',
          item,
        );
        break;
      }

      case 'sticky_note': {
        const color = STICKY_COLORS[item.style?.fillColor ?? ''] ?? (item.style?.fillColor?.startsWith('#') ? colors.color(item.style.fillColor, 'yellow') : 'yellow');
        const richText = htmlToRichText(item.data?.content ?? '');
        const align = horizontalAlign(item.style?.textAlign);
        const valign = verticalAlign(item.style?.textAlignVertical);

        // tldraw notes are square: a square sticky stays a note, its text sized to
        // fit Miro's note (in the note's unscaled 200px space).
        const scale = Math.max(w, 1) / NOTE_SIZE;
        const growY = Math.max(0, h / scale - NOTE_SIZE);
        const noteBox = () => ({ width: NOTE_SIZE - 2 * LABEL_PADDING, height: NOTE_SIZE + growY - 2 * LABEL_PADDING });
        const noteFontSize =
          item.data?.shape === 'square' ? fitFontSize(richText, 'sans', noteBox, NOTE_MAX_FONT_SIZE, NOTE_MIN_FONT_SIZE) : null;
        if (noteFontSize !== null) {
          add(
            {
              ...base(item, 'note', w, h),
              props: {
                color, labelColor: 'black', size: 'm', font: 'sans', fontSizeAdjustment: noteFontSize,
                align, verticalAlign: valign, growY, url: '', richText, scale,
              },
            } as TLNoteShape,
            'sticky_note',
            item,
          );
          break;
        }

        // Rectangular stickies, and those whose text can't fit a note, become a
        // resizable box in the sticky's colour.
        const fontSize = fitLabelFontSize(richText, 'sans', w, h, STICKY_BOX_MAX_FONT_SIZE, MIN_LABEL_FONT_SIZE);
        add(
          {
            ...base(item, 'geo', w, h),
            props: {
              geo: 'rectangle', w, h, growY: 0, scale: fontSize / BASE_FONT_SIZE, url: '', dash: 'solid',
              color, fill: 'solid', labelColor: 'black', size: 's', font: 'sans', align, verticalAlign: valign, richText,
            },
          } as TLGeoShape,
          'sticky_note',
          item,
          'sticky_note → box',
        );
        break;
      }

      case 'mindmap_node': {
        // Content comes from the experimental API (see main); the node's own style
        // drives the outline, its text view the label.
        const view = item.data?.nodeView ?? {};
        const richText = htmlToRichText(view.data?.content ?? '');
        const fontSize = Number(view.style?.fontSize ?? item.style?.fontSize) || 14;
        const scale = fontSize / BASE_FONT_SIZE;
        const labelColor = colors.color(view.style?.color);

        if (item.style?.shape === 'none') {
          // Text-only branch: keep single-line labels on one line despite font differences.
          const singleLine = h < 2 * fontSize * LINE_HEIGHT;
          const width = singleLine ? Math.max(w, measureTextWidth(richText, 'sans', fontSize) + 2) : w;
          add(
            {
              ...base(item, 'text', width, measureTextHeight(richText, 'sans', fontSize, width)),
              props: { color: labelColor, size: 's', font: 'sans', textAlign: 'middle', w: width / scale, richText, scale, autoSize: false },
            } as TLTextShape,
            'mindmap_node',
            item,
          );
        } else {
          // Miro sizes branch outlines to the bare text; widen them by the label
          // padding so the text stays on one line. The height stays Miro's unless
          // the text itself needs more.
          const padding = LABEL_PADDING * scale;
          const width = Math.max(w, measureTextWidth(richText, 'sans', fontSize) + 2 * padding);
          const height = Math.max(h, measureTextHeight(richText, 'sans', fontSize, width - 2 * padding));
          add(
            {
              ...base(item, 'geo', width, height),
              props: {
                geo: item.style?.shape === 'pill' ? 'oval' : 'rectangle', w: width, h: height, growY: 0, scale, url: '', dash: 'solid',
                color: colors.color(item.style?.nodeColor), fill: 'none', labelColor,
                size: 's', font: 'sans', align: 'middle', verticalAlign: 'middle', richText,
              },
            } as TLGeoShape,
            'mindmap_node',
            item,
          );
        }
        break;
      }

      case 'shape': {
        const style = item.style ?? {};
        const font = fontFor(style.fontFamily);
        const richText = htmlToRichText(item.data?.content ?? '');
        // Miro's font size, smaller if tldraw's label padding leaves too little room.
        const fontSize = fitLabelFontSize(richText, font, w, h, fontSizeOf(item), MIN_LABEL_FONT_SIZE);
        const background = visibleFill(item, Number(style.fillOpacity ?? 1));
        add(
          {
            ...base(item, 'geo', w, h),
            props: {
              geo: GEO_SHAPES[item.data?.shape ?? ''] ?? 'rectangle', w, h, growY: 0, scale: fontSize / BASE_FONT_SIZE, url: '',
              dash: dashFor(style.borderStyle),
              ...(background ? colors.fill(background) : { color: colors.color(style.borderColor), fill: 'none' }),
              labelColor: colors.color(style.color), size: 's', font,
              align: horizontalAlign(style.textAlign), verticalAlign: verticalAlign(style.textAlignVertical), richText,
            },
          } as TLGeoShape,
          'shape',
          item,
        );
        break;
      }

      case 'embed': {
        const url = item.data?.url ?? '';
        const title = decodeEntities(item.data?.title || item.data?.providerName || url);
        const description = decodeEntities(item.data?.description ?? '');
        const fontSize = 14;
        const scale = fontSize / BASE_FONT_SIZE;
        // Text nodes must not be empty (ProseMirror), so empty parts are left out.
        const richText = {
          type: 'doc',
          content: [
            title
              ? { type: 'paragraph', content: [{ type: 'text', text: title, ...(url && { marks: [{ type: 'link', attrs: { href: url } }] }) }] }
              : { type: 'paragraph' },
            ...(description ? [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] : []),
          ],
        } as TLRichText;
        const width = w || 300;
        add(
          {
            ...base(item, 'text', width, measureTextHeight(richText, 'sans', fontSize, width)),
            props: { color: 'black', size: 's', font: 'sans', textAlign: 'start', w: width / scale, richText, scale, autoSize: false },
          } as TLTextShape,
          'embed',
          item,
          'embed → link',
        );
        break;
      }

      case 'image': {
        try {
          const original = await miroDownload(String(item.data?.imageUrl).replace('format=preview', 'format=original'));
          const image = await prepareImage(original.bytes, original.mimeType);
          addImage(item, {
            assetId: `asset:${item.id}` as TLAssetId,
            name: `${item.data?.title || item.id}.${EXTENSIONS[image.mimeType] ?? 'img'}`,
            ...image,
          });
        } catch (err) {
          count(skipped, 'image (download failed)');
          warnings.push(`image ${item.id}: ${(err as Error).message}`);
        }
        log(`images ${(imported.image ?? 0) + (skipped['image (download failed)'] ?? 0)}/${imageTotal}`);
        break;
      }

      case 'document':
        break; // grouped per PDF below

      default:
        count(skipped, `${item.type} (unknown type)`);
    }
  }

  // PDF pages: one download and render per PDF, pages assigned in reading order.
  const documents = items.filter((i) => i.type === 'document' && i.isSupported !== false);
  if (documents.length) {
    const pdf = await loadPdfjs();
    const byResource = new Map<string, MiroItem[]>();
    for (const doc of documents) {
      const resource = String(doc.data?.documentUrl);
      byResource.set(resource, [...(byResource.get(resource) ?? []), doc]);
    }
    let done = 0;
    for (const [resource, docs] of byResource) {
      const title = String(docs[0].data?.title ?? 'document').replace(/\.pdf$/i, '');
      try {
        const pages = await renderPdfPages((await miroDownload(resource)).bytes, pdf);
        if (pages.length !== docs.length) {
          warnings.push(`${title}.pdf: ${pages.length} pages for ${docs.length} board items — matched in reading order`);
        }
        readingOrder(docs, center).forEach((doc, n) => {
          const page = pages[Math.min(n, pages.length - 1)];
          addImage(doc, { assetId: `asset:${doc.id}` as TLAssetId, name: `${title}-p${n + 1}.jpg`, mimeType: 'image/jpeg', ...page });
        });
      } catch (err) {
        docs.forEach(() => count(skipped, 'document (render failed)'));
        warnings.push(`${title}.pdf: ${(err as Error).message}`);
      }
      done += docs.length;
      log(`pdf pages ${done}/${documents.length}`);
    }
  }

  // Connectors between two imported items become arrows bound to both ends.
  const shapeIds = new Set(drafts.map((d) => d.shape.id));
  const cap = (value?: string) => (!value || value === 'none' ? 'none' : 'arrow');
  for (const connector of connectors) {
    const start = connector.startItem && byId.get(connector.startItem.id);
    const end = connector.endItem && byId.get(connector.endItem.id);
    if (connector.isSupported === false || !start || !end || !shapeIds.has(shapeId(start.id)) || !shapeIds.has(shapeId(end.id))) {
      count(skipped, 'connector (no ends on imported items)');
      continue;
    }
    const style = connector.style ?? {};
    addArrow(
      connector.id,
      start,
      end,
      {
        color: colors.color(style.strokeColor),
        dash: dashFor(style.strokeStyle),
        arrowheadStart: cap(style.startStrokeCap),
        arrowheadEnd: cap(style.endStrokeCap),
      },
      'connector → arrow',
    );
  }

  // Mind map branches: a plain line from the parent's side to the facing side of
  // each child, as Miro draws them.
  for (const node of items) {
    const parent = node.type === 'mindmap_node' && node.parent && byId.get(node.parent.id);
    if (!parent || parent.type !== 'mindmap_node' || !shapeIds.has(shapeId(node.id)) || !shapeIds.has(shapeId(parent.id))) continue;
    const toLeft = center(node).x < center(parent).x;
    addArrow(
      `${node.id}-branch`,
      parent,
      node,
      { color: colors.color(node.style?.nodeColor), dash: 'solid', arrowheadStart: 'none', arrowheadEnd: 'none' },
      'mindmap branch → line',
      { start: { x: toLeft ? 0 : 1, y: 0.5 }, end: { x: toLeft ? 1 : 0, y: 0.5 } },
    );
  }

  // Miro content can sit tens of thousands of units from the canvas centre; move
  // it so its top-left corner is at the origin, where boards open. Shapes inside
  // frames are relative to their frame and move with it.
  const topLevel = drafts.filter((d) => d.shape.parentId === PAGE_ID);
  const placed = topLevel.filter((d) => d.shape.type !== 'arrow').map((d) => d.shape);
  if (placed.length) {
    const dx = Math.min(...placed.map((s) => s.x));
    const dy = Math.min(...placed.map((s) => s.y));
    for (const { shape } of topLevel) Object.assign(shape, { x: shape.x - dx, y: shape.y - dy });
  }

  // Fractional indices per parent, in stacking order.
  const byParent = new Map<string, Draft[]>();
  for (const draft of drafts) byParent.set(draft.shape.parentId, [...(byParent.get(draft.shape.parentId) ?? []), draft]);
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.layer - b.layer || a.order - b.order);
    const indices = utils.getIndices(siblings.length);
    siblings.forEach((draft, i) => ((draft.shape as { index: IndexKey }).index = indices[i]));
  }

  const records: TLRecord[] = [
    tl.DocumentRecordType.create({ id: tl.TLDOCUMENT_ID }),
    tl.PageRecordType.create({ id: PAGE_ID, name: 'Page 1', index: 'a1' as IndexKey }),
    ...assetRecords,
    ...drafts.map((d) => d.shape),
    ...bindings,
  ];
  return { records, assets, imported, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

// Seeds the room server-side so the first client doesn't have to push every
// record to Liveblocks in one batch.
async function seedLiveblocks(roomId: string, records: TLRecord[]): Promise<void> {
  const key = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!key) throw new Error('LIVEBLOCKS_SECRET_KEY is not set in backend/.env');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const created = await fetch(`${LIVEBLOCKS_API}/rooms`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: roomId, defaultAccesses: [] }),
  });
  if (!created.ok && created.status !== 409) throw new Error(`Liveblocks create room: ${created.status} ${await created.text()}`);

  const storage = {
    liveblocksType: 'LiveObject',
    data: {
      records: { liveblocksType: 'LiveMap', data: Object.fromEntries(records.map((r) => [r.id, r])) },
    },
  };
  const seeded = await fetch(`${LIVEBLOCKS_API}/rooms/${encodeURIComponent(roomId)}/storage`, {
    method: 'POST',
    headers,
    body: JSON.stringify(storage),
  });
  if (!seeded.ok) throw new Error(`Liveblocks initialize storage: ${seeded.status} ${await seeded.text()}`);
}

function parseArgs(argv: string[]) {
  const args = { boardId: '', owner: '', title: '', apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--owner') args.owner = argv[++i] ?? '';
    else if (arg === '--title') args.title = argv[++i] ?? '';
    else if (!arg.startsWith('--')) args.boardId = arg.match(/board\/([^/?#]+)/)?.[1] ?? arg;
  }
  args.boardId = decodeURIComponent(args.boardId);
  if (!args.boardId || !args.owner) {
    console.error('Usage: npm run import:miro -- <miro-board-id|url> --owner <email> [--title "…"] [--apply]');
    process.exit(1);
  }
  return args;
}

const table = (bucket: Record<string, number>) =>
  Object.entries(bucket)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `    ${k.padEnd(40)} ${v}`)
    .join('\n') || '    —';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tl = await importEsm<TlSchemaModule>('@tldraw/tlschema');
  const utils = await importEsm<TlUtilsModule>('@tldraw/utils');
  applyPaletteOverrides(tl.DefaultColorThemePalette);
  const schema = tl.createTLSchema();
  const pool = getPool();

  const owner = (await pool.query('SELECT id, name FROM users WHERE lower(email) = lower($1)', [args.owner])).rows[0];
  if (!owner) throw new Error(`No user with email ${args.owner}`);

  console.log(`Reading Miro board ${args.boardId}…`);
  const board = await miroGet<{ name: string }>(`${MIRO_API}/boards/${encodeURIComponent(args.boardId)}`);
  const listed = await miroList<MiroItem>(args.boardId, 'items');
  const connectors = await miroList<MiroConnector>(args.boardId, 'connectors');
  const title = args.title || board.name;
  console.log(`"${board.name}": ${listed.length} items, ${connectors.length} connectors`);

  // The stable API lists mind map nodes without content; take them from the
  // experimental one. If it's unavailable, they are skipped like other
  // unsupported items.
  let items = listed;
  try {
    const nodes = await miroList<MiroItem>(args.boardId, 'mindmap_nodes', MIRO_EXPERIMENTAL_API);
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    items = listed.map((item) => nodesById.get(item.id) ?? item);
  } catch (err) {
    console.warn(`  ! Mind maps not available (${(err as Error).message})`);
  }

  await loadFonts();
  const log = (message: string) => process.stdout.write(`\r  ${message}`.padEnd(60));
  const { records, assets, imported, skipped, warnings } = await convert(items, connectors, tl, utils, log);
  process.stdout.write('\n');

  // Validate before writing anything: one bad record can break the whole board.
  const invalid: string[] = [];
  for (const record of records) {
    try {
      (schema.types as Record<string, { validate: (r: unknown) => unknown }>)[record.typeName].validate(record);
    } catch (err) {
      invalid.push(`${record.id}: ${(err as Error).message}`);
    }
  }

  const bytes = assets.reduce((sum, a) => sum + a.bytes.length, 0);
  console.log(`\nWill import into "${title}" (owner ${owner.name ?? args.owner}):\n${table(imported)}`);
  console.log(`  Skipped:\n${table(skipped)}`);
  console.log(`  Files: ${assets.length}, ${(bytes / 1048576).toFixed(1)} MB`);
  console.log(`  Records: ${records.length}, ${(JSON.stringify(records).length / 1048576).toFixed(2)} MB`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
  if (invalid.length) {
    console.log(`\n${invalid.length} records fail the tldraw schema — nothing written:`);
    invalid.slice(0, 10).forEach((line) => console.log(`  ${line}`));
    process.exitCode = 1;
    return;
  }
  console.log(`  All records valid (tldraw schema)`);

  if (!args.apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    return;
  }

  const { rows } = await pool.query('INSERT INTO boards (title, owner_id) VALUES ($1, $2) RETURNING id', [title, owner.id]);
  const boardId: string = rows[0].id;
  const uploaded: string[] = [];
  try {
    for (const [i, asset] of assets.entries()) {
      const id = await createAsset(boardId, { data: asset.bytes, mimeType: asset.mimeType, name: asset.name });
      uploaded.push(id);
      const record = records.find((r) => r.id === asset.assetId) as TLImageAsset;
      (record.props as { src: string | null }).src = `/api/boards/${boardId}/assets/${id}`;
      log(`uploaded ${i + 1}/${assets.length}`);
    }
    process.stdout.write('\n');
    await saveRecords(boardId, { schema: schema.serialize(), upsert: records as unknown as RecordsDelta['upsert'], remove: [] });
  } catch (err) {
    console.error('\nImport failed, rolling back…');
    for (const id of uploaded) await deleteAsset(boardId, id).catch(() => {});
    await pool.query('DELETE FROM boards WHERE id = $1', [boardId]);
    throw err;
  }

  try {
    await seedLiveblocks(boardId, records);
  } catch (err) {
    // The board is complete in the DB; a cold room hydrates from it on first open.
    console.warn(`  ! Liveblocks not seeded (${(err as Error).message}) — the board will load from the DB on first open`);
  }
  console.log(`\nDone: board "${title}" → /dashboard/${boardId}`);
}

main()
  .catch((err) => {
    console.error(`\nERROR ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
