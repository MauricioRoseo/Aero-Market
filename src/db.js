const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

const demoProducts = [
  {
    name: "Fone AquaWave",
    description: "Som imersivo, acabamento translúcido e conforto para o dia todo.",
    price_cents: 18990,
    stock: 12,
    category: "Áudio",
    image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85",
  },
  {
    name: "Câmera Digital Splash",
    description: "Registre suas aventuras com cores vivas e estilo retrô.",
    price_cents: 32990,
    stock: 8,
    category: "Tecnologia",
    image_url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=700&q=85",
  },
  {
    name: "Caixa de Som Lagoon",
    description: "Som potente com conexão sem fio e design inspirado no oceano.",
    price_cents: 24990,
    stock: 15,
    category: "Áudio",
    image_url: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=85",
  },
  {
    name: "Relógio SkyBlue",
    description: "Seu dia conectado em uma pulseira leve, macia e colorida.",
    price_cents: 27990,
    stock: 10,
    category: "Acessórios",
    image_url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85",
  },
];

async function initializeDatabase() {
  const schema = await fs.readFile(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool.query(schema);

  const existing = await pool.query("SELECT EXISTS (SELECT 1 FROM products) AS has_products");
  if (!existing.rows[0].has_products) {
    for (const product of demoProducts) {
      await pool.query(
        `INSERT INTO products (name, description, price_cents, stock, category, image_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [product.name, product.description, product.price_cents, product.stock, product.category, product.image_url],
      );
    }
  }
}

module.exports = { initializeDatabase, pool };
