# Aero Market

Marketplace acadêmico demonstrativo com interface inspirada no Windows XP/Frutiger Aero, Node.js, Express e PostgreSQL. Inclui cadastro, login, catálogo, carrinho, compra e acompanhamento de entrega simulada (o status avança automaticamente de preparação para a caminho e entregue).

## Executar localmente

Requisitos: Node.js 20+ e PostgreSQL.

1. Crie o banco `aero_marketplace` no PostgreSQL.
2. Copie `.env.example` para `.env` e configure `DATABASE_URL`.
3. Gere três valores aleatórios distintos de 32 bytes e represente-os em hexadecimal com 64 caracteres: `SESSION_SECRET` (pode ser texto aleatório longo), `DATA_ENCRYPTION_KEY` e `EMAIL_LOOKUP_KEY`. Para as duas chaves criptográficas, use exatamente 64 caracteres hexadecimais. Nunca compartilhe ou versiona o `.env`.
4. Execute `npm install` e `npm start`.
5. Acesse `http://localhost:3000`. A aplicação cria as tabelas e produtos de demonstração na primeira inicialização.

Para desenvolvimento, `npm run dev` reinicia o servidor quando os arquivos do backend mudam.

## Segurança e escopo

- Senhas armazenadas com bcrypt (12 rounds); as sessões ficam no PostgreSQL e usam cookie `HttpOnly`, `SameSite=Lax` e `Secure` quando `NODE_ENV=production`.
- CPF, nome, telefone, endereço e e-mail são criptografados com AES-256-GCM. A busca de e-mail de login usa HMAC-SHA-256 com chave separada.
- Consultas SQL parametrizadas, token CSRF para operações que alteram dados, limitação de tentativas de autenticação, validação de entrada, Helmet/CSP e respostas sem dados pessoais desnecessários.
- O pagamento é apenas uma simulação acadêmica. O navegador envia exclusivamente bandeira e quatro últimos dígitos; número completo, CVV e validade não são enviados nem persistidos. Não use dados reais nem trate esta demonstração como ambiente PCI DSS.
- Endereços e outros dados persistidos são dados de exemplo ou fornecidos pelo usuário. Utilize dados fictícios na atividade e proteja as chaves e o banco.
- As imagens do catálogo são carregadas do Unsplash quando há conexão com a internet.
