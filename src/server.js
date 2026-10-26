require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const helmet = require("helmet");
const { initializeDatabase, pool } = require("./db");
const { csrfToken, decrypt, emailLookup, encrypt } = require("./security");

const app = express();
const PgSession = connectPgSimple(session);
const port = Number(process.env.PORT || 3000);
const dummyPasswordHash = bcrypt.hashSync("aero-market-invalid-login", 12);

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://images.unsplash.com", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  referrerPolicy: { policy: "no-referrer" },
}));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  name: "aero.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});

function requireCsrf(req, res, next) {
  const supplied = req.get("x-csrf-token");
  const expected = req.session.csrfToken;
  if (!supplied || !expected) {
    return res.status(403).json({ error: "Sessão expirada. Atualize a página e tente novamente." });
  }
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: "Sessão expirada. Atualize a página e tente novamente." });
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Faça login para continuar." });
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validBrazilianCpf(value) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (length) => {
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

app.get("/api/csrf", (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = csrfToken();
  res.set("Cache-Control", "no-store").json({ csrfToken: req.session.csrfToken });
});

app.get("/api/products", asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT id, name, description, price_cents, stock, category, image_url FROM products ORDER BY id",
  );
  res.json(result.rows);
}));

app.post("/api/register", authLimiter, requireCsrf, asyncRoute(async (req, res) => {
  const { name, email, cpf, phone, address, password } = req.body;
  if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 120 ||
      !validEmail(email) ||
      typeof cpf !== "string" || !validBrazilianCpf(cpf) ||
      typeof phone !== "string" || phone.replace(/\D/g, "").length < 10 ||
      phone.replace(/\D/g, "").length > 13 ||
      typeof address !== "string" || address.trim().length < 8 || address.trim().length > 300 ||
      typeof password !== "string" || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      error: "Confira os campos: CPF válido, telefone, endereço e senha com pelo menos 10 caracteres.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let result;
  try {
    result = await pool.query(
      `INSERT INTO users
         (email_lookup, email_encrypted, full_name_encrypted, cpf_encrypted, phone_encrypted, address_encrypted, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name_encrypted`,
      [
        emailLookup(email),
        encrypt(email.trim().toLowerCase()),
        encrypt(name.trim()),
        encrypt(cpf.replace(/\D/g, "")),
        encrypt(phone.trim()),
        encrypt(address.trim()),
        passwordHash,
      ],
    );
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Não foi possível criar a conta com este e-mail." });
    throw error;
  }

  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = result.rows[0].id;
  req.session.csrfToken = csrfToken();
  res.status(201).json({ user: { name: decrypt(result.rows[0].full_name_encrypted) }, csrfToken: req.session.csrfToken });
}));

app.post("/api/login", authLimiter, requireCsrf, asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (!validEmail(email) || typeof password !== "string" || password.length > 72) {
    return res.status(400).json({ error: "Informe um e-mail e uma senha válidos." });
  }
  const result = await pool.query(
    "SELECT id, password_hash, full_name_encrypted FROM users WHERE email_lookup = $1",
    [emailLookup(email)],
  );
  const user = result.rows[0];
  const validPassword = await bcrypt.compare(password, user ? user.password_hash : dummyPasswordHash);
  if (!user || !validPassword) return res.status(401).json({ error: "E-mail ou senha incorretos." });

  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  req.session.csrfToken = csrfToken();
  res.json({ user: { name: decrypt(user.full_name_encrypted) }, csrfToken: req.session.csrfToken });
}));

app.post("/api/logout", requireCsrf, asyncRoute(async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  res.clearCookie("aero.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.status(204).end();
}));

app.post("/api/orders", requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  const { items, payment } = req.body;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20 ||
      items.some((item) => !Number.isSafeInteger(item.productId) || !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 10) ||
      !payment || !["Visa", "Mastercard", "Amex", "Elo", "Hipercard"].includes(payment.brand) ||
      typeof payment.last4 !== "string" || !/^\d{4}$/.test(payment.last4)) {
    return res.status(400).json({ error: "Confira os produtos, quantidades e os dados demonstrativos do pagamento." });
  }

  const quantities = new Map();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  if ([...quantities.values()].some((quantity) => quantity > 10)) {
    return res.status(400).json({ error: "A quantidade máxima por produto é 10." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const productResult = await client.query(
      "SELECT id, name, price_cents, stock FROM products WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE",
      [productIds],
    );
    if (productResult.rows.length !== productIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Um dos produtos não está mais disponível." });
    }
    for (const product of productResult.rows) {
      if (product.stock < quantities.get(Number(product.id))) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `Estoque insuficiente para ${product.name}.` });
      }
    }

    const totalCents = productResult.rows.reduce(
      (sum, product) => sum + product.price_cents * quantities.get(Number(product.id)),
      0,
    );
    const userResult = await client.query("SELECT address_encrypted FROM users WHERE id = $1", [req.session.userId]);
    if (!userResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Faça login novamente para concluir o pedido." });
    }
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, total_cents, shipping_address_encrypted, payment_brand, payment_last4)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, status, total_cents, created_at`,
      [req.session.userId, totalCents, userResult.rows[0].address_encrypted, payment.brand, payment.last4],
    );
    for (const product of productResult.rows) {
      const quantity = quantities.get(Number(product.id));
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderResult.rows[0].id, product.id, product.name, product.price_cents, quantity],
      );
      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [quantity, product.id]);
    }
    await client.query("COMMIT");
    res.status(201).json({ order: orderResult.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/orders", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.status, o.total_cents, o.payment_brand, o.payment_last4, o.created_at,
            oi.product_name, oi.quantity
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 ORDER BY o.created_at DESC, o.id DESC`,
    [req.session.userId],
  );
  const orders = new Map();
  for (const row of result.rows) {
    if (!orders.has(row.id)) {
      const elapsedMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60_000;
      orders.set(row.id, {
        id: row.id,
        status: elapsedMinutes >= 2 ? "delivered" : elapsedMinutes >= 1 ? "shipped" : row.status,
        total_cents: row.total_cents,
        payment_brand: row.payment_brand,
        payment_last4: row.payment_last4,
        created_at: row.created_at,
        items: [],
      });
    }
    orders.get(row.id).items.push({ name: row.product_name, quantity: row.quantity });
  }
  res.json([...orders.values()]);
}));

app.get("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    "SELECT full_name_encrypted, phone_encrypted FROM users WHERE id = $1",
    [req.session.userId],
  );
  if (!result.rows[0]) return res.status(401).json({ error: "Faça login novamente." });
  res.json({
    user: {
      name: decrypt(result.rows[0].full_name_encrypted),
      phone: decrypt(result.rows[0].phone_encrypted),
    },
  });
}));

app.use(express.static(path.join(__dirname, "..", "public"), {
  extensions: ["html"],
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  },
}));

app.use((error, _req, res, _next) => {
  console.error("Erro inesperado na aplicação:", error);
  if (res.headersSent) return;
  res.status(500).json({ error: "Ocorreu um erro inesperado. Tente novamente." });
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => console.log(`Aero Market disponível em http://localhost:${port}`));
  })
  .catch((error) => {
    console.error("Não foi possível inicializar o PostgreSQL:", error);
    process.exitCode = 1;
  });
