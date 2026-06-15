const els = {
  imageInput: document.getElementById("imageInput"),
  uploadButton: document.getElementById("uploadButton"),
  renderButton: document.getElementById("renderButton"),
  downloadPngButton: document.getElementById("downloadPngButton"),
  downloadSvgButton: document.getElementById("downloadSvgButton"),
  resetButton: document.getElementById("resetButton"),
  dropZone: document.getElementById("dropZone"),
  sourcePreview: document.getElementById("sourcePreview"),
  outputCanvas: document.getElementById("outputCanvas"),
  emptyState: document.getElementById("emptyState"),
  fileMeta: document.getElementById("fileMeta"),
  statusText: document.getElementById("statusText"),
  cellSize: document.getElementById("cellSize"),
  maxOutput: document.getElementById("maxOutput"),
  showGrid: document.getElementById("showGrid"),
  randomRotation: document.getElementById("randomRotation"),
  autoRender: document.getElementById("autoRender"),
  contrast: document.getElementById("contrast"),
  brightness: document.getElementById("brightness"),
  gamma: document.getElementById("gamma"),
  colorStrength: document.getElementById("colorStrength"),
  exportScale: document.getElementById("exportScale"),
  cellSizeValue: document.getElementById("cellSizeValue"),
  maxOutputValue: document.getElementById("maxOutputValue"),
  maxOutputPixels: document.getElementById("maxOutputPixels"),
  contrastValue: document.getElementById("contrastValue"),
  brightnessValue: document.getElementById("brightnessValue"),
  gammaValue: document.getElementById("gammaValue"),
  colorStrengthValue: document.getElementById("colorStrengthValue"),
  exportScaleValue: document.getElementById("exportScaleValue"),
  cellCount: document.getElementById("cellCount"),
  outputSize: document.getElementById("outputSize"),
  renderTime: document.getElementById("renderTime"),
  toneHistogram: document.getElementById("toneHistogram"),
  toneStrip: document.getElementById("toneStrip"),
  toneTilesSection: document.getElementById("toneTilesSection"),
  glyphValuesSection: document.getElementById("glyphValuesSection"),
  glyphValueGrid: document.getElementById("glyphValueGrid"),
  customTilesSection: document.getElementById("customTilesSection"),
  customTileInput: document.getElementById("customTileInput"),
  customTileUploadButton: document.getElementById("customTileUploadButton"),
  customTileGrid: document.getElementById("customTileGrid"),
  duoColors: document.getElementById("duoColors"),
  duoPaper: document.getElementById("duoPaper"),
  duoInk: document.getElementById("duoInk")
};

const DEFAULT_GLYPH_VALUES = [" ", ".", ",", "-", "+", "%", "o", "&", "@", "W"];

const defaults = {
  cellSize: 50,
  maxOutput: 1000,
  contrast: 1.1,
  brightness: 0,
  gamma: 1,
  colorStrength: 72,
  exportScale: 3,
  duoPaper: "#d6fffc",
  duoInk: "#982e8e",
  glyphValues: DEFAULT_GLYPH_VALUES,
  showGrid: false,
  randomRotation: false,
  autoRender: true,
  pack: "hatch",
  mode: "ink"
};

const DEFAULT_IMAGE_SRC = "gradient-400x400.jpg";
const DEFAULT_IMAGE_NAME = "gradient-400x400.jpg";
const PNG_EXPORT_MAX_EDGE = 10000;
const SVG_CUSTOM_TILE_SCALE = 4;
const BLOCK_SIZE_OPTIONS = [5, 10, 15, 20, 25, 50, 100];
const CANVAS_SIZE_MIN = 100;
const CANVAS_SIZE_MAX = 2500;
const TILE_BASE_SIZE = 96;

const state = {
  ...defaults,
  image: null,
  fileName: DEFAULT_IMAGE_NAME,
  tileCache: new Map(),
  tintedTileCache: new Map(),
  glyphValues: [...DEFAULT_GLYPH_VALUES],
  customTiles: Array(10).fill(null),
  customTileVersion: 0,
  customTileInputTarget: null,
  customTileInputDirection: -1,
  draggedCustomTileIndex: null,
  cellSizeOptions: [],
  cells: [],
  histogram: Array(10).fill(0),
  renderTimer: 0,
  lastRender: null
};

const ctx = els.outputCanvas.getContext("2d", { alpha: false });
const previewCtx = els.sourcePreview.getContext("2d", { alpha: false });

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getImageDimensions(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0
  };
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function rgb(color) {
  return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;
}

function rgba(color, alpha) {
  return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${alpha})`;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mixColor(a, b, amount) {
  return [
    lerp(a[0], b[0], amount),
    lerp(a[1], b[1], amount),
    lerp(a[2], b[2], amount)
  ];
}

function glyphValueIndexForTone(tone) {
  return 10 - tone;
}

function glyphValueForTone(tone) {
  return state.glyphValues[glyphValueIndexForTone(tone)] || DEFAULT_GLYPH_VALUES[glyphValueIndexForTone(tone)];
}

function glyphFontScale(glyph) {
  const glyphLength = Array.from(glyph || "").length;
  if (glyphLength >= 3) return 0.48;
  if (glyphLength === 2) return 0.68;
  return 1;
}

function glyphFontSize(tone, scaleValue, glyph) {
  const baseSize = (88 - tone * 2.2) * 1.1 * glyphFontScale(glyph);
  return Math.max(scaleValue(22), Math.round(scaleValue(baseSize)));
}

function glyphInputSize(glyph) {
  const glyphLength = Array.from(glyph || "").length;
  if (glyphLength >= 3) return "0.92rem";
  if (glyphLength === 2) return "1.15rem";
  return "1.55rem";
}

function normalizeGlyphInput(value, fallback) {
  const rawValue = value || "";
  if (!rawValue.length) return fallback;
  const collapsed = rawValue.replace(/\s/g, " ");
  const normalized = Array.from(collapsed).slice(0, 3).join("");
  return normalized.length ? normalized : fallback;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function closestOptionIndex(options, value) {
  const target = Number(value);
  return options.reduce((bestIndex, option, index) => {
    const best = options[bestIndex];
    const distance = Math.abs(option - target);
    const bestDistance = Math.abs(best - target);
    return distance < bestDistance ? index : bestIndex;
  }, 0);
}

function getCanvasSizeRange(blockSize = state.cellSize) {
  const min = Math.ceil(CANVAS_SIZE_MIN / blockSize) * blockSize;
  const max = Math.max(min, Math.floor(CANVAS_SIZE_MAX / blockSize) * blockSize);
  return { min, max };
}

function snapCanvasSize(value, blockSize = state.cellSize) {
  const { min, max } = getCanvasSizeRange(blockSize);
  const snapped = Math.round(Number(value) / blockSize) * blockSize;
  return clamp(snapped, min, max);
}

function refreshCanvasSizeControl() {
  const { min, max } = getCanvasSizeRange();
  state.maxOutput = snapCanvasSize(state.maxOutput);
  els.maxOutput.min = String(min);
  els.maxOutput.max = String(max);
  els.maxOutput.step = String(state.cellSize);
  els.maxOutput.value = String(state.maxOutput);
  els.maxOutput.title = `Canvas size adjusts in ${state.cellSize}px steps`;
}

function refreshCellSizeControl() {
  const options = BLOCK_SIZE_OPTIONS;
  const index = closestOptionIndex(options, state.cellSize);

  state.cellSizeOptions = options;
  state.cellSize = options[index];
  els.cellSize.min = "0";
  els.cellSize.max = String(Math.max(0, options.length - 1));
  els.cellSize.step = "1";
  els.cellSize.value = String(index);
  els.cellSize.disabled = false;
  els.cellSize.title = `Block size options: ${options.map((size) => `${size}px`).join(", ")}`;
  els.cellSizeValue.value = `${state.cellSize} px`;
  refreshCanvasSizeControl();
}

function updateLabels() {
  refreshCellSizeControl();
  const { width, height } = getOutputDimensions(state.image);
  els.maxOutputValue.value = `${width / state.cellSize} x ${height / state.cellSize} tiles`;
  els.maxOutputPixels.textContent = `${width} x ${height} px`;
  els.contrastValue.value = state.contrast.toFixed(2);
  els.brightnessValue.value = state.brightness.toFixed(2);
  els.gammaValue.value = state.gamma.toFixed(2);
  els.colorStrengthValue.value = `${state.colorStrength}%`;
  els.exportScaleValue.value = `${state.exportScale}x`;
}

function syncControls() {
  els.maxOutput.value = state.maxOutput;
  els.contrast.value = state.contrast;
  els.brightness.value = state.brightness;
  els.gamma.value = state.gamma;
  els.colorStrength.value = state.colorStrength;
  els.exportScale.value = state.exportScale;
  els.duoPaper.value = state.duoPaper;
  els.duoInk.value = state.duoInk;
  const isCustomPack = state.pack === "custom";
  const isGlyphPack = state.pack === "glyph";
  els.duoColors.classList.toggle("is-active", state.mode === "duo");
  els.customTilesSection.hidden = !isCustomPack;
  els.customTilesSection.classList.toggle("is-active", isCustomPack);
  els.glyphValuesSection.hidden = !isGlyphPack;
  els.glyphValuesSection.classList.toggle("is-active", isGlyphPack);
  els.toneTilesSection.hidden = isCustomPack || isGlyphPack;
  els.showGrid.checked = state.showGrid;
  els.randomRotation.checked = state.randomRotation;
  els.autoRender.checked = state.autoRender;
  document.querySelectorAll("[data-pack]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pack === state.pack);
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
  updateLabels();
  renderGlyphValueGrid();
  renderCustomTileGrid();
}

function scheduleRender() {
  updateLabels();
  drawToneStrip();
  if (!state.autoRender) {
    setStatus("Settings changed");
    return;
  }
  window.clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(renderMosaic, 90);
}

function loadImageFromUrl(src, name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
    image.dataset.name = name;
  });
}

function rasterizeImageSource(image, name = image?.dataset?.name || "") {
  const { width, height } = getImageDimensions(image);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas.dataset.name = name;
  return canvas;
}

async function loadUploadedImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = rasterizeImageSource(bitmap, file.name);
      if (typeof bitmap.close === "function") bitmap.close();
      return canvas;
    } catch {
      // Fall back to the data URL path below.
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromUrl(dataUrl, file.name);
  return rasterizeImageSource(image, file.name);
}

function imageCanBeSampled(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  try {
    context.drawImage(image, 0, 0, 1, 1);
    context.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function makeDefaultGradientImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const context = canvas.getContext("2d");

  // Updated: Radial gradient starting from (0,0)
  // Arguments: x0, y0, r0, x1, y1, r1
  // Inner circle at (0,0) with radius 0, 
  // Outer circle at (0,0) with radius 566 (approx. distance to opposite corner)
  const base = context.createRadialGradient(0, 0, 0, 0, 0, 566);
  base.addColorStop(0, "#f9f9f9");
  base.addColorStop(0.36, "#cfcfcf");
  base.addColorStop(0.68, "#272727");
  base.addColorStop(1, "#020202");
  context.fillStyle = base;
  context.fillRect(0, 0, 400, 400);

  // Glow and Shadow layers (kept as per your original logic)
  const glow = context.createRadialGradient(78, 58, 0, 78, 58, 340);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  glow.addColorStop(0.48, "rgba(255, 255, 255, 0.32)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 400, 400);

  const shadow = context.createRadialGradient(398, 355, 0, 398, 355, 310);
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.72)");
  shadow.addColorStop(0.6, "rgba(0, 0, 0, 0.2)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = shadow;
  context.fillRect(0, 0, 400, 400);

  return loadImageFromUrl(canvas.toDataURL("image/jpeg", 0.92), DEFAULT_IMAGE_NAME);
}

async function loadDefaultImage() {
  try {
    const image = await loadImageFromUrl(DEFAULT_IMAGE_SRC, DEFAULT_IMAGE_NAME);
    if (imageCanBeSampled(image)) return image;
  } catch {
    // Fall back below when the local file cannot be loaded directly.
  }
  return makeDefaultGradientImage();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function makeCustomTileId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function makeCustomTile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromUrl(dataUrl, file.name);
  return {
    id: makeCustomTileId(),
    name: file.name,
    dataUrl,
    image
  };
}

function dataTransferHasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function clearCustomTileDropTargets() {
  els.customTileGrid.querySelectorAll(".is-drop-target").forEach((slot) => {
    slot.classList.remove("is-drop-target");
  });
}

function commitCustomTileChange(statusText) {
  state.customTileVersion += 1;
  state.tileCache.clear();
  state.tintedTileCache.clear();
  syncControls();
  scheduleRender();
  if (statusText) setStatus(statusText);
}

async function handleCustomTileFiles(fileList, startIndex = 9, direction = -1) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  const start = Math.max(0, Math.min(9, Number.isInteger(startIndex) ? startIndex : 0));
  const step = direction < 0 ? -1 : 1;
  const slotCount = step < 0 ? start + 1 : 10 - start;
  const selected = files.slice(0, slotCount);

  if (!selected.length) {
    setStatus("Choose image files");
    return;
  }

  setStatus("Loading custom tiles");
  const loaded = [];
  for (const file of selected) {
    try {
      loaded.push(await makeCustomTile(file));
    } catch {
      setStatus(`${file.name} could not be loaded`);
    }
  }

  if (!loaded.length) return;

  loaded.forEach((tile, offset) => {
    state.customTiles[start + offset * step] = tile;
  });
  state.pack = "custom";
  commitCustomTileChange(`${loaded.length} custom tile${loaded.length === 1 ? "" : "s"} loaded`);
}

function reorderCustomTile(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || fromIndex > 9 || toIndex < 0 || toIndex > 9) return;

  const [tile] = state.customTiles.splice(fromIndex, 1);
  state.customTiles.splice(toIndex, 0, tile);
  state.customTiles.length = 10;
  state.pack = "custom";
  commitCustomTileChange("Custom tiles reordered");
}

function commitGlyphValueChange(statusText) {
  state.tileCache.clear();
  state.tintedTileCache.clear();
  scheduleRender();
  if (statusText) setStatus(statusText);
}

function renderGlyphValueGrid() {
  els.glyphValueGrid.innerHTML = "";
  state.glyphValues.forEach((glyph, index) => {
    const valueNumber = index + 1;
    const slot = document.createElement("label");
    slot.className = "glyph-value-slot";
    slot.setAttribute("aria-label", `Value ${valueNumber} glyph`);

    const number = document.createElement("span");
    number.className = "custom-tile-number";
    number.textContent = String(valueNumber);

    const input = document.createElement("input");
    input.className = "glyph-value-input";
    input.type = "text";
    input.inputMode = "text";
    input.spellcheck = false;
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.maxLength = 3;
    input.value = glyph;
    input.setAttribute("aria-label", `Glyph for value ${valueNumber}`);
    input.style.fontSize = glyphInputSize(glyph);

    input.addEventListener("input", () => {
      const nextGlyph = normalizeGlyphInput(input.value, DEFAULT_GLYPH_VALUES[index]);
      input.value = nextGlyph;
      input.style.fontSize = glyphInputSize(nextGlyph);
      state.glyphValues[index] = nextGlyph;
      commitGlyphValueChange("Glyph values updated");
    });

    slot.append(number, input);
    els.glyphValueGrid.append(slot);
  });
}

function renderCustomTileGrid() {
  els.customTileGrid.innerHTML = "";
  const displayOrder = Array.from({ length: 10 }, (_, index) => 9 - index);
  displayOrder.forEach((index) => {
    const tile = state.customTiles[index];
    const valueNumber = 10 - index;
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `custom-tile-slot${tile ? " is-filled" : ""}`;
    slot.draggable = true;
    slot.dataset.index = String(index);
    slot.title = tile ? tile.name : `Value ${valueNumber}`;
    slot.setAttribute("aria-label", tile ? `Value ${valueNumber}: ${tile.name}` : `Value ${valueNumber}: empty custom tile`);

    const number = document.createElement("span");
    number.className = "custom-tile-number";
    number.textContent = String(valueNumber);

    const thumb = document.createElement("span");
    thumb.className = "custom-tile-thumb";
    if (tile) {
      const image = document.createElement("img");
      image.src = tile.dataUrl;
      image.alt = "";
      thumb.append(image);
    }

    const overlay = document.createElement("span");
    overlay.className = "thumbnail-upload-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 16V4"></path>
        <path d="m7 9 5-5 5 5"></path>
        <path d="M5 20h14"></path>
      </svg>
    `;
    thumb.append(overlay);

    const handle = document.createElement("span");
    handle.className = "custom-tile-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.innerHTML = `
      <svg viewBox="0 0 24 24">
        <circle cx="8" cy="7" r="1.7"></circle>
        <circle cx="16" cy="7" r="1.7"></circle>
        <circle cx="8" cy="12" r="1.7"></circle>
        <circle cx="16" cy="12" r="1.7"></circle>
        <circle cx="8" cy="17" r="1.7"></circle>
        <circle cx="16" cy="17" r="1.7"></circle>
      </svg>
    `;

    const name = document.createElement("span");
    name.className = "custom-tile-name";
    name.textContent = tile ? tile.name : "Empty";

    slot.append(number, thumb, handle, name);

    slot.addEventListener("click", () => {
      state.customTileInputTarget = index;
      state.customTileInputDirection = -1;
      els.customTileInput.multiple = false;
      els.customTileInput.click();
    });

    slot.addEventListener("dragstart", (event) => {
      state.draggedCustomTileIndex = index;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      slot.classList.add("is-dragging");
    });

    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = dataTransferHasFiles(event) ? "copy" : "move";
      clearCustomTileDropTargets();
      slot.classList.add("is-drop-target");
    });

    slot.addEventListener("dragleave", () => {
      slot.classList.remove("is-drop-target");
    });

    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearCustomTileDropTargets();

      if (event.dataTransfer.files.length) {
        handleCustomTileFiles(event.dataTransfer.files, index, -1);
        return;
      }

      const from = Number(event.dataTransfer.getData("text/plain") || state.draggedCustomTileIndex);
      if (Number.isInteger(from)) reorderCustomTile(from, index);
    });

    slot.addEventListener("dragend", () => {
      state.draggedCustomTileIndex = null;
      slot.classList.remove("is-dragging");
      clearCustomTileDropTargets();
    });

    els.customTileGrid.append(slot);
  });
}

function drawImageFitted(context, image, x, y, width, height) {
  const { width: imageWidth, height: imageHeight } = getImageDimensions(image);
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageContained(context, image, width, height) {
  context.fillStyle = "#eef1f2";
  context.fillRect(0, 0, width, height);
  const { width: imageWidth, height: imageHeight } = getImageDimensions(image);
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawPreview() {
  if (!state.image) return;
  drawImageContained(previewCtx, state.image, els.sourcePreview.width, els.sourcePreview.height);
  els.fileMeta.textContent = state.fileName;
}

function getSnappedOutputDimensions(sourceWidth, sourceHeight, maxSide, blockSize) {
  const snappedMaxSide = snapCanvasSize(maxSide, blockSize);
  if (!sourceWidth || !sourceHeight) {
    return {
      width: snappedMaxSide,
      height: snappedMaxSide
    };
  }

  const scale = snappedMaxSide / Math.max(sourceWidth, sourceHeight);
  const snappedWidth = Math.max(blockSize, Math.round((sourceWidth * scale) / blockSize) * blockSize);
  const snappedHeight = Math.max(blockSize, Math.round((sourceHeight * scale) / blockSize) * blockSize);

  if (sourceWidth >= sourceHeight) {
    return {
      width: snappedMaxSide,
      height: snappedHeight
    };
  }

  return {
    width: snappedWidth,
    height: snappedMaxSide
  };
}

function getOutputDimensions(image) {
  const maxSide = snapCanvasSize(state.maxOutput, state.cellSize);
  const { width, height } = getImageDimensions(image);
  return getSnappedOutputDimensions(width, height, maxSide, state.cellSize);
}

function applyToneCurve(luminance) {
  let value = clamp(luminance);
  value = (value - 0.5) * state.contrast + 0.5 + state.brightness;
  value = clamp(value);
  value = Math.pow(value, state.gamma);
  return clamp(value);
}

function createCustomTileCanvas(tone, size = TILE_BASE_SIZE) {
  const customTile = state.customTiles[tone - 1];
  if (!customTile?.image) return createTileCanvas(tone, "hatch", size);

  const key = `custom-${tone}-${size}-${state.customTileVersion}`;
  if (state.tileCache.has(key)) return state.tileCache.get(key);

  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext("2d");
  tileCtx.clearRect(0, 0, size, size);
  drawImageFitted(tileCtx, customTile.image, 0, 0, size, size);

  const imageData = tileCtx.getImageData(0, 0, size, size);
  const data = imageData.data;
  let hasTransparency = false;

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      hasTransparency = true;
      break;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const sourceAlpha = data[i + 3] / 255;
    const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const mask = hasTransparency ? sourceAlpha : 1 - luminance;
    data[i] = 5;
    data[i + 1] = 5;
    data[i + 2] = 5;
    data[i + 3] = Math.round(clamp(mask) * 255);
  }

  tileCtx.putImageData(imageData, 0, 0);
  state.tileCache.set(key, tile);
  return tile;
}

function createTileCanvas(tone, pack, size = TILE_BASE_SIZE) {
  if (pack === "custom") return createCustomTileCanvas(tone, size);

  const key = `${pack}-${tone}-${size}`;
  if (state.tileCache.has(key)) return state.tileCache.get(key);

  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const t = tile.getContext("2d");
  const density = (11 - tone) / 10;
  const scale = size / TILE_BASE_SIZE;
  const scaled = (value) => value * scale;
  t.clearRect(0, 0, size, size);
  t.fillStyle = "#050505";
  t.strokeStyle = "#050505";
  t.lineCap = "round";
  t.lineJoin = "round";

  if (pack === "glyph") {
    const glyph = glyphValueForTone(tone);
    t.globalAlpha = tone === 10 ? 0.22 : 0.9;
    t.font = `800 ${glyphFontSize(tone, scaled, glyph)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    t.textAlign = "center";
    t.textBaseline = "middle";
    t.fillText(glyph, scaled(48), scaled(52));
  }

if (pack === "hatch") {
    const spacing = scaled(5 + tone * 5.2);
    const hatchOffset = 6; 
    
    t.lineWidth = Math.max(scaled(0.05), scaled(9 - tone * 0.99));
        for (let i = (-size + hatchOffset); i < size * 2; i += spacing) {
      t.beginPath();
      t.moveTo(i, scaled(98));
      t.lineTo(i + scaled(98), 0);
      t.stroke();
    }
    
    if (tone <= 5) {
      t.globalAlpha = 1.00;
      for (let i = (-scaled(72) - (hatchOffset * 0.5)); i < size * 2; i += spacing * 1.35) {
        t.beginPath();
        t.moveTo(i, 0);
        t.lineTo(i + scaled(98), scaled(98));
        t.stroke();
      }
    }
  }

  if (pack === "dot") {
    const radius = Math.max(scaled(3), scaled(density * 22));
    const positions = [
      [26, 26],
      [70, 26],
      [26, 70],
      [70, 70],
      [48, 48]
    ];
    positions.forEach(([x, y], index) => {
      const dotSize = index === 4 ? radius * 1.25 : radius;
      t.beginPath();
      t.arc(scaled(x), scaled(y), dotSize, 0, Math.PI * 2);
      t.fill();
    });
  }

  if (pack === "block") {
    const inset = scaled(tone * 3.8);
    t.fillRect(inset, inset, size - inset * 2, size - inset * 2);
    if (tone <= 6) {
      t.globalAlpha = 0.48;
      const bar = Math.max(scaled(5), scaled(22 - tone * 2));
      t.fillRect(0, 0, size, bar);
      t.fillRect(0, size - bar, size, bar);
    }
  }

  state.tileCache.set(key, tile);
  return tile;
}

function getPaintForCell(cell) {
  const colorAmount = state.colorStrength / 100;
  let base = [255, 255, 255];
  let ink = [0, 0, 0];
  let opacity = 0.86;

  if (state.mode === "color") {
    base = mixColor([252, 253, 252], cell.color, colorAmount);
    ink = mixColor([35, 35, 35], [0, 0, 0], 0.72);
    opacity = 0.78;
  }

  if (state.mode === "duo") {
    const paper = hexToRgb(state.duoPaper);
    const inkColor = hexToRgb(state.duoInk);
    base = paper;
    ink = inkColor;
    opacity = 0.9;
  }

  return { base, ink, opacity };
}

function createTintedTile(tone, width, height) {
  const paint = getPaintForCell({ tone, color: [0, 0, 0] });
  const sourceSize = Math.max(TILE_BASE_SIZE, width, height);
  const key = `${state.pack}-${state.mode}-${tone}-${width}x${height}-${sourceSize}-${paint.ink.join("-")}-${paint.opacity}`;
  if (state.tintedTileCache.has(key)) return state.tintedTileCache.get(key);

  const tile = createTileCanvas(tone, state.pack, sourceSize);
  const tinted = document.createElement("canvas");
  tinted.width = width;
  tinted.height = height;
  const tintedCtx = tinted.getContext("2d");
  tintedCtx.drawImage(tile, 0, 0, width, height);
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = rgba(paint.ink, paint.opacity);
  tintedCtx.fillRect(0, 0, width, height);
  state.tintedTileCache.set(key, tinted);
  return tinted;
}

function customTileDataUrl(tone, size, ink, opacity, cache) {
  const key = `${tone}-${size}-${ink.join("-")}-${opacity}-${state.customTileVersion}`;
  if (cache.has(key)) return cache.get(key);

  const tile = createTileCanvas(tone, "custom", size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const canvasCtx = canvas.getContext("2d");
  canvasCtx.drawImage(tile, 0, 0, size, size);
  canvasCtx.globalCompositeOperation = "source-in";
  canvasCtx.fillStyle = rgba(ink, opacity);
  canvasCtx.fillRect(0, 0, size, size);
  const dataUrl = canvas.toDataURL("image/png");
  cache.set(key, dataUrl);
  return dataUrl;
}

function drawToneStrip() {
  els.toneStrip.innerHTML = "";
  for (let value = 1; value <= 10; value += 1) {
    const tone = 11 - value;
    const wrapper = document.createElement("div");
    wrapper.className = "tone-tile";
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const tileCtx = canvas.getContext("2d");
    tileCtx.fillStyle = "#fff";
    tileCtx.fillRect(0, 0, 96, 96);
    tileCtx.drawImage(createTileCanvas(tone, state.pack), 0, 0);
    const label = document.createElement("span");
    label.textContent = value;
    wrapper.append(canvas, label);
    els.toneStrip.append(wrapper);
  }
}

function readCellAverage(data, imageWidth, x, y, width, height) {
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 7));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let yy = y; yy < y + height; yy += stride) {
    const row = yy * imageWidth;
    for (let xx = x; xx < x + width; xx += stride) {
      const i = (row + xx) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }

  return [r / count, g / count, b / count];
}

function randomTileRotation() {
  if (!state.randomRotation) return 0;
  return [0, 90, 180, 270][Math.floor(Math.random() * 4)];
}

function drawTileCell(context, cell, scale = 1) {
  const { base } = getPaintForCell(cell);
  const x = Math.round(cell.x * scale);
  const y = Math.round(cell.y * scale);
  const width = Math.max(1, Math.round((cell.x + cell.width) * scale) - x);
  const height = Math.max(1, Math.round((cell.y + cell.height) * scale) - y);
  const rotation = cell.rotation || 0;
  const tileWidth = rotation % 180 === 0 ? width : Math.max(width, height);
  const tileHeight = rotation % 180 === 0 ? height : Math.max(width, height);

  context.fillStyle = rgb(base);
  context.fillRect(x, y, width, height);

  if (rotation) {
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.translate(x + width / 2, y + height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(createTintedTile(cell.tone, tileWidth, tileHeight), -tileWidth / 2, -tileHeight / 2);
    context.restore();
  } else {
    context.drawImage(createTintedTile(cell.tone, tileWidth, tileHeight), x, y);
  }

  if (state.showGrid) {
    context.strokeStyle = "rgba(255, 255, 255, 0.42)";
    context.lineWidth = Math.max(1, Math.round(scale));
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  }
}

function renderMosaic() {
  if (!state.image) return;
  const started = performance.now();
  setStatus("Rendering mosaic");
  els.emptyState.textContent = "Preparing canvas";
  els.emptyState.classList.remove("hidden");

  try {
    const { width, height } = getOutputDimensions(state.image);
    refreshCellSizeControl();
    els.outputCanvas.width = width;
    els.outputCanvas.height = height;

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    sourceCtx.drawImage(state.image, 0, 0, width, height);
    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    state.cells = [];
    state.histogram = Array(10).fill(0);
    state.tintedTileCache.clear();

    const cellSize = Number(state.cellSize);
    const rows = Math.floor(height / cellSize);
    const columns = Math.floor(width / cellSize);
    for (let row = 0; row < rows; row += 1) {
      const y = row * cellSize;
      for (let column = 0; column < columns; column += 1) {
        const x = column * cellSize;
        const cellWidth = cellSize;
        const cellHeight = cellSize;
        const color = readCellAverage(data, width, x, y, cellWidth, cellHeight);
        const luminance = (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
        const curved = applyToneCurve(luminance);
        const tone = Math.min(10, Math.max(1, Math.ceil(curved * 10)));
        const cell = {
          x,
          y,
          width: cellWidth,
          height: cellHeight,
          color,
          luminance,
          tone,
          rotation: randomTileRotation()
        };
        state.cells.push(cell);
        state.histogram[tone - 1] += 1;
        drawTileCell(ctx, cell);
      }
    }

    state.lastRender = {
      width,
      height,
      cellSize,
      pack: state.pack,
      mode: state.mode
    };

    const elapsed = Math.max(1, Math.round(performance.now() - started));
    updateStats(elapsed);
    els.emptyState.classList.add("hidden");
    setStatus(`${state.fileName} mapped into ${state.cells.length.toLocaleString()} tiles`);
  } catch (error) {
    els.emptyState.textContent = "Image could not be rendered";
    setStatus("Image could not be rendered");
    console.error(error);
  }
}

function updateStats(elapsed) {
  els.cellCount.textContent = state.cells.length.toLocaleString();
  els.outputSize.textContent = `${els.outputCanvas.width} x ${els.outputCanvas.height}`;
  els.renderTime.textContent = `${elapsed} ms`;

  const max = Math.max(1, ...state.histogram);
  els.toneHistogram.innerHTML = "";
  state.histogram.forEach((count, index) => {
    const bar = document.createElement("span");
    bar.dataset.tone = String(index + 1);
    bar.title = `Tone ${index + 1}: ${count.toLocaleString()} cells`;
    bar.style.height = `${Math.max(5, (count / max) * 58)}px`;
    els.toneHistogram.append(bar);
  });
}

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Choose an image file");
    return;
  }
  setStatus(`Loading ${file.name}`);
  loadUploadedImage(file)
    .then((image) => {
      state.image = image;
      state.fileName = file.name;
      drawPreview();
      renderMosaic();
    })
    .catch(() => {
      setStatus("Image could not be loaded");
    });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeName() {
  return state.fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "mosaic";
}

function timestampSlug(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function exportFileName(extension) {
  return `${safeName()}-tone-mosaic-${timestampSlug()}.${extension}`;
}

function renderPngExportCanvas() {
  if (!state.cells.length || !els.outputCanvas.width || !els.outputCanvas.height) {
    renderMosaic();
  }
  if (!state.cells.length || !els.outputCanvas.width || !els.outputCanvas.height) return null;

  const requestedScale = Math.max(1, Number(state.exportScale) || defaults.exportScale);
  const scale = Math.min(
    requestedScale,
    PNG_EXPORT_MAX_EDGE / els.outputCanvas.width,
    PNG_EXPORT_MAX_EDGE / els.outputCanvas.height
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(els.outputCanvas.width * scale));
  canvas.height = Math.max(1, Math.round(els.outputCanvas.height * scale));
  const exportCtx = canvas.getContext("2d", { alpha: false });

  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, canvas.width, canvas.height);
  state.cells.forEach((cell) => drawTileCell(exportCtx, cell, scale));

  return canvas;
}

function exportPng() {
  const exportCanvas = renderPngExportCanvas();
  if (!exportCanvas) {
    setStatus("PNG could not be exported");
    return;
  }
  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, exportFileName("png"));
    setStatus(`PNG exported at ${exportCanvas.width} x ${exportCanvas.height}`);
  }, "image/png");
}

function tileSvg(tone, pack, size) {
  const density = (11 - tone) / 10;
  const s = size / 96;
  const scaled = (value) => Number((value * s).toFixed(2));

  if (pack === "glyph") {
    const glyph = glyphValueForTone(tone);
    const fontSize = glyphFontSize(tone, scaled, glyph);
    return `<text x="${scaled(48)}" y="${scaled(55)}" font-family="ui-monospace, monospace" font-size="${fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle" stroke="none">${escapeXml(glyph)}</text>`;
  }

  if (pack === "dot") {
    const radius = Math.max(scaled(3), scaled(density * 22));
    return [
      [26, 26],
      [70, 26],
      [26, 70],
      [70, 70],
      [48, 48]
    ]
      .map(([x, y], index) => `<circle cx="${scaled(x)}" cy="${scaled(y)}" r="${index === 4 ? radius * 1.25 : radius}" />`)
      .join("");
  }

  if (pack === "block") {
    const inset = scaled(tone * 3.8);
    const main = `<rect x="${inset}" y="${inset}" width="${Math.max(1, size - inset * 2)}" height="${Math.max(1, size - inset * 2)}" />`;
    if (tone > 6) return main;
    const bar = Math.max(scaled(5), scaled(22 - tone * 2));
    return `${main}<rect x="0" y="0" width="${size}" height="${bar}" opacity="0.48" /><rect x="0" y="${size - bar}" width="${size}" height="${bar}" opacity="0.48" />`;
  }

  const spacing = scaled(5 + tone * 2.2);
  const lineWidth = Math.max(1, scaled(7.2 - tone * 0.45));
  const lines = [];
  for (let i = -size; i < size * 2; i += spacing) {
    lines.push(`<path d="M ${i.toFixed(2)} ${size} L ${(i + size).toFixed(2)} 0" stroke-width="${lineWidth}" />`);
  }
  if (tone <= 5) {
    for (let i = -size; i < size * 2; i += spacing * 1.35) {
      lines.push(`<path d="M ${i.toFixed(2)} 0 L ${(i + size).toFixed(2)} ${size}" stroke-width="${lineWidth}" opacity="0.78" />`);
    }
  }
  return lines.join("");
}

function exportSvg() {
  if (!state.cells.length) renderMosaic();
  const width = els.outputCanvas.width;
  const height = els.outputCanvas.height;
  const customTileCache = new Map();
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#fff" />`
  ];

  state.cells.forEach((cell) => {
    const { base, ink, opacity } = getPaintForCell(cell);
    const tileBox = Math.max(cell.width, cell.height);
    const rotation = cell.rotation || 0;
    const tileWidth = rotation % 180 === 0 ? cell.width : tileBox;
    const tileHeight = rotation % 180 === 0 ? cell.height : tileBox;
    const tileX = (cell.width - tileWidth) / 2;
    const tileY = (cell.height - tileHeight) / 2;
    parts.push(`<g transform="translate(${cell.x} ${cell.y})">`);
    parts.push(`<rect width="${cell.width}" height="${cell.height}" fill="${rgb(base)}" />`);
    parts.push(`<svg width="${cell.width}" height="${cell.height}" viewBox="0 0 ${cell.width} ${cell.height}" overflow="hidden">`);
    if (rotation) {
      parts.push(`<g transform="translate(${cell.width / 2} ${cell.height / 2}) rotate(${rotation}) translate(${-cell.width / 2} ${-cell.height / 2})">`);
    }
    if (state.pack === "custom") {
      const href = customTileDataUrl(cell.tone, Math.max(tileWidth, tileHeight) * SVG_CUSTOM_TILE_SCALE, ink, opacity, customTileCache);
      parts.push(`<image href="${href}" x="${tileX}" y="${tileY}" width="${tileWidth}" height="${tileHeight}" preserveAspectRatio="none" />`);
    } else {
      parts.push(`<svg x="${tileX}" y="${tileY}" width="${tileWidth}" height="${tileHeight}" viewBox="0 0 ${tileBox} ${tileBox}" overflow="hidden">`);
      parts.push(`<g fill="${rgb(ink)}" stroke="${rgb(ink)}" stroke-linecap="round" opacity="${opacity}">`);
      parts.push(tileSvg(cell.tone, state.pack, tileBox));
      parts.push(`</g>`);
      parts.push(`</svg>`);
    }
    if (rotation) {
      parts.push(`</g>`);
    }
    parts.push(`</svg>`);
    if (state.showGrid) {
      parts.push(`<rect width="${cell.width}" height="${cell.height}" fill="none" stroke="rgb(255,255,255)" stroke-opacity="0.42" stroke-width="1" />`);
    }
    parts.push(`</g>`);
  });

  parts.push("</svg>");
  const blob = new Blob([parts.join("")], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, exportFileName("svg"));
  setStatus(`SVG exported at ${width} x ${height}`);
}

function resetControls() {
  state.tileCache.clear();
  state.tintedTileCache.clear();
  Object.assign(state, {
    cellSize: defaults.cellSize,
    maxOutput: defaults.maxOutput,
    contrast: defaults.contrast,
    brightness: defaults.brightness,
    gamma: defaults.gamma,
    colorStrength: defaults.colorStrength,
    exportScale: defaults.exportScale,
    duoPaper: defaults.duoPaper,
    duoInk: defaults.duoInk,
    glyphValues: [...DEFAULT_GLYPH_VALUES],
    showGrid: defaults.showGrid,
    randomRotation: defaults.randomRotation,
    autoRender: defaults.autoRender,
    pack: defaults.pack,
    mode: defaults.mode
  });
  syncControls();
  scheduleRender();
}

function bindEvents() {
  els.uploadButton.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
  els.renderButton.addEventListener("click", renderMosaic);
  els.downloadPngButton.addEventListener("click", exportPng);
  els.downloadSvgButton.addEventListener("click", exportSvg);
  els.resetButton.addEventListener("click", resetControls);
  els.customTileUploadButton.addEventListener("click", () => {
    state.customTileInputTarget = 9;
    state.customTileInputDirection = -1;
    els.customTileInput.multiple = true;
    els.customTileInput.click();
  });
  els.customTileInput.addEventListener("change", (event) => {
    const startIndex = Number.isInteger(state.customTileInputTarget) ? state.customTileInputTarget : 9;
    handleCustomTileFiles(event.target.files, startIndex, state.customTileInputDirection);
    event.target.value = "";
    state.customTileInputTarget = 9;
    state.customTileInputDirection = -1;
    els.customTileInput.multiple = true;
  });
  els.customTileGrid.addEventListener("dragover", (event) => {
    if (!dataTransferHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  els.customTileGrid.addEventListener("drop", (event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    clearCustomTileDropTargets();
    handleCustomTileFiles(event.dataTransfer.files, 9, -1);
  });

  els.cellSize.addEventListener("input", () => {
    const options = state.cellSizeOptions.length ? state.cellSizeOptions : BLOCK_SIZE_OPTIONS;
    const index = Math.max(0, Math.min(options.length - 1, Number(els.cellSize.value)));
    state.cellSize = options[index] || state.cellSize;
    state.maxOutput = snapCanvasSize(state.maxOutput, state.cellSize);
    scheduleRender();
  });

  els.maxOutput.addEventListener("input", () => {
    state.maxOutput = snapCanvasSize(els.maxOutput.value, state.cellSize);
    scheduleRender();
  });

  [els.contrast, els.brightness, els.gamma, els.colorStrength].forEach((input) => {
    input.addEventListener("input", () => {
      state[input.id] = Number(input.value);
      scheduleRender();
    });
  });

  els.exportScale.addEventListener("input", () => {
    state.exportScale = Number(els.exportScale.value);
    updateLabels();
  });

  [els.duoPaper, els.duoInk].forEach((input) => {
    input.addEventListener("input", () => {
      state[input.id] = input.value;
      scheduleRender();
    });
  });

  [els.showGrid, els.randomRotation, els.autoRender].forEach((input) => {
    input.addEventListener("change", () => {
      state[input.id] = input.checked;
      scheduleRender();
    });
  });

  document.querySelectorAll("[data-pack]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pack = button.dataset.pack;
      syncControls();
      scheduleRender();
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      syncControls();
      scheduleRender();
    });
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    els.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    handleFile(event.dataTransfer.files[0]);
  });
}

async function init() {
  bindEvents();
  syncControls();
  drawToneStrip();
  try {
    state.image = await loadDefaultImage();
    state.fileName = DEFAULT_IMAGE_NAME;
    drawPreview();
    renderMosaic();
  } catch {
    els.emptyState.textContent = "Default image could not be loaded";
    setStatus("Default image could not be loaded");
  }
}

init();
