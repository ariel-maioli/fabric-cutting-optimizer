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
    usage: document.getElementById('metricUsage'),
    pieces: document.getElementById('metricPieces')
  };

  const statusEl = document.getElementById('formStatus');
  const previewCanvas = document.getElementById('previewCanvas');
  const exportBtn = document.getElementById('exportBtn');
  const optimizeBtn = document.getElementById('optimizeBtn');
  const themeToggle = document.getElementById('themeToggle');
  const tooltipTriggers = Array.from(document.querySelectorAll('[data-tooltip]'));
  const TOOLTIP_ID = 'fabric-tooltip';

  const STATUS_MESSAGES = {
    pending: 'Haz clic en "Optimizar" para recalcular.',
    success: 'Optimización completada.'
  };

  const state = {
    fabric: { widthCm: 180, marginX: 1, marginY: 1 },
    spacing: { gapX: 0.5, gapY: 0.5 },
    pieces: PIECE_DEFAULTS.map(createPiece)
  };

  const FLOAT_EPS = 1e-6;
  const REF_PLACEHOLDER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let lastLayout = null;
  let tooltipEl = null;
  let tooltipActiveTrigger = null;

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
    window.addEventListener('resize', () => {
      renderPreview(lastLayout, true);
      refreshTooltipPosition();
    });
    // Keep tooltip anchored while scrolling within nested panels.
    window.addEventListener('scroll', refreshTooltipPosition, true);
    bindTooltips();
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

  function bindTooltips() {
    if (!tooltipTriggers.length) return;
    tooltipTriggers.forEach((trigger) => {
      trigger.addEventListener('mouseenter', handleTooltipEnter);
      trigger.addEventListener('mouseleave', hideTooltip);
      trigger.addEventListener('focus', handleTooltipEnter);
      trigger.addEventListener('blur', hideTooltip);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideTooltip();
      }
    });
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
    const nextIndex = state.pieces.length;
    state.pieces.push(
      createPiece({
        label: `Corte ${getRefPlaceholder(nextIndex)}`,
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
      if (title) title.textContent = piece.label || `Corte ${getRefPlaceholder(index)}`;
      const labelInput = clone.querySelector('input[data-field="label"]');
      if (labelInput) {
        labelInput.value = piece.label;
        labelInput.placeholder = getRefPlaceholder(index);
      }
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

  function getRefPlaceholder(index) {
    let n = index + 1;
    let result = '';
    while (n > 0) {
      const remainder = (n - 1) % REF_PLACEHOLDER_ALPHABET.length;
      result = REF_PLACEHOLDER_ALPHABET[remainder] + result;
      n = Math.floor((n - 1) / REF_PLACEHOLDER_ALPHABET.length);
    }
    return result || 'A';
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
    if (index < 0) {
      return 'Corte';
    }
    return `Corte ${getRefPlaceholder(index)}`;
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
    const freeRects = [createFreeRect(spec.marginX, spec.marginY, printableWidth, Number.POSITIVE_INFINITY)];
    const placements = [];
    let pieceArea = 0;
    let currentMaxY = spec.marginY;

    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      pieceArea += piece.width * piece.height;
      if (piece.width > printableWidth + FLOAT_EPS) {
        return { error: `El ancho de "${piece.label}" supera el ancho útil.` };
      }
      const node = selectBestPlacement(freeRects, piece, gapX, gapY, currentMaxY);
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
      currentMaxY = Math.max(currentMaxY, node.y + piece.height);
      carveFreeRectangles(freeRects, node.rectIndex, piece, gapX, gapY);
    }

    const maxBottom = computeMaxBottom(placements, spec.marginY);
    const totalLengthCm = Math.max(spec.marginY * 2, maxBottom + spec.marginY);

    const finalFreeRects = freeRects.map((rect) => ({ ...rect }));
    return {
      placements,
      totalLengthCm,
      printableWidth,
      spec,
      pieceArea,
      freeRects: finalFreeRects,
      maxBottom
    };
  }

  function computeMaxBottom(placements, marginY) {
    if (!Array.isArray(placements) || !placements.length) {
      return marginY;
    }
    let maxBottom = marginY;
    for (let i = 0; i < placements.length; i += 1) {
      const placement = placements[i];
      const bottom = (placement?.y || 0) + (placement?.height || 0);
      if (bottom > maxBottom) {
        maxBottom = bottom;
      }
    }
    return maxBottom;
  }

  function createFreeRect(x, y, width, height) {
    return { x, y, width, height };
  }

  function selectBestPlacement(freeRects, piece, gapX, gapY, currentMaxY) {
    const effWidth = piece.width + gapX;
    const effHeight = piece.height + gapY;
    let best = null;
    for (let i = 0; i < freeRects.length; i += 1) {
      const rect = freeRects[i];
      if (rect.width + FLOAT_EPS < effWidth || rect.height + FLOAT_EPS < effHeight) {
        continue;
      }
      const candidateMaxY = Math.max(currentMaxY, rect.y + piece.height);
      const leftoverArea = computeLeftoverArea(rect, effWidth, effHeight);
      const candidate = {
        rectIndex: i,
        x: rect.x,
        y: rect.y,
        maxY: candidateMaxY,
        leftoverArea,
        rectY: rect.y,
        rectX: rect.x
      };
      if (isBetterCandidate(candidate, best)) {
        best = candidate;
      }
    }
    return best;
  }

  function computeLeftoverArea(rect, usedWidth, usedHeight) {
    const area = rect.width * rect.height;
    const usedArea = usedWidth * usedHeight;
    if (!Number.isFinite(area) || !Number.isFinite(usedArea)) {
      return Number.POSITIVE_INFINITY;
    }
    const leftover = area - usedArea;
    return leftover >= 0 ? leftover : 0;
  }

  function isBetterCandidate(candidate, current) {
    if (!current) return true;
    if (candidate.maxY < current.maxY - FLOAT_EPS) {
      return true;
    }
    if (areClose(candidate.maxY, current.maxY)) {
      if (candidate.leftoverArea < current.leftoverArea - FLOAT_EPS) {
        return true;
      }
      if (areClose(candidate.leftoverArea, current.leftoverArea)) {
        if (candidate.rectY < current.rectY - FLOAT_EPS) {
          return true;
        }
        if (areClose(candidate.rectY, current.rectY) && candidate.rectX < current.rectX - FLOAT_EPS) {
          return true;
        }
      }
    }
    return false;
  }

  function carveFreeRectangles(freeRects, rectIndex, piece, gapX, gapY) {
    const rect = freeRects.splice(rectIndex, 1)[0];
    if (!rect) return;
    const effWidth = piece.width + gapX;
    const effHeight = piece.height + gapY;
    const rightWidth = rect.width - effWidth;
    if (rightWidth > FLOAT_EPS) {
      addFreeRect(freeRects, rect.x + effWidth, rect.y, rightWidth, effHeight);
    }
    const bottomHeight = rect.height - effHeight;
    if (bottomHeight > FLOAT_EPS) {
      addFreeRect(freeRects, rect.x, rect.y + effHeight, rect.width, bottomHeight);
    }
    mergeFreeRectangles(freeRects);
  }

  function addFreeRect(freeRects, x, y, width, height) {
    if (width > FLOAT_EPS && height > FLOAT_EPS) {
      freeRects.push(createFreeRect(x, y, width, height));
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
          if (areClose(a.y, b.y) && areClose(a.height, b.height)) {
            const touchesHoriz = areClose(a.x + a.width, b.x) || areClose(b.x + b.width, a.x);
            if (touchesHoriz) {
              const minX = Math.min(a.x, b.x);
              const maxX = Math.max(a.x + a.width, b.x + b.width);
              freeRects[i] = { x: minX, y: a.y, width: maxX - minX, height: a.height };
              freeRects.splice(j, 1);
              merged = true;
              break;
            }
          }
          if (areClose(a.x, b.x) && areClose(a.width, b.width)) {
            const touchesVert = areClose(a.y + a.height, b.y) || areClose(b.y + b.height, a.y);
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

  function areClose(a, b, epsilon = FLOAT_EPS) {
    if (a === b) return true;
    const aFinite = Number.isFinite(a);
    const bFinite = Number.isFinite(b);
    if (!aFinite && !bFinite) return true;
    if (!aFinite || !bFinite) return false;
    return Math.abs(a - b) <= epsilon;
  }

  function buildMetrics(layout, totalPieces) {
    if (!layout) return null;
    const placements = Array.isArray(layout.placements) ? layout.placements : [];
    const placedArea = placements.reduce((sum, placement) => sum + placement.width * placement.height, 0);
    const printableWidth = Math.max(0, layout.printableWidth || 0);
    const marginY = layout.spec?.marginY || 0;
    const maxBottom = Number.isFinite(layout.maxBottom) ? layout.maxBottom : computeMaxBottom(placements, marginY);
    const usedHeight = Math.max(0, maxBottom - marginY);
    const activeArea = printableWidth * usedHeight;
    const usage = activeArea > FLOAT_EPS ? Math.min(100, (placedArea / activeArea) * 100) : 0;
    return {
      lengthCm: layout.totalLengthCm,
      pieces: totalPieces,
      usagePct: usage
    };
  }

  function updateMetrics(metrics) {
    if (!metrics) {
      Object.values(metricEls).forEach((el) => {
        if (el) el.textContent = '--';
      });
      return;
    }
    setMetric(metricEls.length, formatLength(metrics.lengthCm));
    setMetric(metricEls.usage, `${metrics.usagePct.toFixed(1)}%`);
    setMetric(metricEls.pieces, metrics.pieces);
  }

  function setMetric(el, value) {
    if (el) {
      el.textContent = value ?? '--';
    }
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

  function handleTooltipEnter(event) {
    const trigger = event.currentTarget;
    showTooltip(trigger);
  }

  function showTooltip(trigger) {
    if (!trigger) return;
    tooltipActiveTrigger = trigger;
    const tooltip = getTooltipElement();
    tooltip.textContent = trigger.dataset.tooltip || '';
    tooltip.setAttribute('aria-hidden', tooltip.textContent ? 'false' : 'true');
    tooltip.classList.add('is-visible');
    trigger.setAttribute('aria-describedby', TOOLTIP_ID);
    positionTooltip(trigger);
  }

  function hideTooltip() {
    if (tooltipActiveTrigger) {
      tooltipActiveTrigger.removeAttribute('aria-describedby');
    }
    tooltipActiveTrigger = null;
    const tooltip = getTooltipElement();
    tooltip.classList.remove('is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  function refreshTooltipPosition() {
    if (tooltipActiveTrigger) {
      positionTooltip(tooltipActiveTrigger);
    }
  }

  function positionTooltip(trigger) {
    if (!trigger) return;
    const tooltip = getTooltipElement();
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
    tooltip.dataset.placement = 'top';
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.top - tooltipRect.height - 8;
    let placement = 'top';
    if (top < 8) {
      placement = 'bottom';
      top = rect.bottom + 8;
    }
    if (placement === 'bottom' && top + tooltipRect.height > viewportHeight - 8) {
      placement = 'top';
      top = rect.top - tooltipRect.height - 8;
    }
    const minTop = 8;
    const maxTop = Math.max(minTop, viewportHeight - tooltipRect.height - 8);
    top = Math.min(Math.max(top, minTop), maxTop);
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, viewportWidth - tooltipRect.width - 8);
    left = Math.min(Math.max(left, minLeft), maxLeft);
    tooltip.dataset.placement = placement;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function getTooltipElement() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'info-tooltip';
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }
})();
