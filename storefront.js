const ORDER_CATEGORY_LABELS = {
  ORIGINAL: 'ORIGINAL',
  FOOTBALL: 'FOOTBALL',
  BASKETBALL: 'BASKETBALL',
  AUHISTORY: 'AUHISTORY'
};
const CUSTOMER_SESSION_KEY = 'AUTHONG_PREORDER_SESSION_V1';

document.addEventListener('DOMContentLoaded', () => {
  const identityPanel = document.getElementById('identityPanel');
  const siteHeader = document.getElementById('siteHeader');
  const identityFields = document.getElementById('identityFields');
  const whoCard = identityFields.closest('.who-card');
  const studentFields = document.getElementById('studentIdentityFields');
  const generalFields = document.getElementById('generalIdentityFields');
  const googleLoginPanel = document.getElementById('googleLoginPanel');
  const googleLoginStatus = document.getElementById('googleLoginStatus');
  const googleSignInButton = document.getElementById('googleSignInButton');
  const deliveryGroup = document.getElementById('deliveryChoiceGroup');
  const deliveryDisclaimer = document.getElementById('deliveryDisclaimer');
  const collectionPanel = document.getElementById('collectionPanel');
  const customerOrdersPanel = document.getElementById('customerOrdersPanel');
  const customerOrderList = document.getElementById('customerOrderList');
  const ordersCustomerSummary = document.getElementById('ordersCustomerSummary');
  const customerOrderCount = document.getElementById('customerOrderCount');
  const cartButton = document.getElementById('btnOpenCustomerOrders');
  const orderStudio = document.getElementById('orderStudio');
  const deliveryMethod = document.getElementById('deliveryMethod');
  const shippingFields = document.getElementById('shippingFields');
  const ordersDeliveryEditor = document.getElementById('ordersDeliveryEditor');
  const ordersDeliveryFields = document.getElementById('ordersDeliveryFields');
  const ordersDeliveryMethod = document.getElementById('ordersDeliveryMethod');
  const ordersShippingFields = document.getElementById('ordersShippingFields');
  const ordersShippingAddress = document.getElementById('ordersShippingAddress');
  const ordersShippingPostcode = document.getElementById('ordersShippingPostcode');
  const customerCards = [...document.querySelectorAll('[data-customer-type]')];
  let selectedType = '';
  let googleInitialized = false;
  let customerOrdersCacheKey = '';
  let customerOrdersCacheLoaded = false;
  let customerOrdersPending = null;
  let customerOrdersPendingKey = '';
  let customerOrdersRequestGeneration = 0;

  function showPage(page) {
    identityPanel.classList.toggle('hidden', page !== 'identity');
    collectionPanel.classList.toggle('hidden', page !== 'home');
    customerOrdersPanel.classList.toggle('hidden', page !== 'orders');
    orderStudio.classList.toggle('hidden', page !== 'order');
    siteHeader.classList.toggle('hidden', page === 'identity');
    siteHeader.classList.toggle('is-order-view', page === 'order');
    document.body.dataset.storefrontPage = page;
    document.dispatchEvent(new Event('storefront-page-change'));
  }

  function isLocalPreview() {
    return ['localhost', '127.0.0.1'].includes(location.hostname)
      && /\/gas\/?$/.test(AppState.gasUrl || '');
  }

  function persistCustomerSession(page = 'home') {
    try {
      if (!AppState.customer) {
        sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
        return;
      }
      const customer = { ...AppState.customer };
      // Store only the opaque, short-lived Apps Script session token, never Google's ID token or email.
      if (customer.type === 'general' && customer.googleCredential !== 'local-preview-session'
        && !/^[a-f0-9]{64}$/i.test(String(customer.googleCredential || ''))) {
        customer.googleCredential = '';
      }
      sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({
        customer,
        page: page === 'orders' ? 'orders' : 'home'
      }));
    } catch (_) {
      // The current page continues to work if browser storage is unavailable.
    }
  }

  function readCustomerSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CUSTOMER_SESSION_KEY) || 'null');
      if (!saved?.customer || !['student', 'general'].includes(saved.customer.type)) return null;
      const customer = saved.customer;
      if (customer.type === 'general' && customer.googleCredential !== 'local-preview-session'
        && (!/^[a-f0-9]{64}$/i.test(String(customer.googleCredential || ''))
          || Number(customer.googleSessionExpiresAt || 0) <= Date.now())) {
        customer.googleCredential = '';
      }
      return { customer, page: saved.page === 'orders' ? 'orders' : 'home' };
    } catch (_) {
      return null;
    }
  }

  function updateHeaderCustomerChip(customer) {
    const summary = customer.type === 'student'
      ? `${customer.studentNumber}  ${String(customer.room || '').replace(/^ม\./, '')}`
      : customer.fullName;
    document.getElementById('collectionCustomerSummary').textContent = summary;
    const chip = document.getElementById('headerCustomerChip');
    chip.textContent = summary;
    chip.classList.toggle('is-student-chip', customer.type === 'student');
    chip.classList.remove('hidden');
  }

  function setOrderCount(count) {
    customerOrderCount.textContent = String(count);
    cartButton.setAttribute('aria-label', `รายการออเดอร์ ${count} รายการ`);
  }

  function getCustomerOrdersCacheKey(customer = AppState.customer) {
    if (!customer) return '';
    return customer.type === 'general'
      ? `general|${customer.customerId || String(customer.phone || '').replace(/[\s()-]/g, '')}`
      : `student|${String(customer.studentNumber || '').replace(/\s+/g, '')}|${String(customer.room || '').replace(/\s+/g, '')}`;
  }

  function customerOrdersCacheIsReady(customer = AppState.customer) {
    return customerOrdersCacheLoaded && customerOrdersCacheKey === getCustomerOrdersCacheKey(customer);
  }

  function makeCustomerSearchUrl(action, customer, category = '') {
    const url = new URL(AppState.gasUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('customerType', customer.type);
    if (category) url.searchParams.set('category', category);
    if (customer.type === 'general') {
      url.searchParams.set('customerId', customer.customerId || '');
      url.searchParams.set('phone', customer.phone || '');
    } else {
      url.searchParams.set('studentNumber', customer.studentNumber || '');
      url.searchParams.set('room', customer.room || '');
    }
    url.searchParams.set('_', Date.now().toString());
    return url;
  }

  function renderOrdersCustomerSummary() {
    const customer = AppState.customer;
    if (!customer) {
      ordersCustomerSummary.classList.add('hidden');
      return;
    }

    const type = document.getElementById('ordersCustomerType');
    const primary = document.getElementById('ordersCustomerPrimary');
    const secondary = document.getElementById('ordersCustomerSecondary');
    if (customer.type === 'student') {
      type.textContent = 'ข้อมูลนักเรียน';
      primary.textContent = `เลขที่ ${customer.studentNumber || '—'}`;
      secondary.textContent = `ห้อง ${customer.room || '—'}`;
    } else {
      type.textContent = 'ข้อมูลบุคคลทั่วไป';
      primary.textContent = customer.fullName || '—';
      const delivery = customer.deliveryMethod === 'shipping'
        ? `จัดส่ง ${customer.address || ''} ${customer.postalCode || ''}`.trim()
        : 'รับที่โรงเรียน';
      secondary.textContent = [customer.phone ? `โทร ${customer.phone}` : '', delivery]
        .filter(Boolean).join(' · ');
    }
    ordersDeliveryEditor.classList.toggle('hidden', customer.type !== 'general');
    ordersCustomerSummary.classList.remove('hidden');
  }

  function syncOrdersShippingVisibility() {
    ordersShippingFields.classList.toggle('hidden', ordersDeliveryMethod.value !== 'shipping');
  }

  async function requestCustomerProfileUpdate(customer) {
    const nonce = crypto.randomUUID().replace(/-/g, '');
    await fetch(AppState.gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        action: 'updateCustomer', nonce, googleCredential: customer.googleCredential,
        customerId: customer.customerId, customer
      })
    });

    for (let attempt = 0; attempt < 12; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 350));
      const url = new URL(AppState.gasUrl);
      url.searchParams.set('action', 'consumeCustomerUpdate');
      url.searchParams.set('nonce', nonce);
      url.searchParams.set('_', Date.now().toString());
      const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      const result = await response.json();
      if (result.status === 'success') return result;
      if (result.status === 'error') throw new Error(result.message || 'บันทึกข้อมูลจัดส่งไม่สำเร็จ');
    }
    throw new Error('บันทึกข้อมูลจัดส่งไม่สำเร็จ กรุณาลองอีกครั้ง');
  }

  function statusClass(status) {
    const value = String(status || 'รอชำระเงิน');
    if (/ผ่าน|ชำระเงินแล้ว|ชำระเงินสำเร็จ|พร้อมรับ|จัดส่งแล้ว|เสร็จสิ้น/.test(value)) return 'paid';
    if (/ตรวจสอบ|รอตรวจ/.test(value)) return 'review';
    return 'waiting';
  }

  function renderCustomerOrders() {
    customerOrderList.replaceChildren();
    const orders = AppState.customerOrders || [];
    if (!orders.length) {
      const empty = document.createElement('div');
      empty.className = 'customer-orders-empty';
      empty.innerHTML = '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i><strong>ยังไม่มีออเดอร์</strong><span>เลือกคอลเลกชันเพื่อเริ่มสั่งเสื้อ</span>';
      customerOrderList.append(empty);
      return;
    }

    orders.forEach(order => {
      const card = document.createElement('article');
      card.className = 'customer-order-card';
      const shirt = document.createElement('div');
      shirt.className = 'customer-order-shirt';
      const image = document.createElement('img');
      image.src = './jersey_authong_back.webp';
      image.alt = '';
      image.loading = 'lazy';
      const shirtName = document.createElement('span');
      shirtName.textContent = String(order.name || 'NAME');
      const shirtNumber = document.createElement('b');
      shirtNumber.textContent = String(order.number || '08').padStart(2, '0');
      shirt.append(image, shirtName, shirtNumber);

      const content = document.createElement('div');
      content.className = 'customer-order-content';
      const title = document.createElement('h3');
      title.textContent = ORDER_CATEGORY_LABELS[order.category] || order.category || 'ORDER';
      const detail = document.createElement('div');
      detail.className = 'customer-order-details';
      [["NAME", order.name || '—'], ["NUMBER", order.number || '—'], ["Size", order.size || '—']].forEach(([label, value]) => {
        const row = document.createElement('p');
        const key = document.createElement('span');
        key.textContent = label;
        const text = document.createElement('strong');
        text.textContent = String(value);
        row.append(key, text);
        detail.append(row);
      });
      const actions = document.createElement('div');
      actions.className = 'customer-order-actions';
      const badge = document.createElement('span');
      const paymentStatus = order.paymentStatus || order.status || 'รอชำระเงิน';
      badge.className = `customer-order-status ${statusClass(paymentStatus)}`;
      badge.textContent = paymentStatus;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'customer-order-edit';
      edit.textContent = 'แก้ไขข้อมูล';
      edit.disabled = order.category !== 'ORIGINAL' || ['ผ่าน', 'ชำระเงินแล้ว', 'ชำระเงินสำเร็จ'].includes(paymentStatus);
      if (order.category !== 'ORIGINAL') edit.title = 'คอลเลกชันนี้ยังไม่เปิดให้แก้ไขบนเว็บไซต์';
      edit.addEventListener('click', () => openCollectionOrder(order.category));
      actions.append(badge, edit);
      content.append(title, detail, actions);
      card.append(shirt, content);
      customerOrderList.append(card);
    });
  }

  async function refreshCustomerOrders(force = false) {
    if (!AppState.customer || !AppState.gasUrl) return [];
    const customer = AppState.customer;
    const cacheKey = getCustomerOrdersCacheKey(customer);
    if (!force && customerOrdersCacheIsReady(customer)) return AppState.customerOrders;
    if (!force && customerOrdersPending && customerOrdersPendingKey === cacheKey) return customerOrdersPending;

    const requestGeneration = ++customerOrdersRequestGeneration;
    customerOrdersCacheLoaded = false;
    const request = (async () => {
      let roomsSupported = false;
      const allUrl = makeCustomerSearchUrl('searchAll', customer);
      const allResponse = await fetch(allUrl, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      const allResult = await allResponse.json();
      if (allResult.status !== 'success') throw new Error(allResult.message || 'โหลดรายการออเดอร์ไม่สำเร็จ');

      let results;
      if (Array.isArray(allResult.orders)) {
        roomsSupported = allResult.allRooms === true;
        results = allResult.orders.map(order => ({ ...order, category: order.category }));
      } else {
        // Older Apps Script deployments do not expose searchAll; warm the four category slots once.
        results = await Promise.all(Object.keys(ORDER_CATEGORY_LABELS).map(async category => {
          const url = makeCustomerSearchUrl('search', customer, category);
          const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
          const result = await response.json();
          if (result.status !== 'success') throw new Error(result.message || 'โหลดรายการออเดอร์ไม่สำเร็จ');
          roomsSupported = roomsSupported || result.allRooms === true;
          return result.found && result.data ? { ...result.data, category } : null;
        }));
      }

      if (requestGeneration !== customerOrdersRequestGeneration || getCustomerOrdersCacheKey() !== cacheKey) {
        return AppState.customerOrders || [];
      }
      AppState.customerOrders = results.filter(Boolean);
      AppState.allRoomsSupported = roomsSupported;
      customerOrdersCacheKey = cacheKey;
      customerOrdersCacheLoaded = true;
      setOrderCount(AppState.customerOrders.length);
      document.querySelectorAll('[data-product-category]').forEach(card => {
        if (card.disabled) return;
        const existing = AppState.customerOrders.some(order => order.category === card.dataset.productCategory);
        const action = card.querySelector('[data-collection-action]');
        if (action) action.textContent = existing ? 'CHECKORDER' : 'PREORDER';
        card.classList.toggle('has-existing-order', existing);
      });
      renderCustomerOrders();
      return AppState.customerOrders;
    })();

    customerOrdersPending = request;
    customerOrdersPendingKey = cacheKey;
    try {
      return await request;
    } finally {
      if (customerOrdersPending === request) {
        customerOrdersPending = null;
        customerOrdersPendingKey = '';
      }
    }
  }

  function openCustomerOrders() {
    persistCustomerSession('orders');
    renderOrdersCustomerSummary();
    showPage('orders');
    if (customerOrdersCacheIsReady()) {
      renderCustomerOrders();
    } else {
      customerOrderList.innerHTML = '<div class="customer-orders-loading">กำลังโหลดรายการ…</div>';
      refreshCustomerOrders().catch(error => {
        customerOrderList.innerHTML = '';
        const message = document.createElement('p');
        message.className = 'customer-orders-error';
        message.textContent = error.message || 'โหลดรายการออเดอร์ไม่สำเร็จ';
        customerOrderList.append(message);
      });
    }
    customerOrdersPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setDeliveryVisibility() {
    const available = selectedType === 'general' && Boolean(AppState.customer?.googleCredential);
    deliveryGroup.classList.toggle('hidden', !available);
    deliveryDisclaimer.classList.toggle('hidden', !available);
    shippingFields.classList.toggle('hidden', !available || deliveryMethod.value !== 'shipping');
  }

  async function requestGoogleProfile(credential) {
    if (!AppState.gasUrl) throw new Error('ตั้งค่า Apps Script URL ก่อนลงชื่อเข้าใช้');
    const nonce = crypto.randomUUID().replace(/-/g, '');
    await fetch(AppState.gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action: 'googleProfile', credential, nonce })
    });

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 350));
      const url = new URL(AppState.gasUrl);
      url.searchParams.set('action', 'consumeGoogleProfile');
      url.searchParams.set('nonce', nonce);
      url.searchParams.set('_', Date.now().toString());
      const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      const result = await response.json();
      if (result.status === 'success' && result.profile) return result.profile;
      if (result.status === 'error') throw new Error(result.message || 'ตรวจสอบบัญชี Google ไม่สำเร็จ');
    }
    throw new Error('รอข้อมูลบัญชีนานเกินไป ลองลงชื่อเข้าใช้อีกครั้ง');
  }

  async function handleGoogleCredential(response) {
    if (!response || !response.credential) return;
    googleLoginStatus.textContent = 'กำลังตรวจสอบบัญชี Google…';
    googleSignInButton.classList.add('is-loading');
    try {
      if (isLocalPreview()) {
        // Exercise Google Identity on localhost without sending or retaining its ID token.
        AppState.customer = {
          type: 'general', customerId: '', googleCredential: 'local-preview-session',
          fullName: '', phone: '', deliveryMethod: 'school_pickup', address: '', postalCode: ''
        };
        generalFields.classList.remove('hidden');
        setDeliveryVisibility();
        googleLoginStatus.textContent = '';
        return;
      }
      const profile = await requestGoogleProfile(response.credential);
      AppState.customer = {
        type: 'general',
        customerId: String(profile.customerId || ''),
        googleCredential: String(profile.sessionToken || response.credential),
        googleSessionExpiresAt: Number(profile.sessionExpiresAt || 0),
        fullName: String(profile.fullName || profile.googleName || ''),
        phone: String(profile.phone || ''),
        deliveryMethod: profile.deliveryMethod === 'shipping' ? 'shipping' : 'school_pickup',
        address: String(profile.address || ''),
        postalCode: String(profile.postalCode || '')
      };
      document.getElementById('identityCustomerName').value = AppState.customer.fullName;
      document.getElementById('identityCustomerPhone').value = AppState.customer.phone;
      document.getElementById('shippingAddress').value = AppState.customer.address;
      document.getElementById('shippingPostcode').value = AppState.customer.postalCode;
      deliveryMethod.value = AppState.customer.deliveryMethod;
      generalFields.classList.remove('hidden');
      setDeliveryVisibility();
      googleLoginStatus.textContent = profile.found
        ? 'ลงชื่อเข้าใช้แล้ว · โหลดข้อมูลเดิมสำเร็จ'
        : 'ลงชื่อเข้าใช้แล้ว · กรอกเบอร์โทรและเลือกรับเสื้อ';
    } catch (error) {
      googleLoginStatus.textContent = error.message || 'ลงชื่อเข้าใช้ไม่สำเร็จ';
      showToast(googleLoginStatus.textContent, 'error');
    } finally {
      googleSignInButton.classList.remove('is-loading');
    }
  }

  function renderGoogleSignIn() {
    if (selectedType !== 'general') return;
    if (!AppState.googleClientId) {
      googleLoginStatus.textContent = 'ยังไม่ได้ตั้งค่า Google Client ID · ดูวิธีใน README';
      return;
    }
    if (!AppState.gasUrl && !isLocalPreview()) {
      googleLoginStatus.textContent = '';
      return;
    }
    if (!window.google?.accounts?.id) {
      googleLoginStatus.textContent = '';
      return;
    }
    if (!googleInitialized) {
      window.google.accounts.id.initialize({
        client_id: AppState.googleClientId,
        callback: handleGoogleCredential,
        auto_select: true,
        cancel_on_tap_outside: false,
        context: 'signin'
      });
      window.google.accounts.id.renderButton(googleSignInButton, {
        type: 'standard', theme: 'outline', size: 'large', text: 'signin_with',
        shape: 'pill', width: 300, logo_alignment: 'left'
      });
      googleInitialized = true;
    }
    googleLoginStatus.textContent = '';
  }

  window.addEventListener('authong-gsi-ready', renderGoogleSignIn);
  if (window.google?.accounts?.id) renderGoogleSignIn();

  const selectCustomerType = (type) => {
    selectedType = type;
    AppState.customer = null;
    customerCards.forEach(card => {
      const active = card.dataset.customerType === type;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', String(active));
    });
    identityFields.classList.remove('hidden');
    whoCard.classList.add('has-identity-fields');
    studentFields.classList.toggle('hidden', type !== 'student');
    googleLoginPanel.classList.toggle('hidden', type !== 'general');
    generalFields.classList.add('hidden');
    deliveryGroup.classList.add('hidden');
    shippingFields.classList.add('hidden');
    if (type === 'general') renderGoogleSignIn();
  };

  function showIdentityForGoogleReauthentication(customer) {
    selectedType = 'general';
    AppState.customer = customer;
    customerCards.forEach(card => {
      const active = card.dataset.customerType === 'general';
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', String(active));
    });
    identityFields.classList.remove('hidden');
    whoCard.classList.add('has-identity-fields');
    studentFields.classList.add('hidden');
    googleLoginPanel.classList.remove('hidden');
    generalFields.classList.remove('hidden');
    document.getElementById('identityCustomerName').value = customer.fullName || '';
    document.getElementById('identityCustomerPhone').value = customer.phone || '';
    document.getElementById('shippingAddress').value = customer.address || '';
    document.getElementById('shippingPostcode').value = customer.postalCode || '';
    deliveryMethod.value = customer.deliveryMethod || 'school_pickup';
    setDeliveryVisibility();
    showPage('identity');
    renderGoogleSignIn();
    identityPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function restoreCustomerSession() {
    const saved = readCustomerSession();
    if (!saved) return;
    const customer = saved.customer;
    AppState.customer = customer;
    selectedType = customer.type;
    customerCards.forEach(card => {
      const active = card.dataset.customerType === customer.type;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', String(active));
    });
    if (customer.type === 'student') {
      document.getElementById('identityStudentNumber').value = customer.studentNumber || '';
      document.getElementById('identityRoom').value = customer.room || '';
    } else {
      document.getElementById('identityCustomerName').value = customer.fullName || '';
      document.getElementById('identityCustomerPhone').value = customer.phone || '';
      document.getElementById('shippingAddress').value = customer.address || '';
      document.getElementById('shippingPostcode').value = customer.postalCode || '';
      deliveryMethod.value = customer.deliveryMethod || 'school_pickup';
    }
    updateHeaderCustomerChip(customer);
    renderOrdersCustomerSummary();
    if (saved.page === 'orders') {
      openCustomerOrders();
      return;
    }
    showPage('home');
    refreshCustomerOrders().catch(() => {});
  }

  customerCards.forEach(card => card.addEventListener('click', () => selectCustomerType(card.dataset.customerType)));
  deliveryMethod.addEventListener('change', setDeliveryVisibility);

  document.getElementById('btnContinueIdentity').addEventListener('click', async () => {
    if (!selectedType) {
      showToast('เลือกก่อนว่าเป็นนักเรียนหรือบุคคลทั่วไป', 'error');
      return;
    }
    if (selectedType === 'general' && !AppState.customer?.googleCredential) {
      showToast('กรุณาลงชื่อเข้าใช้ Google ก่อน', 'error');
      return;
    }

    const phone = selectedType === 'general'
      ? document.getElementById('identityCustomerPhone').value.trim()
      : '';
    const fullName = selectedType === 'general'
      ? document.getElementById('identityCustomerName').value.trim()
      : '';
    const customer = {
      ...(AppState.customer || {}),
      type: selectedType,
      studentNumber: selectedType === 'student' ? document.getElementById('identityStudentNumber').value : '',
      room: selectedType === 'student' ? document.getElementById('identityRoom').value : '',
      fullName,
      phone,
      deliveryMethod: selectedType === 'general' ? deliveryMethod.value : 'school_pickup',
      recipientName: '',
      address: '',
      postalCode: ''
    };

    if (selectedType === 'student' && (!customer.studentNumber || !customer.room)) {
      showToast('กรุณาเลือกเลขที่และห้องเรียน', 'error');
      return;
    }
    if (selectedType === 'general' && (!fullName || !/^[0-9+()\-\s]{8,20}$/.test(phone))) {
      showToast('กรุณากรอกชื่อและเบอร์โทรศัพท์ให้ถูกต้อง', 'error');
      return;
    }

    if (customer.deliveryMethod === 'shipping') {
      customer.address = document.getElementById('shippingAddress').value.trim();
      customer.postalCode = document.getElementById('shippingPostcode').value.trim();
      if (!customer.address || !/^\d{5}$/.test(customer.postalCode)) {
        showToast('จัดส่งต้องกรอกที่อยู่และรหัสไปรษณีย์ 5 หลัก', 'error');
        return;
      }
    }

    AppState.customer = customer;
    AppState.category = '';
    updateHeaderCustomerChip(customer);
    renderOrdersCustomerSummary();
    persistCustomerSession('home');
    showPage('home');
    refreshCustomerOrders().catch(error => showToast(error.message || 'โหลดรายการออเดอร์ไม่สำเร็จ', 'error'));
    collectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('btnLogoutCustomer').addEventListener('click', () => {
    try { sessionStorage.removeItem(CUSTOMER_SESSION_KEY); } catch (_) {}
    AppState.customer = null;
    AppState.customerOrders = [];
    customerOrdersRequestGeneration++;
    customerOrdersCacheLoaded = false;
    customerOrdersCacheKey = '';
    AppState.pendingOrderId = '';
    AppState.category = '';
    selectedType = '';
    customerCards.forEach(card => {
      card.classList.remove('active');
      card.setAttribute('aria-pressed', 'false');
    });
    identityFields.classList.add('hidden');
    whoCard.classList.remove('has-identity-fields');
    studentFields.classList.add('hidden');
    generalFields.classList.add('hidden');
    googleLoginPanel.classList.add('hidden');
    googleLoginStatus.textContent = '';
    document.getElementById('identityStudentNumber').value = '';
    document.getElementById('identityRoom').value = '';
    document.getElementById('identityCustomerName').value = '';
    document.getElementById('identityCustomerPhone').value = '';
    document.getElementById('shippingAddress').value = '';
    document.getElementById('shippingPostcode').value = '';
    deliveryMethod.value = 'school_pickup';
    deliveryGroup.classList.add('hidden');
    shippingFields.classList.add('hidden');
    deliveryDisclaimer.classList.add('hidden');
    showPage('identity');
    document.getElementById('headerCustomerChip').classList.add('hidden');
    document.getElementById('headerCustomerChip').classList.remove('is-student-chip');
    setOrderCount(0);
    renderCustomerOrders();
    identityPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('btnBackToHome').addEventListener('click', () => {
    showPage('home');
    persistCustomerSession('home');
    refreshCustomerOrders().catch(() => {});
    collectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  cartButton.addEventListener('click', openCustomerOrders);
  document.getElementById('btnEditDelivery').addEventListener('click', () => {
    const customer = AppState.customer;
    if (!customer || customer.type !== 'general') return;
    ordersDeliveryMethod.value = customer.deliveryMethod || 'school_pickup';
    ordersShippingAddress.value = customer.address || '';
    ordersShippingPostcode.value = customer.postalCode || '';
    syncOrdersShippingVisibility();
    ordersDeliveryFields.classList.remove('hidden');
  });
  ordersDeliveryMethod.addEventListener('change', syncOrdersShippingVisibility);
  document.getElementById('btnCancelDeliveryEdit').addEventListener('click', () => {
    ordersDeliveryFields.classList.add('hidden');
  });
  document.getElementById('btnSaveDeliveryEdit').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const customer = AppState.customer;
    if (!customer || customer.type !== 'general') return;
    const delivery = ordersDeliveryMethod.value;
    const address = delivery === 'shipping' ? ordersShippingAddress.value.trim() : '';
    const postalCode = delivery === 'shipping' ? ordersShippingPostcode.value.trim() : '';
    if (delivery === 'shipping' && (!address || !/^\d{5}$/.test(postalCode))) {
      showToast('กรุณากรอกที่อยู่และรหัสไปรษณีย์ 5 หลัก', 'error');
      return;
    }
    if (!customer.googleCredential && !isLocalPreview()) {
      showIdentityForGoogleReauthentication(customer);
      showToast('ลงชื่อเข้าใช้ Google อีกครั้งก่อนบันทึกข้อมูลจัดส่ง', 'error');
      return;
    }

    const updatedCustomer = {
      ...customer,
      deliveryMethod: delivery,
      address,
      postalCode
    };
    button.disabled = true;
    try {
      if (!isLocalPreview()) await requestCustomerProfileUpdate(updatedCustomer);
      AppState.customer = updatedCustomer;
      persistCustomerSession('orders');
      renderOrdersCustomerSummary();
      ordersDeliveryFields.classList.add('hidden');
      showToast(isLocalPreview() ? 'อัปเดตข้อมูลจัดส่งในโหมดทดสอบแล้ว' : 'บันทึกข้อมูลจัดส่งแล้ว', 'success');
    } catch (error) {
      showToast(error.message || 'บันทึกข้อมูลจัดส่งไม่สำเร็จ', 'error');
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener('authong-order-saved', () => {
    refreshCustomerOrders(true).catch(() => {});
    persistCustomerSession('home');
  });

  document.getElementById('btnBackToCollection').addEventListener('click', () => {
    hideFormContent();
    resetToNewMode();
    showPage('home');
    persistCustomerSession('home');
    refreshCustomerOrders().catch(() => {});
    collectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  async function openCollectionOrder(category) {
      const card = document.querySelector(`[data-product-category="${category}"]`);
      if (!card || card.disabled) {
        showToast('คอลเลกชันนี้ยังไม่เปิดให้สั่งบนเว็บไซต์', 'error');
        return;
      }
      if (!ORDER_CATEGORY_LABELS[category] || !AppState.customer) {
        showToast('กรุณากรอกข้อมูลผู้สั่งจองก่อน', 'error');
        return;
      }
      if (AppState.customer.type === 'general' && !AppState.customer.googleCredential && !isLocalPreview()) {
        showIdentityForGoogleReauthentication(AppState.customer);
        showToast('ลงชื่อเข้าใช้ Google อีกครั้งเพื่อสั่งจอง', 'error');
        return;
      }
      AppState.category = category;
      AppState.pendingOrderId = '';
      AppState.quantity = 1;
      persistCustomerSession('home');
      const hasArtwork = true;
      document.getElementById('jerseyCardWrapper').classList.toggle('hidden', !hasArtwork);
      const artworkPlaceholder = document.getElementById('collectionArtworkPlaceholder');
      artworkPlaceholder.classList.toggle('hidden', hasArtwork);
      document.getElementById('collectionArtworkTitle').textContent = category;
      document.querySelectorAll('[data-product-category]').forEach(item => item.classList.toggle('active', item === card));
      if (DOM.currentCollectionLabel) DOM.currentCollectionLabel.textContent = ORDER_CATEGORY_LABELS[category];
      if (AppState.customer.type === 'student') {
        setStudentNumberSelection(AppState.customer.studentNumber);
        DOM.inputRoom.value = AppState.customer.room;
      }

      showPage('order');
      resetToNewMode();
      try { await refreshCustomerOrders(); } catch (_) { /* fall back to the single lookup below */ }
      const cachedOrder = customerOrdersCacheIsReady()
        ? AppState.customerOrders.find(order => order.category === category) || null
        : undefined;
      await lookupStudentAndShowForm(AppState.customer.studentNumber || '', AppState.customer.room || '', '', cachedOrder);
      orderStudio.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('[data-product-category]').forEach(card => {
    card.addEventListener('click', () => openCollectionOrder(card.dataset.productCategory));
  });

  restoreCustomerSession();
});
