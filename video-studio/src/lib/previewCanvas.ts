/**
 * A tiny module-level registry so the scopes panel can sample the live
 * preview canvas without threading refs through the whole component tree.
 */
let previewCanvas: HTMLCanvasElement | null = null;

export function setPreviewCanvas(canvas: HTMLCanvasElement | null) {
  previewCanvas = canvas;
}

export function getPreviewCanvas(): HTMLCanvasElement | null {
  return previewCanvas;
}
