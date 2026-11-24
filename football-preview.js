document.addEventListener('DOMContentLoaded', () => {
  const dialog = document.getElementById('footballPreview');
  document.querySelectorAll('[data-order-football-model]').forEach(card => {
    card.addEventListener('click', () => setFootballModel(card.dataset.orderFootballModel));
  });
  document.getElementById('closeFootballPreview').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.querySelectorAll('[data-football-model]').forEach(button => {
    button.addEventListener('click', () => {
      const model = button.dataset.footballModel;
      const label = model === 'player' ? 'นักฟุตบอล' : 'ผู้รักษาประตู';
      dialog.querySelectorAll('[data-football-model]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      for (const side of ['front', 'back']) {
        const image = document.getElementById(side === 'front' ? 'footballFront' : 'footballBack');
        image.src = `./football-${model}-${side}.png`;
        image.alt = `เสื้อ${label}${side === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}`;
      }
    });
  });
});
