const state = { products: [], cart: new Map(), csrfToken: null, user: null };
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
    $("#cart-dialog").close();
    $("#checkout-form").reset();
    openDialog("checkout-dialog");
  }
});

$("#cart-button").addEventListener("click", () => {
  renderCart();
  openDialog("cart-dialog");
});
$("#login-button").addEventListener("click", async () => {
  if (!state.user) return showAuth();
  try {
    await request("/api/logout", { method: "POST" });
    state.user = null;
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
  const form = new FormData(event.currentTarget);
  try {
    const result = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    state.user = result.user;
    state.csrfToken = result.csrfToken;
    updateAuthButton();
    event.currentTarget.reset();
    $("#auth-dialog").close();
    notify(`Boas-vindas, ${state.user.name.split(" ")[0]}! ✧`);
  } catch (error) {
    notify(error.message);
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await request("/api/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    state.user = result.user;
    state.csrfToken = result.csrfToken;
    updateAuthButton();
    event.currentTarget.reset();
    $("#auth-dialog").close();
    notify(`Conta criada. Boas-vindas, ${state.user.name.split(" ")[0]}! ✧`);
  } catch (error) {
    notify(error.message);
  }
});

$("#checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.size) return notify("Seu carrinho está vazio.");
  const form = new FormData(event.currentTarget);
  const card = String(form.get("card")).replace(/\D/g, "");
  const expiry = String(form.get("expiry"));
  const cvv = String(form.get("cvv"));
  if (card.length < 13 || card.length > 19 || !/^\d{2}\/\d{2}$/.test(expiry) || !/^\d{3,4}$/.test(cvv)) {
    return notify("Confira o número, a validade e o CVV do cartão demonstrativo.");
  }
  const last4 = card.slice(-4);
  try {
    const result = await request("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: [...state.cart.values()].map(({ product, quantity }) => ({ productId: product.id, quantity })),
        payment: { brand: form.get("brand"), last4 },
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
  state.products = await request("/api/products");
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
