(function () {
  const MAX_PIECE_TYPES = 10;
  const PIECE_DEFAULTS = [
    { label: 'Corte A', width: 25, height: 35, quantity: 4 },
    { label: 'Corte B', width: 18, height: 28, quantity: 6 }
  ];

  const scalarInputs = {
    fabricWidth: document.getElementById('fabricWidth'),
    marginX: document.getElementById('marginX'),
    marginY: document.getElementById('marginY'),
    gapX: document.getElementById('gapX'),
    gapY: document.getElementById('gapY')
  };

  const SCALAR_FIELDS = {
    fabricWidth: { path: ['fabric', 'widthCm'], min: 1 },
    marginX: { path: ['fabric', 'marginX'], min: 0 },
    marginY: { path: ['fabric', 'marginY'], min: 0 },
    gapX: { path: ['spacing', 'gapX'], min: 0 },
    gapY: { path: ['spacing', 'gapY'], min: 0 }
  };

  const helpers = Array.from(document.querySelectorAll('.helper-text[data-field]')).reduce((acc, el) => {
    acc[el.dataset.field] = el;
    return acc;
  }, {});

  const pieceTemplate = document.getElementById('pieceRowTemplate');
  const pieceList = document.getElementById('pieceList');
  const addPieceBtn = document.getElementById('addPieceBtn');
  const pieceLimitHelper = document.getElementById('pieceLimitHelper');

  const metricEls = {
    length: document.getElementById('metricLength'),
    bands: document.getElementById('metricBands'),
    pieces: document.getElementById('metricPieces'),
    usage: document.getElementById('metricUsage')
  };

  const statusEl = document.getElementById('formStatus');
  const previewCanvas = document.getElementById('previewCanvas');
  const exportBtn = document.getElementById('exportBtn');
  const optimizeBtn = document.getElementById('optimizeBtn');
  const themeToggle = document.getElementById('themeToggle');

  const STATUS_MESSAGES = {
    pending: 'Haz clic en "Optimizar" para recalcular.',
    success: 'Optimización completada.'
  };

  const state = {
    fabric: { widthCm: 150, marginX: 1, marginY: 1 },
    spacing: { gapX: 0.5, gapY: 0.5 },
    pieces: PIECE_DEFAULTS.map(createPiece)
  };

  const FLOAT_EPS = 1e-6;

  let lastLayout = null;

  init();

  function init() {
    bindScalarInputs();
    bindPieceEvents();
    bindOptimizeButton();
    bindThemeToggle();
    bindExport();
    renderPieceRows();
    syncScalarInputs();
    setStatus(STATUS_MESSAGES.pending);
    window.addEventListener('resize', () => renderPreview(lastLayout, true));
  }

  function bindScalarInputs() {
    Object.entries(scalarInputs).forEach(([key, input]) => {
      if (!input) return;
      input.addEventListener('input', () => handleScalarChange(key));
      input.addEventListener('blur', () => validateScalarField(key));
    });
  }

  function bindPieceEvents() {
    if (addPieceBtn) {
      addPieceBtn.addEventListener('click', handleAddPiece);
    }
    pieceList.addEventListener('input', handlePieceInput);
    pieceList.addEventListener('click', handlePieceClick);
  }

  function bindOptimizeButton() {
    if (!optimizeBtn) return;
    optimizeBtn.addEventListener('click', runOptimization);
  }

  function bindThemeToggle() {
    if (!themeToggle) return;
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current);
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  function bindExport() {
    if (!exportBtn) return;
    exportBtn.addEventListener('click', () => {
      if (!lastLayout || !Array.isArray(lastLayout.placements) || !lastLayout.placements.length) {
        setStatus('Genera una distribución antes de exportar.');
        return;
      }
      renderPreview(lastLayout, true);
      const dataUrl = previewCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'corte-tela.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function handleScalarChange(key) {
    const meta = SCALAR_FIELDS[key];
    const input = scalarInputs[key];
    if (!meta || !input) return;
    const value = parseFloat(input.value);
    if (Number.isNaN(value)) {
      setHelper(key, 'Requerido.');
      setScalarValue(meta.path, NaN);
      markDirty();
      return;
    }
    const sanitized = meta.min != null ? Math.max(meta.min, value) : value;
    input.value = sanitized;
    setScalarValue(meta.path, sanitized);
    setHelper(key, '');
    markDirty();
  }

  function validateScalarField(key) {
    const meta = SCALAR_FIELDS[key];
    const input = scalarInputs[key];
    if (!meta || !input) return;
    const value = parseFloat(input.value);
    if (Number.isNaN(value)) {
      setHelper(key, 'Requerido.');
      input.setAttribute('aria-invalid', 'true');
      return false;
    }
    if (meta.min != null && value < meta.min) {
      setHelper(key, `Debe ser ≥ ${meta.min}.`);
      input.setAttribute('aria-invalid', 'true');
      return false;
    }
    setHelper(key, '');
    input.removeAttribute('aria-invalid');
    return true;
  }

  function setScalarValue(path, value) {
    if (!Array.isArray(path)) return;
    let target = state;
    for (let i = 0; i < path.length - 1; i += 1) {
      target = target[path[i]];
    }
    target[path[path.length - 1]] = value;
  }

  function setHelper(key, message) {
    const helper = helpers[key];
    if (!helper) return;
    helper.textContent = message;
    helper.dataset.error = message ? 'true' : 'false';
  }

  function markDirty(message) {
    setStatus(message || STATUS_MESSAGES.pending);
  }

  function handleAddPiece() {
    if (state.pieces.length >= MAX_PIECE_TYPES) return;
    const nextIndex = state.pieces.length + 1;
    state.pieces.push(
      createPiece({
        label: `Corte ${nextIndex}`,
        width: 20,
        height: 20,
        quantity: 1
      })
    );
    renderPieceRows();
    markDirty();
  }

  function handlePieceInput(event) {
    const target = event.target;
    const row = target.closest('[data-piece-row]');
    if (!row) return;
    const pieceId = row.dataset.pieceId;
    if (!pieceId) return;
    const field = target.dataset.field;
    const piece = state.pieces.find((p) => p.id === pieceId);
    if (!piece || !field) return;
    if (field === 'label') {
      piece.label = target.value.trim();
      const title = row.querySelector('.piece-row__title');
      if (title) title.textContent = piece.label || fallbackPieceTitle(pieceId);
      markDirty();
      return;
    }
    const value = field === 'quantity' ? parseInt(target.value, 10) : parseFloat(target.value);
    if (Number.isNaN(value)) {
      target.setAttribute('aria-invalid', 'true');
      return;
    }
    if (field === 'quantity') {
      piece.quantity = Math.max(0, value);
      target.value = piece.quantity;
    } else {
      piece[field] = Math.max(0.1, value);
      target.value = piece[field];
    }
    target.removeAttribute('aria-invalid');
    markDirty();
  }

  function handlePieceClick(event) {
    const actionBtn = event.target.closest('[data-action="remove"]');
    if (!actionBtn) return;
    const row = actionBtn.closest('[data-piece-row]');
    if (!row) return;
    const pieceId = row.dataset.pieceId;
    removePiece(pieceId);
  }

  function removePiece(id) {
    if (!id) return;
    if (state.pieces.length === 1) {
      state.pieces[0] = createPiece({ label: 'Corte 1', width: 20, height: 20, quantity: 1 });
      renderPieceRows();
      markDirty();
      return;
    }
    state.pieces = state.pieces.filter((piece) => piece.id !== id);
    renderPieceRows();
    markDirty();
  }

  function createPiece(data) {
    return {
      id: `piece-${Math.random().toString(36).slice(2, 9)}`,
      label: data.label || '',
      width: Number.isFinite(data.width) ? data.width : 10,
      height: Number.isFinite(data.height) ? data.height : 10,
      quantity: Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0
    };
  }

  function renderPieceRows() {
    if (!pieceTemplate) return;
    pieceList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    state.pieces.forEach((piece, index) => {
      const clone = pieceTemplate.content.firstElementChild.cloneNode(true);
      clone.dataset.pieceId = piece.id;
      const title = clone.querySelector('.piece-row__title');
      if (title) title.textContent = piece.label || `Corte ${index + 1}`;
      const labelInput = clone.querySelector('input[data-field="label"]');
      if (labelInput) labelInput.value = piece.label;
      const widthInput = clone.querySelector('input[data-field="width"]');
      if (widthInput) widthInput.value = piece.width;
      const heightInput = clone.querySelector('input[data-field="height"]');
      if (heightInput) heightInput.value = piece.height;
      const qtyInput = clone.querySelector('input[data-field="quantity"]');
      if (qtyInput) qtyInput.value = piece.quantity;
      fragment.appendChild(clone);
    });
    pieceList.appendChild(fragment);
    updatePieceLimitHelper();
  }

  function updatePieceLimitHelper() {
    if (!pieceLimitHelper) return;
    pieceLimitHelper.textContent = `${state.pieces.length} / ${MAX_PIECE_TYPES} tipos configurados`;
    if (addPieceBtn) {
      addPieceBtn.disabled = state.pieces.length >= MAX_PIECE_TYPES;
    }
  }

  function fallbackPieceTitle(pieceId) {
    const index = state.pieces.findIndex((p) => p.id === pieceId);
    return `Corte ${index + 1}`;
  }

  function syncScalarInputs() {
    Object.entries(scalarInputs).forEach(([key, input]) => {
      if (!input) return;
      const path = SCALAR_FIELDS[key]?.path;
      if (!path) return;
      input.value = getNestedValue(path);
    });
  }

  function getNestedValue(path) {
    return path.reduce((acc, key) => (acc ? acc[key] : undefined), state);
  }

  function runOptimization() {
    const snapshot = computeSnapshot();
    lastLayout = snapshot.layout;
    updateMetrics(snapshot.metrics);
    if (snapshot.layout) {
      setStatus(snapshot.status || STATUS_MESSAGES.success);
    } else if (snapshot.status) {
      setStatus(snapshot.status);
    } else {
      setStatus('');
    }
    renderPreview(snapshot.layout);
  }

  function computeSnapshot() {
    const spec = buildFabricSpec();
    if (!Number.isFinite(spec.widthCm) || spec.widthCm <= 0) {
      return { status: 'Define un ancho de tela válido.', metrics: null, layout: null };
    }
    if (!Number.isFinite(spec.marginX) || !Number.isFinite(spec.marginY)) {
      return { status: 'Completa los márgenes.', metrics: null, layout: null };
    }
    const expandedPieces = expandPieces(state.pieces);
    if (!expandedPieces.length) {
      return { status: 'Agrega al menos una pieza con cantidad mayor a cero.', metrics: null, layout: null };
    }
    const printableWidth = spec.widthCm - spec.marginX * 2;
    if (printableWidth <= 0) {
      return { status: 'Los márgenes laterales superan el ancho disponible.', metrics: null, layout: null };
    }
    const sortedPieces = sortPieces(expandedPieces);
    const layout = runShelf(spec, sortedPieces);
    if (layout.error) {
      return { status: layout.error, metrics: null, layout: null };
    }
    const metrics = buildMetrics(layout, expandedPieces.length);
    return { status: '', metrics, layout };
  }

  function buildFabricSpec() {
    return {
      widthCm: state.fabric.widthCm,
      marginX: state.fabric.marginX,
      marginY: state.fabric.marginY,
      gapX: state.spacing.gapX,
      gapY: state.spacing.gapY
    };
  }

  function expandPieces(pieces) {
    const expanded = [];
    pieces.forEach((piece) => {
      const qty = Math.max(0, Math.floor(piece.quantity));
      if (!Number.isFinite(piece.width) || !Number.isFinite(piece.height)) return;
      for (let i = 0; i < qty; i += 1) {
        expanded.push({
          id: `${piece.id}-${i + 1}`,
          width: piece.width,
          height: piece.height,
          label: piece.label || `${piece.id}`
        });
      }
    });
    return expanded;
  }

  function sortPieces(pieces) {
    // Ordenar por alto reduce fragmentación
    // y mejora el aprovechamiento del largo en shelf.
    return pieces.slice().sort((a, b) => {
      if (b.height !== a.height) return b.height - a.height;
      if (b.width !== a.width) return b.width - a.width;
      return a.id.localeCompare(b.id);
    });
  }

  function runShelf(spec, pieces) {
    const printableWidth = spec.widthCm - spec.marginX * 2;
    if (printableWidth <= 0) {
      return { error: 'Sin ancho útil para ubicar piezas.' };
    }
    const gapX = Math.max(0, spec.gapX || 0);
    const gapY = Math.max(0, spec.gapY || 0);
    const estimatedHeight = pieces.reduce((sum, piece) => sum + piece.height, 0) + gapY * Math.max(0, pieces.length - 1);
    const tallestPiece = pieces.reduce((max, piece) => Math.max(max, piece.height), 0);
    const initialHeight = Math.max(estimatedHeight, tallestPiece + gapY, 1);
    const freeRects = [createFreeRect(spec.marginX, spec.marginY, printableWidth, initialHeight)];
    const placements = [];
    let pieceArea = 0;

    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      pieceArea += piece.width * piece.height;
      if (piece.width > printableWidth + FLOAT_EPS) {
        return { error: `El ancho de "${piece.label}" supera el ancho útil.` };
      }
      const node = findBestFreeRect(freeRects, piece, gapX, gapY);
      if (!node) {
        return { error: `No se pudo ubicar la pieza "${piece.label}".` };
      }
      placements.push({
        pieceId: piece.id,
        label: piece.label,
        width: piece.width,
        height: piece.height,
        x: node.x,
        y: node.y
      });

      const occupiedRect = {
        x: node.x,
        y: node.y,
        width: piece.width + gapX,
        height: piece.height + gapY
      };
      splitFreeRectangles(freeRects, occupiedRect);
      pruneFreeRectangles(freeRects);
      mergeFreeRectangles(freeRects);
    }

    const maxBottom = placements.reduce((max, rect) => Math.max(max, rect.y + rect.height), spec.marginY);
    const totalLengthCm = Math.max(spec.marginY * 2, maxBottom + spec.marginY);

    const virtualBand = { id: 'band-virtual', placements: placements.slice() };
    return {
      placements,
      bands: placements.length ? [virtualBand] : [],
      totalLengthCm,
      printableWidth,
      spec,
      pieceArea
    };
  }

  function createFreeRect(x, y, width, height) {
    return { x, y, width, height };
  }

  function findBestFreeRect(freeRects, piece, gapX, gapY) {
    const effWidth = piece.width + gapX;
    const effHeight = piece.height + gapY;
    let best = null;
    for (let i = 0; i < freeRects.length; i += 1) {
      const rect = freeRects[i];
      if (rect.width + FLOAT_EPS < effWidth || rect.height + FLOAT_EPS < effHeight) continue;
      const areaFit = rect.width * rect.height - effWidth * effHeight;
      const leftoverHoriz = rect.width - effWidth;
      const leftoverVert = rect.height - effHeight;
      const shortSide = Math.min(leftoverHoriz, leftoverVert);
      const yDelta = best ? rect.y - best.rect.y : 0;
      const xDelta = best ? rect.x - best.rect.x : 0;
      const replace =
        !best ||
        yDelta < -FLOAT_EPS ||
        (Math.abs(yDelta) <= FLOAT_EPS && (xDelta < -FLOAT_EPS ||
          (Math.abs(xDelta) <= FLOAT_EPS && (areaFit < best.areaFit - FLOAT_EPS ||
            (Math.abs(areaFit - best.areaFit) <= FLOAT_EPS && shortSide < best.shortSide - FLOAT_EPS)))));
      if (replace) {
        best = { x: rect.x, y: rect.y, rect, areaFit, shortSide };
      }
    }
    return best;
  }

  function splitFreeRectangles(freeRects, usedRect) {
    const updated = [];
    for (let i = 0; i < freeRects.length; i += 1) {
      const free = freeRects[i];
      if (!rectsIntersect(free, usedRect)) {
        updated.push(free);
        continue;
      }
      const fragments = splitRect(free, usedRect);
      fragments.forEach((fragment) => {
        if (fragment.width > FLOAT_EPS && fragment.height > FLOAT_EPS) {
          updated.push(fragment);
        }
      });
    }
    freeRects.length = 0;
    freeRects.push(...updated);
  }

  function splitRect(free, used) {
    const result = [];
    const freeRight = free.x + free.width;
    const freeBottom = free.y + free.height;
    const usedRight = used.x + used.width;
    const usedBottom = used.y + used.height;

    if (used.x > free.x) {
      result.push({
        x: free.x,
        y: free.y,
        width: used.x - free.x,
        height: free.height
      });
    }

    if (usedRight < freeRight) {
      result.push({
        x: usedRight,
        y: free.y,
        width: freeRight - usedRight,
        height: free.height
      });
    }

    const overlapX1 = Math.max(free.x, used.x);
    const overlapX2 = Math.min(freeRight, usedRight);

    if (overlapX2 > overlapX1) {
      if (used.y > free.y) {
        result.push({
          x: overlapX1,
          y: free.y,
          width: overlapX2 - overlapX1,
          height: used.y - free.y
        });
      }
      if (usedBottom < freeBottom) {
        result.push({
          x: overlapX1,
          y: usedBottom,
          width: overlapX2 - overlapX1,
          height: freeBottom - usedBottom
        });
      }
    }

    return result;
  }

  function pruneFreeRectangles(freeRects) {
    for (let i = 0; i < freeRects.length; i += 1) {
      for (let j = i + 1; j < freeRects.length; j += 1) {
        const rectA = freeRects[i];
        const rectB = freeRects[j];
        if (rectContains(rectA, rectB)) {
          freeRects.splice(j, 1);
          j -= 1;
          continue;
        }
        if (rectContains(rectB, rectA)) {
          freeRects.splice(i, 1);
          i -= 1;
          break;
        }
      }
    }
  }

  function mergeFreeRectangles(freeRects) {
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < freeRects.length; i += 1) {
        for (let j = i + 1; j < freeRects.length; j += 1) {
          const a = freeRects[i];
          const b = freeRects[j];
          if (Math.abs(a.y - b.y) <= FLOAT_EPS && Math.abs(a.height - b.height) <= FLOAT_EPS) {
            const touchesHoriz = Math.abs(a.x + a.width - b.x) <= FLOAT_EPS || Math.abs(b.x + b.width - a.x) <= FLOAT_EPS;
            if (touchesHoriz) {
              const minX = Math.min(a.x, b.x);
              const maxX = Math.max(a.x + a.width, b.x + b.width);
              freeRects[i] = { x: minX, y: a.y, width: maxX - minX, height: a.height };
              freeRects.splice(j, 1);
              merged = true;
              break;
            }
          }
          if (Math.abs(a.x - b.x) <= FLOAT_EPS && Math.abs(a.width - b.width) <= FLOAT_EPS) {
            const touchesVert = Math.abs(a.y + a.height - b.y) <= FLOAT_EPS || Math.abs(b.y + b.height - a.y) <= FLOAT_EPS;
            if (touchesVert) {
              const minY = Math.min(a.y, b.y);
              const maxY = Math.max(a.y + a.height, b.y + b.height);
              freeRects[i] = { x: a.x, y: minY, width: a.width, height: maxY - minY };
              freeRects.splice(j, 1);
              merged = true;
              break;
            }
          }
        }
        if (merged) break;
      }
    }
  }

  function rectsIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function rectContains(outer, inner) {
    return (
      outer.x <= inner.x + FLOAT_EPS &&
      outer.y <= inner.y + FLOAT_EPS &&
      outer.x + outer.width >= inner.x + inner.width - FLOAT_EPS &&
      outer.y + outer.height >= inner.y + inner.height - FLOAT_EPS
    );
  }

  function buildMetrics(layout, totalPieces) {
    if (!layout) return null;
    const placements = Array.isArray(layout.placements) ? layout.placements : [];
    const totalLength = layout.totalLengthCm;
    const fabricArea = layout.spec.widthCm * Math.max(totalLength, 0);
    const usage = fabricArea > 0 ? Math.min(100, (layout.pieceArea / fabricArea) * 100) : 0;
    const bandCount = countDistinctRows(placements);
    return {
      lengthCm: totalLength,
      bands: bandCount,
      pieces: totalPieces,
      usagePct: usage
    };
  }

  function countDistinctRows(placements) {
    if (!Array.isArray(placements) || !placements.length) return 0;
    const precision = 3;
    const seen = new Set();
    placements.forEach((placement) => {
      const normalized = (placement.y || 0).toFixed(precision);
      seen.add(normalized);
    });
    return seen.size;
  }

  function updateMetrics(metrics) {
    if (!metrics) {
      metricEls.length.textContent = '--';
      metricEls.bands.textContent = '--';
      metricEls.pieces.textContent = '--';
      metricEls.usage.textContent = '--';
      return;
    }
    metricEls.length.textContent = formatLength(metrics.lengthCm);
    metricEls.bands.textContent = metrics.bands;
    metricEls.pieces.textContent = metrics.pieces;
    metricEls.usage.textContent = `${metrics.usagePct.toFixed(1)}%`;
  }

  function formatLength(value) {
    if (!Number.isFinite(value) || value <= 0) return '--';
    if (value >= 100) {
      const meters = value / 100;
      return `${meters.toFixed(2)} m (${value.toFixed(1)} cm)`;
    }
    return `${value.toFixed(1)} cm`;
  }

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
  }

  function renderPreview(layout, forceRedraw) {
    if (!previewCanvas) return;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    const metrics = resizeCanvas(previewCanvas, forceRedraw);
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    const placements = Array.isArray(layout?.placements) ? layout.placements : [];
    if (!layout || !placements.length) {
      drawEmptyState(ctx, metrics);
      return;
    }
    const colors = readThemeColors();
    const paddingX = 48 * metrics.dpr;
    const paddingY = 36 * metrics.dpr;
    const drawableWidth = Math.max(10, previewCanvas.width - paddingX * 2);
    const scaleX = drawableWidth / layout.spec.widthCm;
    const totalLength = Math.max(layout.totalLengthCm, 0.1);
    const maxHeight = Math.max(10, previewCanvas.height - paddingY * 2);
    const scaleY = Math.min(scaleX, maxHeight / totalLength);
    const offsetX = paddingX;
    const offsetY = paddingY;
    const fabricWidthPx = layout.spec.widthCm * scaleX;
    const fabricHeightPx = totalLength * scaleY;

    ctx.fillStyle = colors.fabricFill;
    ctx.fillRect(offsetX, offsetY, fabricWidthPx, fabricHeightPx);
    ctx.strokeStyle = colors.fabricStroke;
    ctx.lineWidth = 2 * metrics.dpr;
    ctx.strokeRect(offsetX, offsetY, fabricWidthPx, fabricHeightPx);

    const printableX = offsetX + layout.spec.marginX * scaleX;
    const printableY = offsetY + layout.spec.marginY * scaleY;
    const printableWidth = (layout.spec.widthCm - layout.spec.marginX * 2) * scaleX;
    const printableHeight = (totalLength - layout.spec.marginY * 2) * scaleY;
    ctx.setLineDash([6 * metrics.dpr, 4 * metrics.dpr]);
    ctx.strokeStyle = colors.printableStroke;
    ctx.strokeRect(printableX, printableY, printableWidth, printableHeight);
    ctx.setLineDash([]);

    const precision = 3;
    const distinctRows = Array.from(new Set(placements.map((placement) => (placement.y || 0).toFixed(precision))))
      .sort((a, b) => parseFloat(a) - parseFloat(b));
    const rowColors = new Map();
    distinctRows.forEach((key, index) => {
      rowColors.set(key, index % 2 === 0 ? colors.piecePrimary : colors.pieceSecondary);
    });

    placements.forEach((placement) => {
      const key = (placement.y || 0).toFixed(precision);
      const fill = rowColors.get(key) || colors.piecePrimary;
      const x = offsetX + placement.x * scaleX;
      const y = offsetY + placement.y * scaleY;
      const width = placement.width * scaleX;
      const height = placement.height * scaleY;
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.fabricStroke;
      ctx.lineWidth = 1.2 * metrics.dpr;
      ctx.strokeRect(x, y, width, height);
    });

    ctx.fillStyle = colors.text;
    ctx.font = `${14 * metrics.dpr}px "IBM Plex Sans", "Segoe UI", sans-serif`;
    ctx.fillText(`Ancho: ${layout.spec.widthCm.toFixed(1)} cm`, offsetX, offsetY - 12 * metrics.dpr);
    ctx.fillText(`Largo: ${formatLength(layout.totalLengthCm)}`, offsetX, offsetY + fabricHeightPx + 20 * metrics.dpr);
  }

  function resizeCanvas(canvas, force) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (force || canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { dpr };
  }

  function drawEmptyState(ctx, metrics) {
    const rect = previewCanvas.getBoundingClientRect();
    ctx.fillStyle = readThemeColors().textMuted;
    ctx.font = `${14 * metrics.dpr}px "IBM Plex Sans", "Segoe UI", sans-serif`;
    ctx.fillText('Completa los parámetros para ver la distribución.', 32 * metrics.dpr, rect.height * metrics.dpr * 0.5);
  }

  function readThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      fabricFill: styles.getPropertyValue('--color-accent-soft').trim() || 'rgba(0,0,0,0.05)',
      fabricStroke: styles.getPropertyValue('--color-fabric-stroke').trim() || '#1f2933',
      printableStroke: styles.getPropertyValue('--color-text-muted').trim() || '#6b7280',
      piecePrimary: styles.getPropertyValue('--color-piece').trim() || '#008080',
      pieceSecondary: styles.getPropertyValue('--color-piece-alt').trim() || '#f2841a',
      text: styles.getPropertyValue('--color-text').trim() || '#111827',
      textMuted: styles.getPropertyValue('--color-text-muted').trim() || '#6b7280'
    };
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggle) {
      themeToggle.setAttribute('aria-checked', theme === 'dark');
      const label = themeToggle.querySelector('.theme-switch__label');
      if (label) label.textContent = theme === 'dark' ? 'Oscuro' : 'Claro';
    }
    try {
      localStorage.setItem('fabric-theme', theme);
    } catch (err) {
      /* ignore */
    }
    if (lastLayout) {
      renderPreview(lastLayout, true);
    }
  }
})();
