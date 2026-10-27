const state = { products: [], paymentCards: [], cart: new Map(), csrfToken: null, user: null };
const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");
let toastTimer;

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": state.csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir esta ação.");
  return data;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3300);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function renderProducts() {
  const query = $("#search").value.trim().toLocaleLowerCase("pt-BR");
  const category = $("#category-filter").value;
  const products = state.products.filter((product) =>
    (!category || product.category === category) &&
    (!query || `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase("pt-BR").includes(query)));
  $("#product-grid").innerHTML = products.length ? products.map((product) => `
    <article class="product-card">
      <div class="product-image">
        <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">
        <span class="product-badge">${product.stock ? "ACHADINHO" : "ESGOTADO"}</span>
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-bottom">
          <span class="product-price">${money(product.price_cents)}<small>pagamento demonstrativo</small></span>
          <button class="add-button" type="button" data-add="${product.id}" aria-label="Adicionar ${escapeHtml(product.name)} ao carrinho" ${product.stock ? "" : "disabled"}>+</button>
        </div>
      </div>
    </article>`).join("") : '<div class="empty-state">Nenhum produto encontrado. Tente outra busca ✧</div>';
}

function updateCartCount() {
  $("#cart-count").textContent = [...state.cart.values()].reduce((total, item) => total + item.quantity, 0);
}

function renderCart() {
  const cartContent = $("#cart-content");
  const items = [...state.cart.values()];
  if (!items.length) {
    cartContent.innerHTML = '<p class="muted-message">Seu carrinho está esperando um achadinho ✧</p>';
    return;
  }
  const total = items.reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0);
  cartContent.innerHTML = `${items.map(({ product, quantity }) => `
    <div class="cart-row">
      <div><b>${escapeHtml(product.name)}</b><small>${money(product.price_cents)} cada</small></div>
      <div class="cart-controls">
        <button type="button" data-quantity="${product.id}" data-delta="-1" aria-label="Diminuir quantidade">−</button>
        <span>${quantity}</span>
        <button type="button" data-quantity="${product.id}" data-delta="1" aria-label="Aumentar quantidade" ${quantity >= Math.min(product.stock, 10) ? "disabled" : ""}>+</button>
      </div>
    </div>`).join("")}
    <div class="cart-total"><span>Total</span><span>${money(total)}</span></div>
    <button id="continue-checkout" class="primary-button wide-button" type="button">Continuar para pagamento →</button>`;
}

function renderPaymentCards() {
  $("#payment-card-list").innerHTML = state.paymentCards.length ? state.paymentCards.map((card) => `
    <article class="payment-card-item">
      <span class="payment-card-mark" aria-hidden="true">▣</span>
      <div class="payment-card-details">
        <b>${escapeHtml(card.brand)} ···· ${escapeHtml(card.last4)}</b>
        <small>${escapeHtml(card.cardholder)}<br>Validade ${String(card.expiry_month).padStart(2, "0")}/${escapeHtml(card.expiry_year)}</small>
      </div>
      <button class="card-remove" type="button" data-remove-card="${escapeHtml(card.id)}" aria-label="Remover cartão ${escapeHtml(card.brand)} final ${escapeHtml(card.last4)}">×</button>
    </article>`).join("") : '<p class="empty-cards">Nenhum cartão cadastrado. Adicione um cartão fictício abaixo para fazer uma compra simulada.</p>';

  const cardSelect = $("#checkout-card");
  cardSelect.innerHTML = '<option value="">Selecione um cartão cadastrado</option>' + state.paymentCards.map((card) =>
    `<option value="${escapeHtml(card.id)}">${escapeHtml(card.brand)} ···· ${escapeHtml(card.last4)} · ${String(card.expiry_month).padStart(2, "0")}/${escapeHtml(card.expiry_year)}</option>`,
  ).join("");
  cardSelect.value = state.paymentCards[0]?.id || "";
  $("#checkout-card-hint").textContent = state.paymentCards.length
    ? "Pagamento acadêmico simulado. Nenhuma transação real será realizada."
    : "Cadastre um cartão fictício para habilitar a compra.";
  $("#checkout-form [type=submit]").disabled = !state.paymentCards.length;
}

async function loadPaymentCards() {
  state.paymentCards = await request("/api/payment-cards");
  renderPaymentCards();
}

async function openPaymentCards() {
  if (!state.user) {
    showAuth();
    notify("Entre ou crie sua conta para cadastrar cartões.");
    return;
  }
  try {
    await loadPaymentCards();
    openDialog("cards-dialog");
  } catch (error) {
    notify(error.message);
  }
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
}

function showAuth(mode = "login") {
  $("#auth-dialog").showModal();
  setAuthTab(mode);
}

function updateAuthButton() {
  $("#login-button").textContent = state.user ? "Sair" : "Entrar";
  $("#login-button").setAttribute("aria-label", state.user ? `Sair da conta de ${state.user.name}` : "Entrar");
}

function setAuthTab(mode) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === mode);
  });
  $("#login-form").classList.toggle("hidden", mode !== "login");
  $("#register-form").classList.toggle("hidden", mode !== "register");
}

document.addEventListener("click", async (event) => {
  const close = event.target.closest("[data-close]");
  if (close) document.getElementById(close.dataset.close).close();

  const authTab = event.target.closest("[data-auth-tab]");
  if (authTab) setAuthTab(authTab.dataset.authTab);

  const add = event.target.closest("[data-add]");
  if (add) {
    const product = state.products.find((item) => item.id === Number(add.dataset.add));
    if (!product) return;
    const current = state.cart.get(product.id)?.quantity || 0;
    if (current >= Math.min(product.stock, 10)) return notify("Você chegou ao limite disponível deste produto.");
    state.cart.set(product.id, { product, quantity: current + 1 });
    updateCartCount();
    notify(`${product.name} adicionado ao carrinho ✧`);
  }

  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    const id = Number(quantityButton.dataset.quantity);
    const item = state.cart.get(id);
    if (item) {
      item.quantity += Number(quantityButton.dataset.delta);
      if (item.quantity <= 0) state.cart.delete(id);
      updateCartCount();
      renderCart();
    }
  }

  if (event.target.closest("#continue-checkout")) {
    if (!state.user) {
      $("#cart-dialog").close();
      showAuth();
      return notify("Entre ou crie sua conta para finalizar o pedido.");
    }
    const items = [...state.cart.values()];
    const total = items.reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0);
    $("#checkout-summary").innerHTML = `<div class="cart-total"><span>${items.length} ${items.length === 1 ? "produto" : "produtos"} · entrega simulada</span><span>${money(total)}</span></div>`;
    try {
      await loadPaymentCards();
    } catch (error) {
      return notify(error.message);
    }
    $("#cart-dialog").close();
    $("#checkout-form").reset();
    renderPaymentCards();
    openDialog("checkout-dialog");
  }

  const removeCard = event.target.closest("[data-remove-card]");
  if (removeCard) {
    try {
      await request(`/api/payment-cards/${encodeURIComponent(removeCard.dataset.removeCard)}`, { method: "DELETE" });
      await loadPaymentCards();
      notify("Cartão removido da sua conta.");
    } catch (error) {
      notify(error.message);
    }
  }
});

$("#cart-button").addEventListener("click", () => {
  renderCart();
  openDialog("cart-dialog");
});
$("#cards-button").addEventListener("click", openPaymentCards);
$("#manage-cards-from-checkout").addEventListener("click", async () => {
  $("#checkout-dialog").close();
  await openPaymentCards();
});
$("#login-button").addEventListener("click", async () => {
  if (!state.user) return showAuth();
  try {
    await request("/api/logout", { method: "POST" });
    state.user = null;
    state.paymentCards = [];
    state.csrfToken = (await request("/api/csrf")).csrfToken;
    updateAuthButton();
    notify("Você saiu da sua conta com segurança.");
  } catch (error) {
    notify(error.message);
  }
});
$("#orders-button").addEventListener("click", async () => {
  if (!state.user) return showAuth();
  try {
    const orders = await request("/api/orders");
    $("#orders-content").innerHTML = orders.length ? orders.map((order) => `
      <article class="order-card">
        <div><b>Pedido #${order.id}</b><span class="order-status">${{ processing: "Em preparação", shipped: "A caminho", delivered: "Entregue" }[order.status] || "Em processamento"}</span></div>
        <small>${new Date(order.created_at).toLocaleDateString("pt-BR")} · ${order.items.map((item) => `${escapeHtml(item.name)} × ${item.quantity}`).join(", ")}</small>
        <small>${escapeHtml(order.payment_brand)} final ${escapeHtml(order.payment_last4)} · ${money(order.total_cents)}</small>
      </article>`).join("") : '<p class="muted-message">Você ainda não tem pedidos. Seus achadinhos estão esperando por você ✧</p>';
    openDialog("orders-dialog");
  } catch (error) {
    notify(error.message);
  }
});

$("#search").addEventListener("input", renderProducts);
$("#category-filter").addEventListener("change", renderProducts);

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginForm = event.currentTarget;
  const form = new FormData(loginForm);
  try {
    const result = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    state.user = result.user;
    state.csrfToken = result.csrfToken;
    updateAuthButton();
    loginForm.reset();
    $("#auth-dialog").close();
    notify(`Boas-vindas, ${state.user.name.split(" ")[0]}! ✧`);
  } catch (error) {
    notify(error.message);
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const registerForm = event.currentTarget;
  const feedback = $("#register-feedback");
  feedback.textContent = "";
  feedback.classList.add("hidden");
  const form = new FormData(registerForm);
  try {
    const result = await request("/api/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    state.user = result.user;
    state.csrfToken = result.csrfToken;
    updateAuthButton();
    registerForm.reset();
    $("#auth-dialog").close();
    notify(`Conta criada. Boas-vindas, ${state.user.name.split(" ")[0]}! ✧`);
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.remove("hidden");
  }
});

function hasValidDemoCardLength(digits) {
  return /^\d{13,19}$/.test(digits);
}

$("#payment-card-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const cardForm = event.currentTarget;
  const feedback = $("#payment-card-feedback");
  feedback.textContent = "";
  feedback.classList.add("hidden");
  const form = new FormData(cardForm);
  const digits = String(form.get("number")).replace(/\D/g, "");
  const [yearText, monthText] = String(form.get("expiry")).split("-");
  if (!hasValidDemoCardLength(digits)) {
    feedback.textContent = "O número fictício deve conter de 13 a 19 dígitos.";
    feedback.classList.remove("hidden");
    return;
  }
  try {
    await request("/api/payment-cards", {
      method: "POST",
      body: JSON.stringify({
        cardholder: form.get("cardholder"),
        brand: form.get("brand"),
        last4: digits.slice(-4),
        expiryMonth: Number(monthText),
        expiryYear: Number(yearText),
      }),
    });
    cardForm.reset();
    await loadPaymentCards();
    notify("Cartão demonstrativo cadastrado.");
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.remove("hidden");
  }
});

$("#checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.size) return notify("Seu carrinho está vazio.");
  const form = new FormData(event.currentTarget);
  const cardId = String(form.get("cardId"));
  try {
    const result = await request("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: [...state.cart.values()].map(({ product, quantity }) => ({ productId: Number(product.id), quantity })),
        payment: { cardId },
      }),
    });
    state.cart.clear();
    updateCartCount();
    $("#checkout-form").reset();
    $("#checkout-dialog").close();
    notify(`Pedido #${result.order.id} confirmado! Entrega simulada em andamento 🚚`);
    await loadProducts();
  } catch (error) {
    notify(error.message);
  }
});

async function loadProducts() {
  state.products = (await request("/api/products")).map((product) => ({
    ...product,
    id: Number(product.id),
  }));
  const categories = [...new Set(state.products.map((product) => product.category))];
  $("#category-filter").innerHTML = '<option value="">Todas</option>' + categories.map(
    (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`,
  ).join("");
  renderProducts();
}

async function start() {
  try {
    const csrf = await request("/api/csrf");
    state.csrfToken = csrf.csrfToken;
    await loadProducts();
    try {
      const result = await request("/api/me");
      state.user = result.user;
      updateAuthButton();
    } catch (error) {
      if (!error.message.startsWith("Faça login")) throw error;
    }
  } catch (error) {
    notify(`Não foi possível carregar a loja: ${error.message}`);
  }
}

start();
