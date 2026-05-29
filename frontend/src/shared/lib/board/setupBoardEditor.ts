import {
  AssetRecordType,
  createShapeId,
  type Editor,
  type TLAssetId,
  type TLImageShape,
  type TLStoreEventInfo,
} from '@tldraw/tldraw';
import { pdfToImageFiles } from '@/shared/lib/pdf/pdfToImages';

// Place dropped images scaled down on the canvas (full-resolution asset, smaller shape).
const IMAGE_PLACEMENT_SCALE = 1 / 5;

// Reads an image's natural size locally, so a shape can be placed at the right
// dimensions before the upload finishes.
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image dimensions'));
    };
    img.src = url;
  });
}

// When an image shape is locally removed, drop its backing asset if no other
// shape still references it. editor.deleteAssets fires assets.remove (which
// hits the backend DELETE) and removes the asset record so Liveblocks syncs.
function registerAssetCleanup(editor: Editor) {
  editor.store.listen(
    ({ changes }: TLStoreEventInfo) => {
      const removedAssetIds = new Set<TLAssetId>();
      for (const r of Object.values(changes.removed)) {
        if (r.typeName === 'shape' && r.type === 'image') {
          const assetId = (r as TLImageShape).props.assetId;
          if (assetId) removedAssetIds.add(assetId);
        }
      }
      if (removedAssetIds.size === 0) return;

      for (const r of editor.store.allRecords()) {
        if (r.typeName === 'shape' && r.type === 'image') {
          const assetId = (r as TLImageShape).props.assetId;
          if (assetId) removedAssetIds.delete(assetId);
        }
      }

      if (removedAssetIds.size > 0) {
        editor.deleteAssets([...removedAssetIds]);
      }
    },
    { source: 'user', scope: 'document' },
  );
}

// Handle dropped/pasted files: rasterize PDFs to images, then place each image
// immediately from a local preview while it uploads in the background.
function registerImageDropHandler(editor: Editor) {
  editor.registerExternalContentHandler('files', async ({ files, point }) => {
    const pdfs = files.filter(f => f.type === 'application/pdf');
    const others = files.filter(f => f.type !== 'application/pdf');

    const pdfPages: File[] = [];
    for (const pdf of pdfs) {
      const pages = await pdfToImageFiles(pdf);
      pdfPages.push(...pages);
    }

    const allFiles = [...others, ...pdfPages];
    const bounds = editor.getViewportPageBounds();
    const dropPoint = point ?? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    let offsetY = 0;

    for (const file of allFiles) {
      if (!file.type.startsWith('image/')) continue;

      let size: { width: number; height: number };
      try {
        size = await readImageSize(file);
      } catch {
        continue;
      }
      const fullW = size.width || 500;
      const fullH = size.height || 500;

      const assetId = AssetRecordType.createId();
      // Render a local ghost immediately; src is filled in once uploaded.
      editor.createTemporaryAssetPreview(assetId, file);
      const asset = AssetRecordType.create({
        id: assetId,
        type: 'image',
        props: {
          name: file.name,
          src: '',
          w: fullW,
          h: fullH,
          mimeType: file.type || null,
          isAnimated: false,
          fileSize: file.size,
        },
      });
      editor.createAssets([asset]);

      const w = fullW * IMAGE_PLACEMENT_SCALE;
      const h = fullH * IMAGE_PLACEMENT_SCALE;
      const shapeId = createShapeId();
      editor.createShape<TLImageShape>({
        id: shapeId,
        type: 'image',
        x: dropPoint.x - w / 2,
        y: dropPoint.y + offsetY,
        props: { assetId, w, h, playing: false, url: '', crop: null, flipX: false, flipY: false, altText: file.name },
      });
      offsetY += h + 16;

      // Upload in the background, then swap the local preview for the stored URL.
      // updateAssets shallow-merges, so the full props must be passed to keep w/h.
      editor
        .uploadAsset(asset, file)
        .then(({ src }) => editor.updateAssets([{ ...asset, props: { ...asset.props, src } }]))
        .catch(() => editor.deleteShape(shapeId));
    }
  });
}

// Wires up board-specific editor behaviour. Pass directly to <Tldraw onMount>.
export function setupBoardEditor(editor: Editor) {
  registerAssetCleanup(editor);
  registerImageDropHandler(editor);
}
