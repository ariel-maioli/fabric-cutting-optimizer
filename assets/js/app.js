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
  const themeToggle = document.getElementById('themeToggle');

  const state = {
    fabric: { widthCm: 150, marginX: 1, marginY: 1 },
    spacing: { gapX: 0.5, gapY: 0.5 },
    pieces: PIECE_DEFAULTS.map(createPiece)
  };

  let lastLayout = null;
  let rafId = null;

  init();

  function init() {
    bindScalarInputs();
    bindPieceEvents();
    bindThemeToggle();
    bindExport();
    renderPieceRows();
    syncScalarInputs();
    queueRecalc();
    window.addEventListener('resize', () => queueRecalc(true));
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
      if (!lastLayout || !lastLayout.bands.length) {
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
      queueRecalc();
      return;
    }
    const sanitized = meta.min != null ? Math.max(meta.min, value) : value;
    input.value = sanitized;
    setScalarValue(meta.path, sanitized);
    setHelper(key, '');
    queueRecalc();
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
    queueRecalc();
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
      queueRecalc();
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
    queueRecalc();
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
      queueRecalc();
      return;
    }
    state.pieces = state.pieces.filter((piece) => piece.id !== id);
    renderPieceRows();
    queueRecalc();
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

  function queueRecalc() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const snapshot = computeSnapshot();
      lastLayout = snapshot.layout;
      updateMetrics(snapshot.metrics);
      setStatus(snapshot.status);
      renderPreview(snapshot.layout);
    });
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
    const bands = [];
    let cursorY = spec.marginY;
    let currentBand = null;
    let pieceArea = 0;

    const startBand = () => {
      currentBand = {
        id: `band-${bands.length + 1}`,
        index: bands.length,
        y: cursorY,
        height: 0,
        widthUsed: 0,
        placements: []
      };
    };

    const finalizeBand = () => {
      if (!currentBand) return;
      bands.push(currentBand);
      cursorY += currentBand.height + spec.gapY;
      currentBand = null;
    };

    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      pieceArea += piece.width * piece.height;
      if (piece.width > printableWidth + 1e-6) {
        return { error: `El ancho de "${piece.label}" supera el ancho útil.` };
      }
      if (!currentBand) startBand();
      if (!tryPlaceInBand(currentBand, piece, spec, printableWidth)) {
        finalizeBand();
        startBand();
        if (!tryPlaceInBand(currentBand, piece, spec, printableWidth)) {
          return { error: `No se pudo ubicar la pieza "${piece.label}".` };
        }
      }
    }
    finalizeBand();

    const usedHeight = bands.reduce((sum, band) => sum + band.height, 0);
    const verticalGaps = Math.max(0, bands.length - 1) * spec.gapY;
    const totalLengthCm = usedHeight + verticalGaps + spec.marginY * 2;

    return {
      bands,
      totalLengthCm,
      printableWidth,
      spec,
      pieceArea
    };
  }

  function tryPlaceInBand(band, piece, spec, printableWidth) {
    const gap = band.placements.length > 0 ? spec.gapX : 0;
    const projectedWidth = band.widthUsed + gap + piece.width;
    if (projectedWidth > printableWidth + 1e-6) {
      return false;
    }
    const placement = {
      pieceId: piece.id,
      label: piece.label,
      width: piece.width,
      height: piece.height,
      x: spec.marginX + band.widthUsed + gap,
      y: band.y
    };
    band.placements.push(placement);
    band.widthUsed = projectedWidth;
    band.height = Math.max(band.height, piece.height);
    return true;
  }

  function buildMetrics(layout, totalPieces) {
    if (!layout) return null;
    const totalLength = layout.totalLengthCm;
    const bandCount = layout.bands.length;
    const fabricArea = layout.spec.widthCm * Math.max(totalLength, 0);
    const usage = fabricArea > 0 ? Math.min(100, (layout.pieceArea / fabricArea) * 100) : 0;
    return {
      lengthCm: totalLength,
      bands: bandCount,
      pieces: totalPieces,
      usagePct: usage
    };
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
    if (!layout || !layout.bands.length) {
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

    layout.bands.forEach((band, index) => {
      const fill = index % 2 === 0 ? colors.piecePrimary : colors.pieceSecondary;
      band.placements.forEach((placement) => {
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
