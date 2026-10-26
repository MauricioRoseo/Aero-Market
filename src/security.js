const crypto = require("node:crypto");

function readHexKey(name) {
  const value = process.env[name];
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${name} deve conter exatamente 64 caracteres hexadecimais.`);
  }
  return Buffer.from(value, "hex");
}

const encryptionKey = readHexKey("DATA_ENCRYPTION_KEY");
const emailLookupKey = readHexKey("EMAIL_LOOKUP_KEY");

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decrypt(value) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function emailLookup(email) {
  return crypto.createHmac("sha256", emailLookupKey).update(email.trim().toLowerCase()).digest("hex");
}

function csrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = { csrfToken, decrypt, emailLookup, encrypt };
