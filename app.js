// ========================================================
// ⚙️ แผงตั้งค่าพิกัด & ขนาดสกรีนเสื้อ (สามารถปรับค่าที่นี่ได้โดยตรง)
// ========================================================
const JERSEY_CONFIG = {
  // Midpoint between the two white seams, in pixels of the back artwork.
  backCenterX: 652,

  // Back number calibrated for the Authong star jersey artwork.
  backNumber: {
    y: 524,
    size: 256,
    digitWidth: 175
  },

  // Back name is a straight line below the small shoulder monogram.
  backName: {
    y: 363,
    baseSize: 67,
    maxWidth: 373,
    top: 288,
    bottom: 387
  }
};

// ==========================================
// 1. APPLICATION STATE
// ==========================================
const JERSEY_PRICE = 279;
const APP_CONFIG = window.CONFIG || {};
function createOrderId() {
  const suffix = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    .replace(/-/g, '').slice(0, 12).toUpperCase();
  return `AT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${suffix}`;
}
const NEW_STUDENT_NUMBER_PATTERN = /^(?:[1-9]|1[0-9]|20)[กข]$/u;
const LEGACY_STUDENT_NUMBER_PATTERN = /^[0-9]{1,3}[ก-ฮ]?$/u;
// These rooms also work with Apps Script deployments that predate the expanded list.
const PREVIOUS_ROOMS = new Set([
  'ม.1/3', 'ม.1/8', 'ม.1/13',
  'ม.2/2', 'ม.2/7', 'ม.2/12', 'ม.2/17',
  'ม.3/6', 'ม.3/11', 'ม.3/16',
  'ม.4/1', 'ม.4/5', 'ม.4/10', 'ม.4/15',
  'ม.5/4', 'ม.5/9', 'ม.5/14',
  'ม.6/1', 'ม.6/12', 'ม.6/13'
]);
const ROOM_UNAVAILABLE_MESSAGE = 'ห้องนี้จะเปิดให้จองเมื่อระบบบันทึกข้อมูลอัปเดตแล้ว';

const AppState = {
  mode: 'new', // 'new' | 'edit'
  customer: null,
  category: 'ORIGINAL',
  quantity: 1,
  pendingOrderId: '',
  viewSide: 'back', // 'back' | 'front' | 'both'
  studentNumber: '',
  room: '',
  size: 'L',
  screenName: '',
  screenNumber: '10',
  paymentStatus: 'pending', // legacy
  orderStatus: 'รอชำระเงิน', // ค่าสถานะหลักที่บันทึกลง Sheets
  allRoomsSupported: false,
  slipImage: null, // Base64 data URL
  slipFileName: '',
  slipUploadedAt: null,
  slipChanged: false,
  newSlipCode: '',
  isSubmitting: false,
  gasUrl: APP_CONFIG.gasUrl
    || (['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.origin}/gas` : localStorage.getItem('PURPLE_JERSEY_GAS_URL') || ''),
  googleClientId: APP_CONFIG.googleClientId || '',
  spreadsheetId: '1WOI_8VSHi_6FIaifxPNuX7hTHEElSVKeR8InFHSQZLw',
  existingRecord: null,
  savedJerseyChanges: [],
  customerOrders: [],
  orders: []
};

// Initial Seed Orders - Removed (using Google Sheets only)
const DEFAULT_DEMO_ORDERS = [];

// ==========================================
// 2. DOM ELEMENT REFERENCES
// ==========================================
const DOM = {
  identityStudentNumber: document.getElementById('identityStudentNumber'),
  identityRoom: document.getElementById('identityRoom'),
  inputQuantity: document.getElementById('inputQuantity'),
  currentCollectionLabel: document.getElementById('currentCollectionLabel'),
  orderTotalDisplay: document.getElementById('orderTotalDisplay'),
  // Form Inputs & Buttons
  formContentSection: document.getElementById('formContentSection'),
  submitButtonSection: document.getElementById('submitButtonSection'),
  inputScreenName: document.getElementById('inputScreenName'),
  inputScreenNumber: document.getElementById('inputScreenNumber'),
  inputStudentNumber: document.getElementById('inputStudentNumber'),
  inputLegacyStudentNumber: document.getElementById('inputLegacyStudentNumber'),
  legacyStudentNumberField: document.getElementById('legacyStudentNumberField'),
  inputRoom: document.getElementById('inputRoom'),
  btnLookupStudent: document.getElementById('btnLookupStudent'),
  studentLookupSpinner: document.getElementById('studentLookupSpinner'),
  studentLookupText: document.getElementById('studentLookupText'),
  studentLookupStatus: document.getElementById('studentLookupStatus'),
  btnSubmit: document.getElementById('btnSubmit'),
  btnSubmitText: document.getElementById('btnSubmitText'),
  btnSubmitIcon: document.getElementById('btnSubmitIcon'),
  btnReset: document.getElementById('btnResetForm'),
  btnRandomNumber: document.getElementById('btnRandomNumber'),
  btnCapsName: document.getElementById('btnCapsName'),
  sizeBtns: document.querySelectorAll('.size-btn'),
  quickSelectSizeBtns: document.querySelectorAll('.btn-quick-select-size'),
  jerseyChanges: document.getElementById('jerseyChanges'),
  jerseyChangesStatus: document.getElementById('jerseyChangesStatus'),
  jerseyChangesList: document.getElementById('jerseyChangesList'),
  jerseyChangeRow: document.getElementById('jerseyChangeRow'),

  // Mode Banner
  // Order Status Display (Read-only)
  paymentStatusSection: document.getElementById('paymentStatusSection'),
  orderStatusBadge: document.getElementById('orderStatusBadge'),
  statusBtns: document.querySelectorAll('.status-btn'),

  // Payment & Slip Upload Elements
  btnOpenQrModal: document.getElementById('btnOpenQrModal'),
  btnCopyAccount: document.getElementById('btnCopyAccount'),
  qrPromptPayModal: document.getElementById('qrPromptPayModal'),
  btnCloseQrModal: document.getElementById('btnCloseQrModal'),
  bankAccountName: document.getElementById('bankAccountName'),
  bankAccountNumber: document.getElementById('bankAccountNumber'),
  qrAccountName: document.getElementById('qrAccountName'),
  qrAccountNumber: document.getElementById('qrAccountNumber'),
  copyAccountStatus: document.getElementById('copyAccountStatus'),
  paymentAccountInfo: document.getElementById('paymentAccountInfo'),
  paymentCompleteInfo: document.getElementById('paymentCompleteInfo'),
  slipDropzone: document.getElementById('slipDropzone'),
  inputSlipFile: document.getElementById('inputSlipFile'),
  savedSlipCard: document.getElementById('savedSlipCard'),
  savedSlipMessage: document.getElementById('savedSlipMessage'),
  btnReplaceSavedSlip: document.getElementById('btnReplaceSavedSlip'),
  slipPreviewCard: document.getElementById('slipPreviewCard'),
  slipThumbnailImg: document.getElementById('slipThumbnailImg'),
  slipStatusBadge: document.getElementById('slipStatusBadge'),
  slipFileName: document.getElementById('slipFileName'),
  slipUploadTime: document.getElementById('slipUploadTime'),
  btnViewSlipFullscreen: document.getElementById('btnViewSlipFullscreen'),
  btnChangeSlip: document.getElementById('btnChangeSlip'),
  btnRemoveSlip: document.getElementById('btnRemoveSlip'),

  // Slip Lightbox Modal
  modalSlipLightbox: document.getElementById('modalSlipLightbox'),
  btnCloseSlipLightbox: document.getElementById('btnCloseSlipLightbox'),
  slipFullImg: document.getElementById('slipFullImg'),

  // Preview Elements
  jerseyCardWrapper: document.getElementById('jerseyCardWrapper'),
  jerseyViewBackEl: document.getElementById('jerseyViewBackEl'),
  jerseyViewFrontEl: document.getElementById('jerseyViewFrontEl'),
  jerseyViewBothEl: document.getElementById('jerseyViewBothEl'),
  jerseyArtworkStatus: document.getElementById('jerseyArtworkStatus'),
  sizeGuideJerseyEl: document.getElementById('sizeGuideJerseyEl'),

  // SVG Text
  svgBackName: document.getElementById('svgBackName'),
  svgBackNumber: document.getElementById('svgBackNumber'),
  svgBothName: document.getElementById('svgBothName'),
  svgBothNumber: document.getElementById('svgBothNumber'),

  // View Switchers
  btnViewBack: document.getElementById('btnViewBack'),
  btnViewFront: document.getElementById('btnViewFront'),
  btnViewBoth: document.getElementById('btnViewBoth'),
  btnToggleRotation: null,
  btnDownloadJersey: document.getElementById('btnDownloadJersey'),

  // Size Guide Modal
  modalSizeGuide: document.getElementById('modalSizeGuide'),
  btnOpenSizeGuideNav: document.getElementById('btnOpenSizeGuideNav'),
  btnOpenSizeGuideLink: document.getElementById('btnOpenSizeGuideLink'),
  btnCloseSizeGuide: document.getElementById('btnCloseSizeGuide'),

  // Google Sheets Config Modal
  btnOpenConfig: document.getElementById('btnOpenConfig'),
  btnCloseConfig: document.getElementById('btnCloseConfig'),
  modalConfig: document.getElementById('modalConfig'),
  inputGasUrl: document.getElementById('inputGasUrl'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),
  btnTestGas: document.getElementById('btnTestGas'),
  gasStatusDot: document.getElementById('gasStatusDot'),
  gasStatusText: document.getElementById('gasStatusText'),

  // Database Modals & Toast
  totalOrdersCount: document.getElementById('totalOrdersCount'),
  modalOrdersCount: document.getElementById('modalOrdersCount'),
  btnOpenDatabase: document.getElementById('btnOpenDatabase'),
  btnCloseDatabase: document.getElementById('btnCloseDatabase'),
  btnCloseDatabaseFooter: document.getElementById('btnCloseDatabaseFooter'),
  modalDatabase: document.getElementById('modalDatabase'),
  ordersListContainer: document.getElementById('ordersListContainer'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  toastContainer: document.getElementById('toastContainer')
};

const JERSEY_VIEWS = {
  back: { element: DOM.jerseyViewBackEl, button: DOM.btnViewBack },
  front: { element: DOM.jerseyViewFrontEl, button: DOM.btnViewFront },
  both: { element: DOM.jerseyViewBothEl, button: DOM.btnViewBoth }
};
const jerseyArtworkRequests = new Map();

// ==========================================
// 3. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-jersey-price]').forEach(label => {
    label.textContent = `฿${JERSEY_PRICE}`;
  });
  updateOrderTotals();
  initStudentOptions();
  bindEvents();
  initJerseyDock();
  updateLivePreview();
  document.fonts?.addEventListener('loadingdone', renderJerseyPrint);
  updateJerseyArtwork(AppState.viewSide);
  checkGasConnection();
  openSlipFromLink();
  // Removed: loadOrdersDatabase() - No longer using LocalStorage
});

function initStudentOptions() {
  for (const select of [DOM.inputStudentNumber, DOM.identityStudentNumber]) {
    for (const group of select.querySelectorAll('optgroup')) {
      for (let number = 1; number <= 20; number++) {
        const studentNumber = number + group.dataset.studentSuffix;
        group.append(new Option(studentNumber, studentNumber));
      }
    }
  }

  for (const select of [DOM.inputRoom, DOM.identityRoom]) {
    for (let grade = 1; grade <= 6; grade++) {
      const group = document.createElement('optgroup');
      group.label = 'ม.' + grade;
      for (let number = 1; number <= 17; number++) {
        const room = group.label + '/' + number;
        group.append(new Option(room, room));
      }
      select.append(group);
    }
  }
}

function getStudentNumberInput() {
  return DOM.inputStudentNumber.value === 'legacy' ? DOM.inputLegacyStudentNumber : DOM.inputStudentNumber;
}

function setStudentNumberSelection(studentNumber) {
  const legacy = studentNumber !== '' && !NEW_STUDENT_NUMBER_PATTERN.test(studentNumber);
  DOM.inputStudentNumber.value = legacy ? 'legacy' : studentNumber;
  DOM.inputLegacyStudentNumber.value = legacy ? studentNumber : '';
  DOM.legacyStudentNumberField.hidden = !legacy;
}

function updateOrderTotals() {
  const quantity = Math.max(1, Math.min(5, Number(DOM.inputQuantity?.value || AppState.quantity || 1)));
  const total = JERSEY_PRICE * quantity;
  if (DOM.orderTotalDisplay) DOM.orderTotalDisplay.textContent = `฿${total.toLocaleString('th-TH')}`;
  document.querySelectorAll('[data-total-price]').forEach(label => {
    label.textContent = `฿${total.toLocaleString('th-TH')}`;
  });
}

function canBookRoom(room) {
  return AppState.allRoomsSupported || PREVIOUS_ROOMS.has(room);
}

// ==========================================
// 4. EVENT BINDINGS
// ==========================================
function bindEvents() {
  if (DOM.inputQuantity) DOM.inputQuantity.addEventListener('change', () => {
    AppState.quantity = Math.max(1, Math.min(5, Number(DOM.inputQuantity.value || 1)));
    updateOrderTotals();
  });

  const openSizeGuide = () => {
    if (!DOM.modalSizeGuide) return;
    prepareJerseyArtwork(DOM.sizeGuideJerseyEl, 'front');
    DOM.modalSizeGuide.classList.remove('hidden');
    document.documentElement.classList.add('size-guide-open');
    document.body.classList.add('size-guide-open');
  };
  const closeSizeGuide = () => {
    if (!DOM.modalSizeGuide) return;
    DOM.modalSizeGuide.classList.add('hidden');
    document.documentElement.classList.remove('size-guide-open');
    document.body.classList.remove('size-guide-open');
  };

  // Student number + room identify and load an existing order.
  DOM.btnLookupStudent.addEventListener('click', () => {
    const input = getStudentNumberInput();
    const studentNumber = input.value.replace(/\s+/g, '');
    const room = DOM.inputRoom.value.trim();

    if (!LEGACY_STUDENT_NUMBER_PATTERN.test(studentNumber)) {
      const message = input === DOM.inputStudentNumber
        ? 'กรุณาเลือกเลขที่'
        : 'กรุณากรอกเลขที่ที่ใช้จองไว้';
      showToast(message, 'error');
      input.focus();
      return;
    }
    if (!room) {
      showToast('กรุณาเลือกห้องเรียน', 'error');
      DOM.inputRoom.focus();
      return;
    }

    lookupStudentAndShowForm(studentNumber, room);
  });

  // Personalization inputs
  DOM.inputScreenName.addEventListener('input', (e) => {
    AppState.screenName = e.target.value;
    previewPersonalization();
  });

  DOM.inputScreenNumber.addEventListener('input', (e) => {
    const number = e.target.value.replace(/\D/g, '').slice(0, 2);
    AppState.screenNumber = number;
    if (e.target.value !== number) e.target.value = number;
    previewPersonalization();
  });

  [DOM.inputScreenName, DOM.inputScreenNumber].forEach(field => {
    field.addEventListener('focus', showPrintSide);
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        field.blur();
      }
    });
  });

  DOM.inputStudentNumber.addEventListener('change', () => {
    DOM.legacyStudentNumberField.hidden = DOM.inputStudentNumber.value !== 'legacy';
  });

  DOM.inputRoom.addEventListener('change', (e) => {
    AppState.room = e.target.value;
  });

  // Quick Tools
  if (DOM.btnCapsName) {
    DOM.btnCapsName.addEventListener('click', () => {
      AppState.screenName = AppState.screenName.toUpperCase();
      DOM.inputScreenName.value = AppState.screenName;
      previewPersonalization();
    });
  }

  if (DOM.btnRandomNumber) {
    DOM.btnRandomNumber.addEventListener('click', () => {
      const luckyNums = ['07', '09', '10', '11', '14', '20', '23', '26', '77', '99'];
      const chosen = luckyNums[Math.floor(Math.random() * luckyNums.length)];
      AppState.screenNumber = chosen;
      DOM.inputScreenNumber.value = chosen;
      previewPersonalization();
    });
  }

  // Size pills
  DOM.sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => selectJerseySize(btn.dataset.size));
  });

  // Status pills
  const statusBtns = document.querySelectorAll('.status-btn');
  statusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      statusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.orderStatus = btn.getAttribute('data-status');
      console.log('Status changed to:', AppState.orderStatus);
      
      // Disable slip upload if status is "ชำระเงินแล้ว" or later
      renderSlipPreview();
    });
  });

  // Size guide quick selection
  DOM.quickSelectSizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sizeVal = btn.dataset.selectSize;
      selectJerseySize(sizeVal);
      closeSizeGuide();
      showToast(`เลือกไซส์ ${sizeVal} เรียบร้อยแล้ว`, 'success');
    });
  });

  // Size Guide Modal Open/Close
  if (DOM.btnOpenSizeGuideNav) {
    DOM.btnOpenSizeGuideNav.addEventListener('click', openSizeGuide);
  }
  if (DOM.btnOpenSizeGuideLink) {
    DOM.btnOpenSizeGuideLink.addEventListener('click', openSizeGuide);
  }
  if (DOM.modalSizeGuide) {
    DOM.modalSizeGuide.addEventListener('click', (event) => {
      const clickedCloseButton = event.target.closest && event.target.closest('#btnCloseSizeGuide');
      if (event.target === DOM.modalSizeGuide || clickedCloseButton) {
        closeSizeGuide();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !DOM.modalSizeGuide.classList.contains('hidden')) {
        closeSizeGuide();
      }
    });
  }

  // View Switchers
  if (DOM.btnViewBack) DOM.btnViewBack.addEventListener('click', () => setJerseyView('back'));
  if (DOM.btnViewFront) DOM.btnViewFront.addEventListener('click', () => setJerseyView('front'));
  if (DOM.btnViewBoth) DOM.btnViewBoth.addEventListener('click', () => setJerseyView('both'));

  initPaymentQrEvents();
  initSlipUploadEvents();

  // Reset Form
  DOM.btnReset.addEventListener('click', () => {
    if (confirm('คุณต้องการล้างข้อมูลในแบบฟอร์มใช่หรือไม่?')) {
      resetForm();
    }
  });

  // Submit Order
  DOM.btnSubmit.addEventListener('click', handleFormSubmit);

  // Download Jersey (optional - removed from UI)
  if (DOM.btnDownloadJersey) {
    DOM.btnDownloadJersey.addEventListener('click', downloadJerseyMockup);
  }

  // Modals
  if (DOM.btnOpenDatabase) DOM.btnOpenDatabase.addEventListener('click', openDatabaseModal);
  if (DOM.btnCloseDatabase) DOM.btnCloseDatabase.addEventListener('click', closeDatabaseModal);
  if (DOM.btnCloseDatabaseFooter) DOM.btnCloseDatabaseFooter.addEventListener('click', closeDatabaseModal);
  if (DOM.btnExportCSV) DOM.btnExportCSV.addEventListener('click', exportOrdersToCSV);

  // Google Sheets Config Modals
  if (DOM.btnOpenConfig) DOM.btnOpenConfig.addEventListener('click', openConfigModal);
  if (DOM.btnCloseConfig) DOM.btnCloseConfig.addEventListener('click', closeConfigModal);
  if (DOM.btnSaveConfig) DOM.btnSaveConfig.addEventListener('click', saveGasConfig);
  if (DOM.btnTestGas) DOM.btnTestGas.addEventListener('click', testGasConnection);
}

// ==========================================
// 5. SLIP UPLOAD & PROCESSING
// ==========================================
const LOCKED_PAYMENT_STATUSES = new Set(['ชำระเงินแล้ว', 'ชำระเงินสำเร็จ', 'ตรวจสอบแล้ว', 'กำลังผลิต', 'จัดส่งแล้ว', 'เสร็จสิ้น']);
const SLIP_CODE_PATTERN = /^[0-9a-f]{32}$/;
let savedSlipRequest = null;
let slipSelection = 0;
let isPreparingSlip = false;

function initSlipUploadEvents() {
  // File Input Change
  if (DOM.inputSlipFile) {
    DOM.inputSlipFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processSlipFile(e.target.files[0]);
      }
    });
  }

  // Drag and Drop
  if (DOM.slipDropzone) {
    ['dragenter', 'dragover'].forEach(name => {
      DOM.slipDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        DOM.slipDropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      DOM.slipDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        DOM.slipDropzone.classList.remove('dragover');
      });
    });

    DOM.slipDropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processSlipFile(files[0]);
      }
    });
  }

  const chooseSlip = () => DOM.inputSlipFile.click();
  DOM.btnChangeSlip.addEventListener('click', chooseSlip);
  DOM.btnReplaceSavedSlip.addEventListener('click', chooseSlip);

  if (DOM.btnRemoveSlip) {
    DOM.btnRemoveSlip.addEventListener('click', () => {
      restoreSavedSlip();
      showToast('ยกเลิกการแนบรูปใหม่แล้ว', 'info');
    });
  }

  if (DOM.btnViewSlipFullscreen) {
    DOM.btnViewSlipFullscreen.addEventListener('click', showSlipLightbox);
  }

  if (DOM.btnCloseSlipLightbox) {
    DOM.btnCloseSlipLightbox.addEventListener('click', () => {
      DOM.modalSlipLightbox.classList.add('hidden');
    });
  }

  if (DOM.modalSlipLightbox) {
    DOM.modalSlipLightbox.addEventListener('click', (e) => {
      if (e.target === DOM.modalSlipLightbox) {
        DOM.modalSlipLightbox.classList.add('hidden');
      }
    });
  }
}

function initJerseyDock() {
  const mobileViewport = window.matchMedia('(max-width: 767px)');
  const visualViewport = window.visualViewport;
  const navCard = document.querySelector('.apple-glass-nav');
  const jersey = DOM.jerseyCardWrapper;
  const jerseyStage = jersey.parentElement;
  const orderStudio = document.getElementById('orderStudio');
  const isOrderField = (element) => element?.matches?.('main .apple-glass-input');

  let editingField = null;
  let keyboardInset = 0;
  let previewDocked = false;
  let scrollFrame = 0;
  let focusReleaseTimer;
  let fieldRevealTimer;

  const updateJerseyDock = () => {
    const isEditing = !orderStudio.classList.contains('hidden') && mobileViewport.matches && editingField !== null;
    const nextKeyboardInset = isEditing && visualViewport && visualViewport.scale <= 1.05
      ? Math.max(0, Math.round(window.innerHeight - visualViewport.height))
      : 0;
    if (nextKeyboardInset !== keyboardInset) {
      keyboardInset = nextKeyboardInset;
      document.body.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
    }
    document.body.classList.toggle('is-mobile-form-editing', isEditing);

    const canDock = !orderStudio.classList.contains('hidden') && mobileViewport.matches;
    // Measure the compact toolbar edge even while its preview card is expanded.
    const navRect = navCard.getBoundingClientRect();
    const navBottom = navRect.top + 48;
    const stageRect = jerseyStage.getBoundingClientRect();
    if (!canDock) {
      previewDocked = false;
    } else if (isEditing) {
      // Keep the live shirt preview in the expanded navbar while a print field is active.
      previewDocked = true;
    } else if (previewDocked) {
      // Hysteresis prevents the preview jumping in and out at the navbar edge.
      if (stageRect.top > navBottom + 24) previewDocked = false;
    } else if (stageRect.bottom < navBottom + 8) {
      previewDocked = true;
    }

    const nextParent = previewDocked ? navCard : jerseyStage;
    if (jersey.parentElement !== nextParent) nextParent.append(jersey);
    document.body.classList.toggle('is-mobile-preview-docked', previewDocked && jersey.parentElement === navCard);
    jersey.classList.toggle('is-docked', previewDocked);
    jerseyStage.classList.toggle('is-preview-docked', previewDocked);
    navCard.classList.toggle('jersey-preview-expanded', previewDocked);
    navCard.classList.remove('is-personalizing', 'has-short-viewport');
    navCard.classList.toggle('is-form-editing', isEditing);
  };

  const scheduleJerseyDockUpdate = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateJerseyDock();
    });
  };

  const revealFocusedField = (delay) => {
    window.clearTimeout(fieldRevealTimer);
    fieldRevealTimer = window.setTimeout(() => {
      if (!editingField || editingField !== document.activeElement || !mobileViewport.matches ||
          (visualViewport && visualViewport.scale > 1.05)) return;

      const viewportTop = visualViewport?.offsetTop ?? 0;
      const visibleBottom = viewportTop + (visualViewport?.height ?? window.innerHeight) - 16;
      const visibleTop = Math.max(viewportTop, navCard.getBoundingClientRect().bottom) + 12;
      const fieldRect = editingField.getBoundingClientRect();

      if (fieldRect.bottom > visibleBottom) {
        window.scrollBy({ top: fieldRect.bottom - visibleBottom, behavior: 'auto' });
      } else if (fieldRect.top < visibleTop) {
        window.scrollBy({ top: fieldRect.top - visibleTop, behavior: 'auto' });
      }
    }, delay);
  };

  const handleViewportResize = () => {
    updateJerseyDock();
    if (editingField) revealFocusedField(120);
  };
  window.addEventListener('resize', handleViewportResize, { passive: true });
  visualViewport?.addEventListener('resize', handleViewportResize, { passive: true });
  window.addEventListener('scroll', scheduleJerseyDockUpdate, { passive: true });

  document.addEventListener('focusin', (event) => {
    if (!isOrderField(event.target)) return;
    window.clearTimeout(focusReleaseTimer);
    editingField = event.target;
    updateJerseyDock();
    revealFocusedField(260);
  });
  document.addEventListener('focusout', (event) => {
    if (event.target !== editingField) return;
    window.clearTimeout(fieldRevealTimer);
    // Let the keyboard close before restoring the full preview.
    focusReleaseTimer = window.setTimeout(() => {
      editingField = isOrderField(document.activeElement) ? document.activeElement : null;
      updateJerseyDock();
    }, 350);
  });
  document.addEventListener('storefront-page-change', () => {
    previewDocked = false;
    updateJerseyDock();
  });
  updateJerseyDock();
}

// ==========================================
// QR PROMPTPAY MODAL
// ==========================================
function initPaymentQrEvents() {
  const dialog = DOM.qrPromptPayModal;
  const accountNumber = DOM.bankAccountNumber.textContent.trim();
  DOM.qrAccountNumber.textContent = accountNumber;
  DOM.qrAccountName.textContent = DOM.bankAccountName.textContent.trim();

  DOM.btnOpenQrModal.addEventListener('click', () => {
    DOM.copyAccountStatus.textContent = '';
    dialog.showModal();
    dialog.scrollTop = 0;
  });
  DOM.btnCloseQrModal.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  DOM.btnCopyAccount.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(accountNumber.replace(/-/g, ''));
      DOM.copyAccountStatus.textContent = 'คัดลอกเลขบัญชีแล้ว';
    } catch {
      DOM.copyAccountStatus.textContent = 'แตะค้างที่เลขบัญชีเพื่อเลือกคัดลอก';
    }
  });
}

async function processSlipFile(file) {
  if (AppState.isSubmitting || LOCKED_PAYMENT_STATUSES.has(AppState.orderStatus)) return;
  if (!file || !file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WEBP)', 'error');
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    showToast('ขนาดไฟล์ใหญ่เกิน 15MB กรุณาเลือกไฟล์ที่เล็กลง', 'error');
    return;
  }

  showToast('กำลังประมวลผลรูปภาพสลิป...', 'info');

  cancelSavedSlipLoad();
  const selection = ++slipSelection;
  isPreparingSlip = true;
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await compressSlipImage(imageUrl);
    if (selection !== slipSelection) return;
    AppState.slipImage = image;
    AppState.slipFileName = file.name;
    AppState.slipUploadedAt = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    AppState.slipChanged = true;
    AppState.newSlipCode = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    renderSlipPreview();
    showToast('เลือกสลิปแล้ว กดบันทึกเพื่อส่ง', 'success');
  } catch {
    if (selection === slipSelection) showToast('เปิดรูปสลิปไม่ได้ กรุณาเลือกไฟล์รูปอื่น', 'error');
  } finally {
    URL.revokeObjectURL(imageUrl);
    if (selection === slipSelection) {
      isPreparingSlip = false;
      DOM.inputSlipFile.value = '';
    }
  }
}

async function compressSlipImage(imageUrl) {
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const scale = Math.min(1, 900 / img.naturalWidth, 1200 / img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ==========================================
// ORDER STATUS DISPLAY (READ-ONLY from Sheets)
// ==========================================

function renderOrderStatus(statusText) {
  console.log('[RENDER STATUS] Called with:', statusText);

  if (!statusText || statusText.trim() === '') {
    // Show default status
    statusText = 'รอชำระเงิน';
  }

  // Show alert for cancelled status
  if (statusText === 'ยกเลิก') {
    setTimeout(() => {
      showCancelledOrderAlert();
    }, 500);
  }

  // Update active status button
  const statusBtns = document.querySelectorAll('.status-btn');
  statusBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-status') === statusText);
  });
  
  // Update slip upload access based on status
  AppState.orderStatus = statusText;
  renderSlipPreview();
}

// ==========================================
// SLIP PREVIEW & UPLOAD
// ==========================================
function renderSlipPreview() {
  const record = AppState.existingRecord;
  const locked = LOCKED_PAYMENT_STATUSES.has(AppState.orderStatus);
  const hasPreview = Boolean(AppState.slipImage);
  const hasSavedSlip = Boolean(record?.hasSlip);
  DOM.orderStatusBadge.textContent = AppState.orderStatus;
  DOM.paymentAccountInfo.classList.toggle('hidden', locked);
  DOM.paymentCompleteInfo.classList.toggle('hidden', !locked);
  DOM.slipDropzone.classList.toggle('hidden', locked || hasPreview || hasSavedSlip);
  DOM.savedSlipCard.classList.toggle('hidden', hasPreview || !hasSavedSlip);
  DOM.btnReplaceSavedSlip.classList.toggle('hidden', locked);
  DOM.slipPreviewCard.classList.toggle('hidden', !hasPreview);
  DOM.btnChangeSlip.classList.toggle('hidden', locked);
  DOM.btnRemoveSlip.classList.toggle('hidden', locked || !AppState.slipChanged);

  if (hasPreview) {
    DOM.slipThumbnailImg.src = AppState.slipImage;
    DOM.slipFileName.textContent = AppState.slipFileName || 'สลิปการโอนเงิน';
    DOM.slipUploadTime.textContent = AppState.slipUploadedAt ? 'เลือกเมื่อ ' + AppState.slipUploadedAt : '';
    DOM.slipStatusBadge.textContent = AppState.slipChanged ? 'พร้อมส่งเมื่อบันทึก' : 'สลิปที่บันทึกไว้';
  } else {
    DOM.slipThumbnailImg.removeAttribute('src');
    DOM.slipFullImg.removeAttribute('src');
    DOM.modalSlipLightbox.classList.add('hidden');
  }
}

function showSlipLightbox() {
  if (!AppState.slipImage) return;
  DOM.slipFullImg.src = AppState.slipImage;
  DOM.modalSlipLightbox.classList.remove('hidden');
}

function openSlipFromLink() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has('slip')) return;

  const slipCode = params.get('slip').trim().toLowerCase();
  const studentNumber = (params.get('no') || '').replace(/\s+/g, '');
  const room = normalizeRoomValue(params.get('room'));
  // Keep the private link token out of the address bar after opening it.
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
  const knownRoom = Array.from(DOM.inputRoom.options).some(option => option.value === room);
  if (!SLIP_CODE_PATTERN.test(slipCode) || !LEGACY_STUDENT_NUMBER_PATTERN.test(studentNumber) || !room || !knownRoom) {
    showToast('ลิงก์สลิปไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากผู้ดูแล', 'error');
    return;
  }
  lookupStudentAndShowForm(studentNumber, room, slipCode);
}

function getSlipSummary(data) {
  return {
    hasSlip: data.hasSlip === true || data.hasSlip === 'มีสลิป' || Boolean(data.slipUrl),
    slipAvailable: data.slipAvailable === true
  };
}

function slipCodeStorageKey(studentNumber, room) {
  const student = String(studentNumber).replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
  const customerKey = AppState.customer?.type === 'general'
    ? ['general', String(AppState.customer.phone || '').replace(/\D/g, '')]
    : ['student', normalizeRoomValue(room), student];
  return 'AUTHONG_SLIP_CODE:' + JSON.stringify([AppState.gasUrl, AppState.category, customerKey]);
}

function readSlipCode(studentNumber, room) {
  try {
    return localStorage.getItem(slipCodeStorageKey(studentNumber, room)) || '';
  } catch {
    return '';
  }
}

function rememberSlipCode(studentNumber, room, code) {
  try {
    localStorage.setItem(slipCodeStorageKey(studentNumber, room), code);
  } catch {
    // The private link still works when local storage is unavailable.
  }
}

function cancelSavedSlipLoad() {
  savedSlipRequest?.abort();
  savedSlipRequest = null;
}

function restoreSavedSlip(linkCode = '') {
  cancelSavedSlipLoad();
  slipSelection++;
  isPreparingSlip = false;
  AppState.slipChanged = false;
  AppState.newSlipCode = '';
  AppState.slipImage = null;
  AppState.slipFileName = '';
  AppState.slipUploadedAt = null;
  DOM.inputSlipFile.value = '';
  const record = AppState.existingRecord;
  DOM.savedSlipMessage.textContent = record?.hasSlip
    ? (record.slipAvailable ? 'เปิดรูปจากลิงก์ส่วนตัวของรายการนี้' : 'ติดต่อผู้ดูแลเพื่อให้ตรวจรูปสลิปเดิม')
    : '';
  renderSlipPreview();
  if (record?.slipAvailable) {
    const code = linkCode || readSlipCode(record.studentNumber, record.room);
    if (SLIP_CODE_PATTERN.test(code)) loadSavedSlip(code, Boolean(linkCode));
  } else if (linkCode) {
    showToast('ยังเปิดรูปสลิปของรายการนี้ไม่ได้ กรุณาติดต่อผู้ดูแล', 'error');
  }
}

async function loadSavedSlip(code, openFullImage) {
  const record = AppState.existingRecord;
  if (!record?.slipAvailable || AppState.slipChanged || isPreparingSlip) return;

  cancelSavedSlipLoad();
  const request = new AbortController();
  savedSlipRequest = request;
  DOM.savedSlipMessage.textContent = 'กำลังโหลดรูปสลิป…';
  try {
    const url = new URL(AppState.gasUrl);
    url.searchParams.set('action', 'getSlip');
    url.searchParams.set('orderId', record.orderId || '');
    url.searchParams.set('customerType', AppState.customer?.type || 'student');
    url.searchParams.set('category', record.category || AppState.category || 'ORIGINAL');
    if (AppState.customer?.type === 'general') url.searchParams.set('phone', AppState.customer.phone || '');
    else {
      url.searchParams.set('studentNumber', record.studentNumber);
      url.searchParams.set('room', record.room);
    }
    url.searchParams.set('slipCode', code);
    const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer', signal: request.signal });
    const result = await response.json();
    if (savedSlipRequest !== request || AppState.existingRecord !== record) return;
    if (result.status !== 'success' || !/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(result.image)) {
      DOM.savedSlipMessage.textContent = result.code === 'invalid_slip_code'
        ? 'ขอลิงก์เปิดสลิปล่าสุดจากผู้ดูแล'
        : 'เปิดรูปสลิปเดิมไม่ได้ ให้ผู้ดูแลตรวจไฟล์ใน Drive';
      if (openFullImage) showToast(DOM.savedSlipMessage.textContent, 'error');
      return;
    }

    rememberSlipCode(record.studentNumber, record.room, code);
    AppState.slipImage = result.image;
    AppState.slipFileName = 'สลิปการโอนเงินเดิม';
    DOM.savedSlipMessage.textContent = '';
    renderSlipPreview();
    if (openFullImage) showSlipLightbox();
  } catch {
    if (savedSlipRequest === request) {
      DOM.savedSlipMessage.textContent = 'โหลดรูปไม่สำเร็จ ลองเปิดรายการอีกครั้ง';
      if (openFullImage) showToast('โหลดรูปไม่สำเร็จ ลองเปิดลิงก์อีกครั้ง', 'error');
    }
  } finally {
    if (savedSlipRequest === request) {
      savedSlipRequest = null;
      if (AppState.existingRecord !== record) DOM.savedSlipMessage.textContent = '';
    }
  }
}

// ==========================================
// 6. LIVE PREVIEW ENGINE (CLEAN - NO SHADOWS)
// ==========================================
const jerseyTextMeasure = document.createElement('canvas').getContext?.('2d');

function calculateDynamicNameTypography(nameText, baseSize) {
  const len = nameText ? nameText.trim().length : 0;
  let dynamicSize = baseSize;
  let letterSpacing = '4';

  if (len === 0) {
    dynamicSize = baseSize;
    letterSpacing = '4';
  } else if (len <= 4) {
    dynamicSize = Math.max(baseSize, Math.round(baseSize * 1.08));
    letterSpacing = '9';
  } else if (len <= 6) {
    dynamicSize = baseSize;
    letterSpacing = '6';
  } else if (len <= 8) {
    dynamicSize = Math.round(baseSize * 0.90);
    letterSpacing = '4';
  } else if (len <= 10) {
    dynamicSize = Math.round(baseSize * 0.78);
    letterSpacing = '2.5';
  } else if (len <= 12) {
    dynamicSize = Math.round(baseSize * 0.68);
    letterSpacing = '1.8';
  } else {
    dynamicSize = Math.round(baseSize * 0.58);
    letterSpacing = '1';
  }

  return { dynamicSize, letterSpacing };
}

function normalizeRoomValue(room) {
  const value = String(room || '').trim();
  return /^[1-6]\/\d{1,2}$/.test(value) ? `ม.${value}` : value;
}

function formatScreenName(value) {
  return String(value ?? '').trim().toUpperCase();
}

function showPrintSide() {
  if (AppState.viewSide === 'front') setJerseyView('back');
}

function previewPersonalization() {
  showPrintSide();
  updateLivePreview();
}

function selectJerseySize(size) {
  AppState.size = size;
  DOM.sizeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.size === size));
  renderJerseyChanges();
}

function getJerseyChanges(original, updated) {
  return [
    { label: 'ชื่อสกรีน', before: formatScreenName(original.name), after: formatScreenName(updated.name) },
    { label: 'เบอร์เสื้อ', before: String(original.number ?? '').trim(), after: String(updated.number ?? '').trim() },
    { label: 'ไซส์', before: original.size, after: updated.size }
  ].filter(({ before, after }) => before !== after);
}

function renderJerseyChanges() {
  const original = AppState.existingRecord;
  DOM.jerseyChanges.classList.toggle('hidden', !original);
  if (!original) {
    DOM.jerseyChangesList.replaceChildren();
    DOM.jerseyChangesStatus.textContent = '';
    return;
  }

  const pendingChanges = getJerseyChanges(original, {
    name: AppState.screenName,
    number: AppState.screenNumber,
    size: AppState.size
  });
  const visibleChanges = pendingChanges.length ? pendingChanges : AppState.savedJerseyChanges;
  let status = 'ยังไม่มีการแก้ไข';
  if (pendingChanges.length) status = 'ยังไม่ได้บันทึก';
  else if (visibleChanges.length) status = 'บันทึกล่าสุดแล้ว';
  if (DOM.jerseyChangesStatus.textContent !== status) DOM.jerseyChangesStatus.textContent = status;

  const rows = visibleChanges.map(({ label, before, after }) => {
    const row = DOM.jerseyChangeRow.content.cloneNode(true);
    row.querySelector('dt').textContent = label;
    row.querySelector('[data-before]').textContent = before || 'ว่าง';
    row.querySelector('[data-after]').textContent = after || 'ว่าง';
    return row;
  });
  DOM.jerseyChangesList.replaceChildren(...rows);
}

function getJerseyInkCenter(element, bounds) {
  const layoutCenter = bounds.x + bounds.width / 2;
  if (!jerseyTextMeasure) return layoutCenter;

  const style = getComputedStyle(element);
  jerseyTextMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  jerseyTextMeasure.textAlign = 'center';
  const letterSpacing = parseFloat(style.letterSpacing) || 0;
  const measuresSpacing = 'letterSpacing' in jerseyTextMeasure;
  if (measuresSpacing) jerseyTextMeasure.letterSpacing = `${letterSpacing}px`;

  const metrics = jerseyTextMeasure.measureText(element.textContent.replace(/\s+/g, ' '));
  if (!metrics.width || !Number.isFinite(metrics.actualBoundingBoxLeft) ||
      !Number.isFinite(metrics.actualBoundingBoxRight)) return layoutCenter;

  // SVG stretches the number to textLength; apply the same scale to the ink offset.
  const targetWidth = Number(element.getAttribute('textLength'));
  const widthScale = targetWidth ? targetWidth / metrics.width : 1;
  const inkOffset = (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2;
  const spacingOffset = measuresSpacing ? 0 : -letterSpacing / 2;
  return JERSEY_CONFIG.backCenterX + (inkOffset + spacingOffset) * widthScale;
}

function centerJerseyText(element, { y, maxWidth, top, bottom }) {
  if (!element?.textContent) return;
  const bounds = element.getBBox();
  if (!bounds.width || !bounds.height) return;

  let scale = 1;
  if (maxWidth) {
    const padding = 4; // Allow for glyph overhang and SVG layout rounding.
    scale = Math.min(
      1,
      (maxWidth - 2 * padding) / bounds.width,
      (y - top - padding) / Math.max(1, y - bounds.y),
      (bottom - y - padding) / Math.max(1, bounds.y + bounds.height - y)
    );
  }

  const textCenter = getJerseyInkCenter(element, bounds);
  const shiftX = JERSEY_CONFIG.backCenterX - textCenter * scale;
  const shiftY = y * (1 - scale);
  element.setAttribute('transform', `translate(${shiftX} ${shiftY}) scale(${scale})`);
}

function renderJerseyPrint() {
  const name = formatScreenName(AppState.screenName);
  const number = String(AppState.screenNumber ?? '').trim();
  const isEditing = AppState.mode === 'edit';
  const displayName = name || (isEditing ? '' : 'YOUR NAME');
  const displayNumber = number || (isEditing ? '' : '10');

  const { backCenterX, backNumber, backName } = JERSEY_CONFIG;
  const numberWidth = String(Math.min(displayNumber.length, 2) * backNumber.digitWidth);

  // Start with the preferred typography and measure the visible SVG in jersey coordinates.
  const { dynamicSize, letterSpacing } = calculateDynamicNameTypography(name, backName.baseSize);

  const updateNameText = (element, fontSize) => {
    if (!element) return;
    element.textContent = displayName;
    element.setAttribute('x', backCenterX.toString());
    element.setAttribute('y', backName.y.toString());
    element.setAttribute('font-size', fontSize.toString());
    element.setAttribute('letter-spacing', letterSpacing);
    element.removeAttribute('transform');
  };

  updateNameText(DOM.svgBackName, dynamicSize);
  updateNameText(DOM.svgBothName, Math.round(dynamicSize * 0.95));

  for (const element of [DOM.svgBackNumber, DOM.svgBothNumber]) {
    if (!element) continue;
    element.setAttribute('font-size', backNumber.size.toString());
    element.setAttribute('x', backCenterX.toString());
    element.setAttribute('y', backNumber.y.toString());
    element.setAttribute('textLength', numberWidth);
    element.textContent = displayNumber;
    element.removeAttribute('transform');
  }

  if (AppState.viewSide !== 'front') {
    const showBoth = AppState.viewSide === 'both';
    centerJerseyText(showBoth ? DOM.svgBothName : DOM.svgBackName, backName);
    centerJerseyText(showBoth ? DOM.svgBothNumber : DOM.svgBackNumber, backNumber);
  }
}

function updateLivePreview() {
  renderJerseyPrint();
  renderJerseyChanges();
}

async function decodeJerseyImage(src) {
  const image = new Image();
  if (typeof image.decode === 'function') {
    image.src = src;
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = src;
    });
  }
  return image;
}

function loadJerseyArtwork(side) {
  if (!jerseyArtworkRequests.has(side)) {
    const file = `./jersey_authong_${side}`;
    const assets = [decodeJerseyImage(file + '.webp').catch(() => decodeJerseyImage(file + '.png'))];
    if (side === 'back') {
      assets.push(decodeJerseyImage('./jersey-authong-back-fabric.png'), decodeJerseyImage('./authong-logo.png'));
    }
    const request = Promise.all(assets).then(([artwork]) => artwork).catch(error => {
      jerseyArtworkRequests.delete(side);
      throw error;
    });
    jerseyArtworkRequests.set(side, request);
  }
  return jerseyArtworkRequests.get(side);
}

async function prepareJerseyArtwork(element, side) {
  if (element.classList.contains('artwork-ready')) return true;
  const sides = side === 'both' ? ['back', 'front'] : [side];
  try {
    const images = await Promise.all(sides.map(loadJerseyArtwork));
    element.style.backgroundImage = images.map(image => `url("${image.src}")`).join(', ');
    element.classList.add('artwork-ready');
    return true;
  } catch {
    return false;
  }
}

async function updateJerseyArtwork(side) {
  const { element } = JERSEY_VIEWS[side];
  const status = DOM.jerseyArtworkStatus;
  status.hidden = element.classList.contains('artwork-ready');
  if (!status.hidden) status.textContent = 'กำลังโหลดภาพเสื้อ…';

  const ready = await prepareJerseyArtwork(element, side);
  if (AppState.viewSide !== side) return;
  status.hidden = ready;
  if (ready) renderJerseyPrint();
  else status.textContent = 'โหลดภาพเสื้อไม่สำเร็จ กดมุมมองเดิมเพื่อลองใหม่';
}

function setJerseyView(side) {
  if (AppState.viewSide !== side) {
    AppState.viewSide = side;
    for (const [viewSide, { element, button }] of Object.entries(JERSEY_VIEWS)) {
      const selected = side === viewSide;
      element.classList.toggle('hidden', !selected);
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    DOM.jerseyCardWrapper.classList.toggle('is-dual-view', side === 'both');
  }
  updateJerseyArtwork(side);
}

// ==========================================
// 7. STUDENT LOOKUP & DATABASE
// ==========================================
function hideFormContent() {
  if (DOM.formContentSection) DOM.formContentSection.classList.add('hidden');
  if (DOM.submitButtonSection) DOM.submitButtonSection.classList.add('hidden');
}

function showFormContent() {
  if (DOM.formContentSection) DOM.formContentSection.classList.remove('hidden');
  if (DOM.paymentStatusSection) DOM.paymentStatusSection.classList.remove('hidden');
  if (DOM.submitButtonSection) DOM.submitButtonSection.classList.remove('hidden');
}

async function lookupStudentAndShowForm(studentNumber, room, slipCode = '', prefetchedRecord) {
  hideFormContent();
  resetToNewMode();
  const customer = AppState.customer || { type: 'student', studentNumber, room };
  AppState.studentNumber = customer.type === 'student' ? studentNumber : '';
  AppState.room = customer.type === 'student' ? room : '';
  if (customer.type === 'student') {
    setStudentNumberSelection(studentNumber);
    DOM.inputRoom.value = room;
  }
  DOM.studentLookupSpinner.classList.remove('hidden');
  DOM.studentLookupText.textContent = 'กำลังตรวจสอบ...';
  DOM.studentLookupStatus.textContent = '';
  DOM.btnLookupStudent.disabled = true;

  try {
    if (!AppState.gasUrl) throw new Error('Google Apps Script URL is not configured.');

    let result;
    if (prefetchedRecord !== undefined && !slipCode) {
      result = {
        status: 'success', found: Boolean(prefetchedRecord), data: prefetchedRecord,
        allRooms: AppState.allRoomsSupported
      };
    } else {
      const searchUrl = new URL(AppState.gasUrl);
      searchUrl.searchParams.set('action', 'search');
      searchUrl.searchParams.set('customerType', customer.type || 'student');
      searchUrl.searchParams.set('category', AppState.category || 'ORIGINAL');
      if (customer.type === 'general') {
        if (customer.customerId) searchUrl.searchParams.set('customerId', customer.customerId);
        else searchUrl.searchParams.set('phone', customer.phone || '');
      } else {
        searchUrl.searchParams.set('studentNumber', studentNumber);
        searchUrl.searchParams.set('room', room);
      }
      searchUrl.searchParams.set('_', Date.now().toString());

      const response = await fetch(searchUrl.toString(), { cache: 'no-store' });
      result = await response.json();
    }
    if (!result || result.status !== 'success') {
      throw new Error(result && result.message ? result.message : 'Invalid response from Google Sheets.');
    }

    AppState.allRoomsSupported = result.allRooms === true;
    if (customer.type === 'student' && !slipCode && !canBookRoom(room)) {
      DOM.studentLookupStatus.textContent = ROOM_UNAVAILABLE_MESSAGE;
      showToast(ROOM_UNAVAILABLE_MESSAGE, 'info');
      return;
    }

    if (result.found && result.data) {
      const gasRecord = {
        ...result.data,
        orderId: String(result.data.orderId || ''),
        customerType: String(result.data.customerType || customer.type || 'student'),
        category: String(result.data.category || AppState.category || 'ORIGINAL'),
        quantity: Number(result.data.quantity || 1),
        studentNumber: String(result.data.studentNumber || studentNumber).replace(/\s+/g, ''),
        room: normalizeRoomValue(result.data.room || room),
        name: String(result.data.name ?? ''),
        number: String(result.data.number ?? '').trim(),
        size: String(result.data.size ?? '').trim().toUpperCase() || 'L',
        timestamp: result.data.timestamp || '',
        status: result.data.status || 'รอชำระเงิน',
        ...getSlipSummary(result.data)
      };

      switchToEditMode(gasRecord, slipCode);
      showFormContent();
      DOM.studentLookupStatus.textContent = '';
      return;
    }

    if (slipCode || (customer.type === 'student' && !NEW_STUDENT_NUMBER_PATTERN.test(studentNumber))) {
      DOM.studentLookupStatus.textContent = slipCode
        ? 'ไม่พบรายการจากลิงก์สลิป กรุณาติดต่อผู้ดูแล'
        : 'ไม่พบรายการจากเลขที่เดิม หากต้องการจองใหม่ให้เลือกเลขที่ในเมนู';
      showToast(DOM.studentLookupStatus.textContent, 'error');
      return;
    }
    showFormContent();
    DOM.studentLookupStatus.textContent = '';
    showToast('พร้อมเริ่มสั่งจอง', 'success');
  } catch (err) {
    console.error('Google Sheets lookup error:', err);
    DOM.studentLookupStatus.textContent = 'เชื่อมต่อ Google Sheets ไม่สำเร็จ ลองตรวจสอบ Apps Script';
    showToast('เกิดข้อผิดพลาดในการค้นหา Google Sheets', 'error');
  } finally {
    DOM.studentLookupSpinner.classList.add('hidden');
    DOM.studentLookupText.textContent = 'ตรวจสอบข้อมูล / เริ่มจอง';
    DOM.btnLookupStudent.disabled = false;
  }
}
function loadOrdersDatabase() {
  // Removed LocalStorage - using Google Sheets only
  AppState.orders = [];
}

function saveOrdersToLocal() {
  // Removed LocalStorage - using Google Sheets only
}

function updateOrdersCountBadge() {
  // Removed - no longer tracking local count
}

function switchToEditMode(record, slipCode) {
  AppState.mode = 'edit';
  AppState.existingRecord = record;
  AppState.pendingOrderId = String(record.orderId || '');
  AppState.quantity = Number(record.quantity || 1);
  AppState.savedJerseyChanges = [];

  AppState.screenName = record.name;
  AppState.screenNumber = record.number;
  AppState.studentNumber = (record.studentNumber || '').toString();
  AppState.room = normalizeRoomValue(record.room);
  AppState.size = record.size || 'L';
  AppState.orderStatus = record.status || 'รอชำระเงิน';

  DOM.inputScreenName.value = AppState.screenName;
  DOM.inputScreenNumber.value = AppState.screenNumber;
  if (DOM.inputQuantity) DOM.inputQuantity.value = String(Math.max(1, Math.min(5, AppState.quantity)));
  updateOrderTotals();
  setStudentNumberSelection(AppState.studentNumber);
  DOM.inputRoom.value = AppState.room;

  DOM.sizeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-size') === AppState.size);
  });

  // Update status buttons
  const statusBtns = document.querySelectorAll('.status-btn');
  statusBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-status') === AppState.orderStatus);
  });

  // Show order status from Sheets (read-only)
  renderOrderStatus(AppState.orderStatus);

  restoreSavedSlip(slipCode);

  DOM.btnSubmitText.textContent = 'บันทึกการแก้ไขข้อมูล';
  DOM.btnSubmitIcon.className = 'fa-solid fa-floppy-disk mr-1.5';

  previewPersonalization();
}

function resetToNewMode() {
  AppState.mode = 'new';
  AppState.existingRecord = null;
  AppState.pendingOrderId = '';
  AppState.quantity = 1;
  if (DOM.inputQuantity) DOM.inputQuantity.value = '1';
  updateOrderTotals();
  AppState.savedJerseyChanges = [];
  AppState.orderStatus = 'รอชำระเงิน';
  
  // Clear form fields
  AppState.screenName = '';
  AppState.screenNumber = '10';
  AppState.size = 'L';
  
  DOM.inputScreenName.value = '';
  DOM.inputScreenNumber.value = '10';
  
  // Reset size buttons
  DOM.sizeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-size') === 'L');
  });

  // Hide order status display on reset
  if (DOM.orderStatusSection) DOM.orderStatusSection.classList.add('hidden');
  
  // Clear slip preview
  restoreSavedSlip();
  
  // Update button text
  DOM.btnSubmitText.textContent = 'ยืนยันการสั่งจองและส่งสลิป';
  DOM.btnSubmitIcon.className = 'fa-solid fa-check mr-1.5';
  
  // Update live preview
  updateLivePreview();
}

function resetForm() {
  AppState.screenName = '';
  AppState.screenNumber = '10';
  AppState.studentNumber = '';
  AppState.room = '';
  AppState.size = 'L';

  DOM.inputScreenName.value = '';
  DOM.inputScreenNumber.value = '10';
  setStudentNumberSelection('');
  DOM.inputRoom.value = '';
  DOM.studentLookupStatus.textContent = '';

  DOM.sizeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-size') === 'L'));

  resetToNewMode();
  hideFormContent(); // Hide form when reset
  updateLivePreview();
}

// ==========================================
// 8. FORM SUBMISSION & GOOGLE SHEETS
// ==========================================
async function handleFormSubmit() {
  if (AppState.isSubmitting) return;
  if (isPreparingSlip) {
    showToast('รอให้เตรียมรูปสลิปเสร็จก่อนกดบันทึก', 'info');
    return;
  }

  const originalRecord = AppState.existingRecord;
  const customer = AppState.customer || {};
  const studentNumber = customer.type === 'student'
    ? String(customer.studentNumber || getStudentNumberInput().value).replace(/\s+/g, '')
    : '';
  const room = customer.type === 'student' ? String(customer.room || DOM.inputRoom.value).trim() : '';
  const name = formatScreenName(DOM.inputScreenName.value);
  const number = DOM.inputScreenNumber.value.trim();
  const quantity = Math.max(1, Math.min(5, Number(originalRecord?.quantity || AppState.quantity || 1)));
  const deliveryMethod = customer.deliveryMethod || document.getElementById('deliveryMethod')?.value || 'school_pickup';
  const recipientName = '';
  const shippingAddress = deliveryMethod === 'shipping'
    ? String(customer.address || document.getElementById('shippingAddress')?.value || '').trim()
    : '';
  const postalCode = deliveryMethod === 'shipping'
    ? String(customer.postalCode || document.getElementById('shippingPostcode')?.value || '').trim()
    : '';
  const contactName = String(customer.fullName || '').trim();
  const phone = String(customer.phone || '').trim();

  if (!['student', 'general'].includes(customer.type)) {
    showToast('กรุณาเลือกประเภทผู้สั่งจองก่อน', 'error');
    return;
  }
  if (customer.type === 'general' && !contactName) {
    showToast('กรุณากรอกชื่อ-นามสกุล', 'error');
    return;
  }
  if (customer.type === 'general' && !customer.googleCredential) {
    showToast('กรุณาลงชื่อเข้าใช้ Google ก่อนทำรายการ', 'error');
    return;
  }
  if (customer.type === 'general' && !/^[0-9+()\-\s]{8,20}$/.test(phone)) {
    showToast('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง', 'error');
    return;
  }
  if (deliveryMethod === 'shipping') {
    if (!shippingAddress || !/^\d{5}$/.test(postalCode)) {
      showToast('กรุณากรอกที่อยู่และรหัสไปรษณีย์ 5 หลัก', 'error');
      return;
    }
  }

  if (!name) {
    showToast('กรุณาระบุชื่อที่ต้องการสกรีน', 'error');
    DOM.inputScreenName.focus();
    return;
  }

  if (!number) {
    showToast('กรุณาระบุเบอร์เสื้อ (0-99)', 'error');
    DOM.inputScreenNumber.focus();
    return;
  }

  if (!/^[0-9]{1,2}$/.test(number)) {
    showToast('เบอร์เสื้อต้องเป็นตัวเลข 1-2 หลัก เช่น 01 หรือ 10', 'error');
    DOM.inputScreenNumber.focus();
    return;
  }

  const keepsLegacyNumber = LEGACY_STUDENT_NUMBER_PATTERN.test(studentNumber)
    && studentNumber === originalRecord?.studentNumber;
  if (customer.type === 'student' && !NEW_STUDENT_NUMBER_PATTERN.test(studentNumber) && !keepsLegacyNumber) {
    showToast('กรุณาเลือกเลขที่ 1ก–20ก หรือ 1ข–20ข', 'error');
    DOM.inputStudentNumber.focus();
    return;
  }

  if (customer.type === 'student' && !room) {
    showToast('กรุณาเลือกห้องเรียน', 'error');
    DOM.inputRoom.focus();
    return;
  }
  if (customer.type === 'student' && !canBookRoom(room)) {
    showToast(ROOM_UNAVAILABLE_MESSAGE, 'info');
    return;
  }

  if (!AppState.gasUrl) {
    showToast('ยังไม่ได้ตั้งค่า Google Apps Script URL', 'error');
    return;
  }

  AppState.studentNumber = studentNumber;
  AppState.room = room;
  AppState.quantity = quantity;
  AppState.customer = { ...customer, phone, deliveryMethod, recipientName, address: shippingAddress, postalCode };

  const orderActions = [DOM.inputStudentNumber, DOM.inputLegacyStudentNumber, DOM.inputRoom,
    DOM.btnLookupStudent, DOM.btnReset, DOM.btnSubmit,
    DOM.inputSlipFile, DOM.btnReplaceSavedSlip, DOM.btnChangeSlip, DOM.btnRemoveSlip];
  AppState.isSubmitting = true;
  orderActions.forEach(button => { button.disabled = true; });
  DOM.btnSubmitText.textContent = 'กำลังบันทึกข้อมูล...';

  const nowStr = new Date().toLocaleString('th-TH');
  
  const shouldSendSlip = AppState.slipChanged && Boolean(AppState.slipImage);
  const slipCode = shouldSendSlip ? AppState.newSlipCode :
    originalRecord ? readSlipCode(originalRecord.studentNumber, originalRecord.room) : '';
  const orderId = String(originalRecord?.orderId || AppState.pendingOrderId || createOrderId());
  AppState.pendingOrderId = orderId;

  const orderData = {
    orderId,
    customerType: customer.type,
    customer: {
      type: customer.type,
      studentNumber,
      room,
      fullName: contactName || String(customer.studentName || '').trim(),
      phone,
      deliveryMethod,
      recipientName,
      address: shippingAddress,
      postalCode,
    },
    googleCredential: customer.type === 'general' ? String(customer.googleCredential || '') : '',
    category: AppState.category || 'ORIGINAL',
    studentNumber: studentNumber,
    room: room,
    originalStudentNumber: String(originalRecord?.studentNumber ?? ''),
    originalRoom: normalizeRoomValue(originalRecord?.room),
    productTitle: `${AppState.category || 'ORIGINAL'} · Authong Athletics 2026`,
    name,
    number: number,
    size: AppState.size,
    quantity,
    unitPrice: JERSEY_PRICE,
    price: JERSEY_PRICE,
    timestamp: nowStr,
    status: shouldSendSlip ? 'รอตรวจสอบสลิป' : AppState.orderStatus,
    slipImage: shouldSendSlip ? AppState.slipImage : null,
    slipCode: shouldSendSlip ? slipCode : '',
    slipFileName: AppState.slipFileName || null,
    slipUploadedAt: AppState.slipUploadedAt || (AppState.slipImage ? nowStr : null)
  };
  
  // Send a CORS-safelisted text/plain JSON body, then verify the saved row with GAS GET.
  let confirmedOrder = null;
  try {
    await fetch(AppState.gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(orderData)
    });

    for (let attempt = 0; attempt < 4 && !confirmedOrder; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 300 * attempt));

      const verifyUrl = new URL(AppState.gasUrl);
      verifyUrl.searchParams.set('action', 'search');
      verifyUrl.searchParams.set('customerType', customer.type);
      verifyUrl.searchParams.set('category', AppState.category || 'ORIGINAL');
      verifyUrl.searchParams.set('orderId', orderId);
      if (customer.type === 'general') verifyUrl.searchParams.set('customerId', String(customer.customerId || ''));
      else {
        verifyUrl.searchParams.set('studentNumber', studentNumber);
        verifyUrl.searchParams.set('room', room);
      }
      if (slipCode) verifyUrl.searchParams.set('slipCode', slipCode);
      verifyUrl.searchParams.set('_', Date.now().toString());
      const verifyResponse = await fetch(verifyUrl, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      const verifyResult = await verifyResponse.json();
      const saved = verifyResult?.status === 'success' && verifyResult.found && verifyResult.data;

      const orderMatches = !!saved
        && String(saved.orderId ?? '') === orderId
        && String(saved.studentNumber ?? '').trim() === studentNumber
        && normalizeRoomValue(saved.room) === room
        && formatScreenName(saved.name) === orderData.name
        && String(saved.number ?? '').trim() === orderData.number
        && String(saved.size ?? '').trim().toUpperCase() === orderData.size
        && String(saved.category ?? AppState.category) === AppState.category
        && Number(saved.quantity || 1) === quantity;
      if (orderMatches && (!shouldSendSlip || saved.slipAvailable === undefined || saved.slipCodeMatches === true)) {
        confirmedOrder = saved;
      }
    }

    if (!confirmedOrder) {
      throw new Error('Google Sheets did not return the submitted order values.');
    }
  } catch (err) {
    console.warn('Google Sheets sync warning:', err);
    showToast('ยืนยันการบันทึกจาก Google Sheets ไม่ได้ กรุณาลองตรวจสอบรายการอีกครั้ง', 'error');
    return;
  } finally {
    AppState.isSubmitting = false;
    orderActions.forEach(button => { button.disabled = false; });
    DOM.btnSubmitText.textContent = AppState.mode === 'edit' ? 'บันทึกการแก้ไขข้อมูล' : 'ยืนยันการสั่งจองและส่งสลิป';
  }

  if (slipCode && confirmedOrder.slipCodeMatches === true) rememberSlipCode(studentNumber, room, slipCode);
  AppState.pendingOrderId = String(confirmedOrder.orderId || orderId);
  const legacySlipUpload = shouldSendSlip && confirmedOrder.slipAvailable === undefined;
  if (originalRecord && AppState.existingRecord === originalRecord) {
    const savedChanges = getJerseyChanges(originalRecord, orderData);
    if (savedChanges.length) AppState.savedJerseyChanges = savedChanges;
    Object.assign(originalRecord, {
      name: orderData.name,
      number: orderData.number,
      size: orderData.size,
      studentNumber: orderData.studentNumber,
      room: orderData.room,
      ...getSlipSummary(confirmedOrder)
    });
    renderJerseyChanges();
  }
  
  AppState.slipChanged = false;
  AppState.newSlipCode = '';
  AppState.slipUploadedAt = null;
  renderOrderStatus(confirmedOrder.status || AppState.orderStatus);

  triggerConfetti();
  if (legacySlipUpload) {
    DOM.slipStatusBadge.textContent = 'ส่งสลิปแล้ว รอยืนยันไฟล์';
    showToast('บันทึกคำสั่งจองแล้ว แต่ยังยืนยันไฟล์สลิปไม่ได้', 'info');
  } else {
    showToast(shouldSendSlip ? 'บันทึกคำสั่งจองและสลิปแล้ว' : 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
  }
  window.dispatchEvent(new Event('authong-order-saved'));
}

// ==========================================
// 9. MODALS & EXPORT
// ==========================================
function openDatabaseModal() {
  renderOrdersList();
  DOM.modalDatabase.classList.remove('hidden');
}

function closeDatabaseModal() {
  DOM.modalDatabase.classList.add('hidden');
}

function renderOrdersList() {
  if (AppState.orders.length === 0) {
    DOM.ordersListContainer.innerHTML = `
      <div class="text-center py-8 text-slate-400">
        <i class="fa-solid fa-box-open text-3xl mb-2"></i>
        <p class="text-xs">ยังไม่มีรายการสั่งจอง</p>
      </div>`;
    return;
  }

  DOM.ordersListContainer.innerHTML = AppState.orders.map((o, idx) => `
    <div class="p-3.5 rounded-2xl bg-white border border-purple-100 shadow-sm flex items-center justify-between gap-3">
      <div class="flex items-center space-x-3">
        ${o.slipImage ? `
          <div class="w-10 h-12 rounded-lg bg-slate-100 border border-purple-100 overflow-hidden shrink-0 cursor-pointer" onclick="viewOrderSlipFull(${idx})" title="คลิกเพื่อดูสลิป">
            <img src="${o.slipImage}" alt="Slip" class="w-full h-full object-cover">
          </div>
        ` : `
          <div class="w-10 h-12 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-xs shrink-0" title="ไม่มีสลิป">
            <i class="fa-solid fa-image"></i>
          </div>
        `}
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-black text-slate-900 text-sm font-sport-bold">${o.name}</span>
            <span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-mono font-bold text-xs">#${o.number}</span>
            <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-xs">Size ${o.size}</span>
          </div>
          <p class="text-[11px] text-slate-600">เลขที่ ${o.studentNumber || '-'} · ห้อง ${o.room || '-'}</p>
          <p class="text-[11px] text-slate-500 font-mono">฿${o.price}</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button onclick="editOrderFromList(${idx})" class="p-2 rounded-lg text-purple-600 hover:bg-purple-50 text-xs font-bold transition cursor-pointer" title="แก้ไข">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button onclick="deleteOrderFromList(${idx})" class="p-2 rounded-lg text-rose-500 hover:bg-rose-50 text-xs font-bold transition cursor-pointer" title="ลบ">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

window.viewOrderSlipFull = function (idx) {
  const order = AppState.orders[idx];
  if (order && order.slipImage) {
    DOM.slipFullImg.src = order.slipImage;
    DOM.modalSlipLightbox.classList.remove('hidden');
  }
};

window.editOrderFromList = function (idx) {
  const order = AppState.orders[idx];
  if (!order) return;
  closeDatabaseModal();
  lookupStudentAndShowForm(String(order.studentNumber || '').replace(/\s+/g, ''), normalizeRoomValue(order.room));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteOrderFromList = function (idx) {
  if (confirm('คุณต้องการลบรายการสั่งจองนี้ใช่หรือไม่?')) {
    AppState.orders.splice(idx, 1);
    saveOrdersToLocal();
    renderOrdersList();
    showToast('ลบรายการเรียบร้อยแล้ว', 'info');
  }
};

function exportOrdersToCSV() {
  if (AppState.orders.length === 0) {
    showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
    return;
  }

  let csv = 'Timestamp,StudentNumber,Room,Name,Number,Size,Style,Price,Status,HasSlip\n';
  AppState.orders.forEach(o => {
    csv += `"${o.timestamp}","${o.studentNumber || ''}","${o.room || ''}","${o.name}","${o.number}","${o.size}","${o.style}","${o.price}","${o.status || 'Confirmed'}","${o.slipImage ? 'YES' : 'NO'}"\n`;
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `authong_purple_orders_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('ส่งออกไฟล์ CSV สำเร็จ', 'success');
}

// Google Sheets Config Modal Handlers
function openConfigModal() {
  if (DOM.inputGasUrl) DOM.inputGasUrl.value = AppState.gasUrl;
  if (DOM.modalConfig) DOM.modalConfig.classList.remove('hidden');
}

function closeConfigModal() {
  if (DOM.modalConfig) DOM.modalConfig.classList.add('hidden');
}

function saveGasConfig() {
  const url = DOM.inputGasUrl ? DOM.inputGasUrl.value.trim() : '';
  AppState.gasUrl = url;
  AppState.allRoomsSupported = false;
  localStorage.setItem('PURPLE_JERSEY_GAS_URL', url);
  checkGasConnection();
  closeConfigModal();
  showToast('บันทึกการตั้งค่า Google Sheets แล้ว', 'success');
}

function testGasConnection() {
  const url = DOM.inputGasUrl ? DOM.inputGasUrl.value.trim() : '';
  if (!url) {
    showToast('กรุณากรอก Web App URL ก่อนทดสอบ', 'error');
    return;
  }
  showToast('กำลังทดสอบการเชื่อมต่อ...', 'info');
  fetch(`${url}?action=ping`, { mode: 'no-cors' })
    .then(() => {
      showToast('เชื่อมต่อกับ Google Apps Script สำเร็จ!', 'success');
    })
    .catch(() => {
      showToast('การส่งข้อมูลพร้อมใช้งาน (โหมด no-cors)', 'info');
    });
}

function checkGasConnection() {
  if (AppState.gasUrl) {
    if (DOM.gasStatusDot) DOM.gasStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shadow-xs';
    if (DOM.gasStatusText) DOM.gasStatusText.textContent = 'Sheets (เชื่อมแล้ว)';
  } else {
    if (DOM.gasStatusDot) DOM.gasStatusDot.className = 'w-2 h-2 rounded-full bg-slate-300';
    if (DOM.gasStatusText) DOM.gasStatusText.textContent = 'Google Sheets';
  }
}

// ==========================================
// 10. UTILITIES
// ==========================================
function downloadJerseyMockup() {
  showToast('กำลังประมวลผลรูปภาพเสื้อ HD...', 'info');
  html2canvas(DOM.jerseyCardWrapper, {
    backgroundColor: null,
    scale: 2,
    useCORS: true
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = `Authong_Purple_Jersey_${AppState.screenName || 'Custom'}_${AppState.screenNumber || '10'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('ดาวน์โหลดรูปภาพเสื้อเรียบร้อยแล้ว!', 'success');
  }).catch(err => {
    showToast('เกิดข้อผิดพลาดในการดาวน์โหลด', 'error');
  });
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#a78bfa', '#8b5cf6', '#c4b5fd', '#fbcfe8']
    });
  }
}

function showCancelledOrderAlert() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'cancelledOrderModal';
  modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-up">
      <!-- Icon -->
      <div class="flex justify-center">
        <div class="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
          <i class="fa-solid fa-circle-exclamation text-3xl text-rose-600"></i>
        </div>
      </div>
      
      <!-- Title -->
      <h3 class="text-xl font-bold text-center text-slate-900">
        คำสั่งซื้อถูกยกเลิก
      </h3>
      
      <!-- Message -->
      <div class="space-y-2 text-sm text-slate-700">
        <p class="text-center font-semibold text-rose-700">
          <i class="fa-solid fa-hand-holding-heart mr-1"></i>
          ไม่ต้องตกใจนะครับ!
        </p>
        <p class="text-center">
          คำสั่งซื้อของคุณถูกยกเลิกเนื่องจากข้อมูลไม่ครบถ้วนหรือมีปัญหา
        </p>
        <div class="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs space-y-1">
          <p class="font-semibold text-purple-900">
            <i class="fa-solid fa-lightbulb mr-1"></i>
            วิธีแก้ไข:
          </p>
          <ul class="list-disc list-inside text-purple-800 space-y-0.5 ml-1">
            <li>อัปโหลดสลิปการชำระเงินใหม่อีกครั้ง</li>
            <li>ตรวจสอบข้อมูลให้ถูกต้องครบถ้วน</li>
            <li>หรือติดต่อทีมงานที่ <strong>OpenChat</strong></li>
          </ul>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="flex gap-2">
        <button type="button" id="btnContactSupport" 
          class="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-sm hover:shadow-lg transition">
          <i class="fa-solid fa-comments mr-1.5"></i>
          ติดต่อทีมงาน
        </button>
        <button type="button" id="btnCloseModal" 
          class="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition">
          <i class="fa-solid fa-check mr-1.5"></i>
          เข้าใจแล้ว
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal handler
  const closeModal = () => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  };
  
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Contact support handler
  document.getElementById('btnContactSupport').addEventListener('click', () => {
    window.open('https://line.me/ti/g2/your-openchat-url', '_blank');
    closeModal();
  });
  
  // Animate in
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
  });
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    info: 'bg-purple-700 text-white'
  };

  toast.className = `px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 pointer-events-auto transition transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i><span>${msg}</span>`;

  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
