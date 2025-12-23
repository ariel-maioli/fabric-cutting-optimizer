// Modal de alertas centralizado para errores y validaciones
(function () {
  let modalEl = null;
  let modalContentEl = null;
  let closeBtn = null;

  function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'alert-modal';
    modalEl.innerHTML = `
      <div class="alert-modal__overlay" tabindex="-1"></div>
      <div class="alert-modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="alertModalTitle">
        <div class="alert-modal__content">
          <h2 id="alertModalTitle" class="alert-modal__title">Atención</h2>
          <div class="alert-modal__body"></div>
          <button type="button" class="alert-modal__close" aria-label="Cerrar">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    modalContentEl = modalEl.querySelector('.alert-modal__body');
    closeBtn = modalEl.querySelector('.alert-modal__close');
    closeBtn.addEventListener('click', hideModal);
    modalEl.querySelector('.alert-modal__overlay').addEventListener('click', hideModal);
    document.addEventListener('keydown', (e) => {
      if (modalEl.style.display !== 'none' && (e.key === 'Escape' || e.key === 'Esc')) hideModal();
    });
    hideModal();
  }

  function showModal(html) {
    ensureModal();
    modalContentEl.innerHTML = html;
    modalEl.style.display = 'flex';
    closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function hideModal() {
    if (!modalEl) return;
    modalEl.style.display = 'none';
    document.body.style.overflow = '';
  }

  window.AlertModal = { show: showModal, hide: hideModal };
})();
