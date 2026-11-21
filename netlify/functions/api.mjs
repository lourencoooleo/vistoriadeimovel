// ============================================================
//  Sistema de Vistorias — API (Netlify Function)
//  Armazena imóveis/vistorias no Netlify Blobs e envia fotos
//  e o termo em PDF para o Google Drive do proprietário.
// ============================================================
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

export const config = { path: "/api/*" };

// Escopo drive.file: o app só enxerga os arquivos que ele mesmo cria.
const SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
const ROOT_FOLDER = "Vistorias de Imóveis";

const SEED_IMOVEL = {
  id: "im_peruibe",
  apelido: "Casa Peruíbe",
  endereco: "Rua Ademir Ferraz Carbonel, 191, Park Daville, Peruíbe-SP, 11771-482",
  locatario: "Edna Regina Espinosa",
  locatarioCpf: "",
  comodos: [
    { nome: "Quintal e garagem", itens: ["Piso / pavimentação", "Muro perimetral", "Portão de ferro (dobradiças, trinco, fechadura)", "Iluminação externa", "Ralos e escoamento"] },
    { nome: "Área externa coberta", itens: ["Piso", "Teto / cobertura", "Paredes", "Tanque (torneira e sifão)", "Ponto da máquina de lavar", "Iluminação", "Ralos e escoamento"] },
    { nome: "Cozinha", itens: ["Piso", "Paredes e azulejos", "Teto", "Porta e fechadura", "Janelas e vidros", "Pia e torneira", "Tomadas e interruptores", "Iluminação", "Ralos"] },
    { nome: "Sala", itens: ["Piso", "Paredes e pintura", "Teto", "Porta e fechadura", "Janelas e vidros", "Tomadas e interruptores", "Iluminação"] },
    { nome: "Quarto 1", itens: ["Piso", "Paredes e pintura", "Teto", "Porta e fechadura", "Janelas e vidros", "Tomadas e interruptores", "Iluminação"] },
    { nome: "Quarto 2", itens: ["Piso", "Paredes e pintura", "Teto", "Porta e fechadura", "Janelas e vidros", "Tomadas e interruptores", "Iluminação"] },
    { nome: "Banheiro", itens: ["Piso", "Paredes e azulejos", "Teto", "Porta e fechadura", "Vaso sanitário e descarga", "Pia e torneira", "Box e chuveiro", "Tomadas e iluminação", "Ralos", "Ventilação"] },
    { nome: "Instalações gerais", itens: ["Quadro de energia (disjuntores)", "Caixa d'água"] },
  ],
};

// ---------- infraestrutura ----------
let storeOverride = null;
export const __test = { setStore: (s) => (storeOverride = s) };

const env = (k) => process.env[k];
const db = () => storeOverride || getStore({ name: "vistorias-app", consistency: "strong" });
const load = async (k, fb) => (await db().get(k, { type: "json" })) ?? fb;
const save = (k, v) => db().setJSON(k, v);
const now = () => new Date().toISOString();

class HttpError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const siteUrl = (req) => (env("URL") || new URL(req.url).origin).replace(/\/$/, "");
const redirectUri = (req) => siteUrl(req) + "/api/google/callback";
const str = (v, n = 300) => String(v ?? "").trim().slice(0, n);

// ---------- roteador ----------
export default async (req) => {
  try {
    const url = new URL(req.url);
    const p = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (p[0] === "admin") return await admin(req, url, p.slice(1), req.method);
    if (p[0] === "google" && p[1] === "callback") return await googleCallback(req, url);
    if (p[0] === "assinafy" && p[1] === "webhook" && req.method === "POST") return await assinafyWebhook(req, url);
    if (p[0] === "v" && p[1]) return await vistoriador(req, url, p[1], p[2], req.method);
    throw new HttpError("Rota não encontrada", 404);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return json({ ok: false, erro: e.message || "Erro interno" }, e.status || 500);
  }
};

// ---------- dados ----------
async function getImoveis() {
  let l = await load("imoveis", null);
  if (!l) { l = [SEED_IMOVEL]; await save("imoveis", l); }
  return l;
}
async function getSettings() {
  return { locadorNome: "Leonardo Lourenço da Silva", locadorCpf: "", seq: 0, ...(await load("settings", {})) };
}
async function updateVistoria(id, patch) {
  const l = await load("vistorias", []);
  const i = l.findIndex((x) => x.id === id);
  if (i < 0) throw new HttpError("Vistoria não encontrada", 404);
  Object.assign(l[i], patch);
  await save("vistorias", l);
  return l[i];
}

function sanitizeImovel(x) {
  const im = {
    id: str(x.id, 60) || "im_" + randomUUID().slice(0, 8),
    apelido: str(x.apelido, 80),
    endereco: str(x.endereco, 300),
    locatario: str(x.locatario, 120),
    locatarioCpf: str(x.locatarioCpf, 20),
    locatarioEmail: str(x.locatarioEmail, 160),
    comodos: (Array.isArray(x.comodos) ? x.comodos : [])
      .map((c) => ({
        nome: str(c.nome, 80),
        itens: (Array.isArray(c.itens) ? c.itens : []).map((i) => str(i, 120)).filter(Boolean).slice(0, 60),
      }))
      .filter((c) => c.nome && c.itens.length)
      .slice(0, 40),
  };
  if (!im.endereco) throw new HttpError("Informe o endereço do imóvel.");
  if (!im.comodos.length) throw new HttpError("Cadastre pelo menos um cômodo com itens.");
  if (!im.apelido) im.apelido = im.endereco.split(",")[0];
  return im;
}

// ---------- painel do proprietário ----------
async function admin(req, url, p, m) {
  const pass = env("ADMIN_PASSWORD");
  if (!pass) throw new HttpError("Configure a variável ADMIN_PASSWORD na Netlify e faça um novo deploy.", 500);
  if (!safeEq(req.headers.get("x-admin-key") || "", pass)) throw new HttpError("Senha incorreta.", 401);
  const [a, b, c] = p;

  if (a === "login") return json({ ok: true });

  if (a === "state" && m === "GET") {
    const [imoveis, vistorias, settings, google, drive] = await Promise.all([
      getImoveis(), load("vistorias", []), getSettings(), load("google", null), load("drive", {}),
    ]);
    return json({
      ok: true,
      imoveis,
      vistorias: vistorias
        .map(({ pdfSession, ...v }) => v)
        .sort((x, y) => y.criadaEm.localeCompare(x.criadaEm)),
      settings: { locadorNome: settings.locadorNome, locadorCpf: settings.locadorCpf, locadorEmail: settings.locadorEmail || "" },
      google: { connected: !!google?.refreshToken, email: google?.email || "", rootLink: drive.rootLink || null },
      assinafy: {
        configured: !!(env("ASSINAFY_API_KEY") && env("ASSINAFY_ACCOUNT_ID")),
        webhookUrl: env("ASSINAFY_WEBHOOK_SECRET") ? `${siteUrl(req)}/api/assinafy/webhook?chave=${env("ASSINAFY_WEBHOOK_SECRET")}` : null,
      },
      setup: { clientId: !!env("GOOGLE_CLIENT_ID"), clientSecret: !!env("GOOGLE_CLIENT_SECRET"), redirectUri: redirectUri(req) },
    });
  }

  if (a === "imoveis" && !b && m === "POST") {
    const im = sanitizeImovel(await req.json());
    const l = await getImoveis();
    const i = l.findIndex((x) => x.id === im.id);
    if (i >= 0) l[i] = im; else l.push(im);
    await save("imoveis", l);
    return json({ ok: true, imovel: im });
  }
  if (a === "imoveis" && b && m === "DELETE") {
    await save("imoveis", (await getImoveis()).filter((x) => x.id !== b));
    return json({ ok: true });
  }

  if (a === "vistorias" && !b && m === "POST") {
    const x = await req.json();
    const im = (await getImoveis()).find((i) => i.id === x.imovelId);
    if (!im) throw new HttpError("Imóvel não encontrado.");
    const s = await load("settings", {});
    s.seq = (s.seq || 0) + 1;
    await save("settings", s);
    const v = {
      id: "vs_" + randomUUID().slice(0, 8),
      token: (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 32),
      codigo: `VST-${new Date().getFullYear()}-${String(s.seq).padStart(4, "0")}`,
      imovelId: im.id,
      imovel: im, // cópia congelada: editar o imóvel depois não muda esta vistoria
      tipo: x.tipo === "Saída" ? "Saída" : "Entrada",
      vistoriadorNome: str(x.vistoriadorNome, 120),
      status: "aguardando",
      criadaEm: now(),
    };
    const l = await load("vistorias", []);
    l.push(v);
    await save("vistorias", l);
    return json({ ok: true, vistoria: v });
  }
  if (a === "vistorias" && b && c === "assinafy") return await assinafy(req, b, p[3], m);
  if (a === "vistorias" && b && m === "DELETE") {
    await save("vistorias", (await load("vistorias", [])).filter((x) => x.id !== b));
    return json({ ok: true });
  }

  if (a === "settings" && m === "POST") {
    const x = await req.json();
    const s = await load("settings", {});
    s.locadorNome = str(x.locadorNome, 120);
    s.locadorCpf = str(x.locadorCpf, 20);
    s.locadorEmail = str(x.locadorEmail, 160);
    await save("settings", s);
    return json({ ok: true });
  }

  if (a === "google" && b === "auth-url") {
    const id = env("GOOGLE_CLIENT_ID");
    if (!id || !env("GOOGLE_CLIENT_SECRET"))
      throw new HttpError("Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis da Netlify.", 500);
    const state = randomUUID();
    await save("oauthState", { state, exp: Date.now() + 15 * 60 * 1000 });
    const q = new URLSearchParams({
      client_id: id, redirect_uri: redirectUri(req), response_type: "code", scope: SCOPES,
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
    });
    return json({ ok: true, url: "https://accounts.google.com/o/oauth2/v2/auth?" + q });
  }
  if (a === "google" && b === "disconnect" && m === "POST") {
    await db().delete("google");
    return json({ ok: true });
  }
  void c;
  throw new HttpError("Rota não encontrada", 404);
}

// ---------- OAuth do Google ----------
async function googleCallback(req, url) {
  const back = (q) => new Response(null, { status: 302, headers: { location: "/admin.html#" + q } });
  const erro = (msg) => back("drive=erro&msg=" + encodeURIComponent(msg));
  if (url.searchParams.get("error")) return erro(url.searchParams.get("error"));
  const st = await load("oauthState", null);
  if (!st || st.state !== url.searchParams.get("state") || st.exp < Date.now())
    return erro("A sessão de conexão expirou. Clique em Conectar de novo.");
  await db().delete("oauthState");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") || "",
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok) return erro(j.error_description || j.error || "Falha ao falar com o Google");
  const prev = await load("google", null);
  const refreshToken = j.refresh_token || prev?.refreshToken;
  if (!refreshToken)
    return erro("O Google não devolveu a autorização. Remova o app em myaccount.google.com/permissions e conecte de novo.");
  let email = "";
  try { email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString()).email || ""; } catch {}
  await save("google", {
    refreshToken, email, connectedAt: now(),
    accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in || 3000) * 1000,
  });
  return back("drive=ok");
}

async function accessToken() {
  const g = await load("google", null);
  if (!g?.refreshToken)
    throw new HttpError("O Google Drive do proprietário não está conectado. Avise o responsável pelo imóvel.", 503);
  if (g.accessToken && g.expiresAt > Date.now() + 60_000) return g.accessToken;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: g.refreshToken, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError("O Google recusou a conexão (" + (j.error || r.status) + "). Reconecte o Drive no painel.", 503);
  await save("google", { ...g, accessToken: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

// ---------- Google Drive ----------
async function drive(path, opts = {}) {
  const tk = await accessToken();
  return fetch("https://www.googleapis.com" + path, {
    ...opts,
    headers: { authorization: `Bearer ${tk}`, ...(opts.headers || {}) },
  });
}
async function driveJson(path, opts) {
  const r = await drive(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError("Google Drive: " + (j.error?.message || r.status), 502);
  return j;
}
async function folderOk(id) {
  if (!id) return false;
  const r = await drive(`/drive/v3/files/${id}?fields=id,trashed`);
  if (!r.ok) return false;
  return !(await r.json()).trashed;
}
const createFolder = (name, parent) =>
  driveJson("/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parent ? [parent] : undefined }),
  });

async function uploadSmall(name, mime, bytes, parent) {
  const boundary = "vst" + randomUUID().replace(/-/g, "");
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n` +
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  return driveJson("/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function rootFolder() {
  const d = await load("drive", {});
  if (await folderOk(d.rootId)) return d.rootId;
  const f = await createFolder(ROOT_FOLDER);
  await save("drive", { ...d, rootId: f.id, rootLink: f.webViewLink });
  return f.id;
}
async function imovelFolder(im) {
  const d = await load("drive", {});
  const known = d.imoveis?.[im.id];
  if (await folderOk(known)) return known;
  const f = await createFolder(im.apelido || im.endereco.slice(0, 60), await rootFolder());
  const d2 = await load("drive", {});
  d2.imoveis = { ...(d2.imoveis || {}), [im.id]: f.id };
  await save("drive", d2);
  return f.id;
}

// ---------- Assinafy (assinatura eletrônica) ----------
// Docs: https://api.assinafy.com.br/v1/docs — autenticação pelo header X-Api-Key.
const afBase = () => (env("ASSINAFY_BASE_URL") || "https://api.assinafy.com.br/v1").replace(/\/$/, "");
async function af(path, opts = {}) {
  const key = env("ASSINAFY_API_KEY");
  if (!key || !env("ASSINAFY_ACCOUNT_ID"))
    throw new HttpError("Configure ASSINAFY_API_KEY e ASSINAFY_ACCOUNT_ID nas variáveis da Netlify.", 500);
  return fetch(afBase() + path, { ...opts, headers: { "X-Api-Key": key, accept: "application/json", ...(opts.headers || {}) } });
}
async function afJson(path, opts) {
  const r = await af(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const det = j.message || j.error || (j.errors && JSON.stringify(j.errors)) || r.status;
    throw new HttpError("Assinafy: " + det, 502);
  }
  return j && j.data !== undefined ? j.data : j;
}
const afList = (d) => (Array.isArray(d) ? d : d?.data || d?.items || d?.results || []);
const afStatus = (doc) => String(doc?.status?.code || doc?.status || "").toLowerCase();

async function afSigner(nome, email) {
  const acc = env("ASSINAFY_ACCOUNT_ID");
  const found = afList(await afJson(`/accounts/${acc}/signers?search=${encodeURIComponent(email)}&per-page=50`))
    .find((s) => String(s.email || "").toLowerCase() === email.toLowerCase());
  if (found) return found.id;
  const s = await afJson(`/accounts/${acc}/signers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ full_name: nome, email }),
  });
  return s.id;
}

// Confere o documento na Assinafy e, se estiver todo assinado, guarda o PDF assinado no Drive.
async function afSync(v) {
  const docId = v.assinafy.docId;
  const doc = await afJson(`/documents/${docId}`);
  const st = afStatus(doc);
  const pronto = ["metadata_ready", "pending_signature", "certificated", "certificating"].includes(st);
  const patch = { assinafy: { ...v.assinafy, docStatus: st, verificadoEm: now() } };
  if (st === "certificated" && !v.assinafy.signedId) {
    const r = await af(`/documents/${docId}/download/certificated`);
    if (!r.ok) throw new HttpError("Assinafy: não consegui baixar o PDF assinado (" + r.status + ").", 502);
    const f = await uploadSmall(`Termo de Vistoria ${v.codigo} - ASSINADO.pdf`, "application/pdf", new Uint8Array(await r.arrayBuffer()), v.folderId);
    Object.assign(patch.assinafy, { status: "assinado", signedId: f.id, signedLink: f.webViewLink, assinadoEm: now() });
  } else if (/reject|recus|declin|cancel|expired|expir|fail/.test(st)) {
    patch.assinafy.status = "problema";
  }
  await updateVistoria(v.id, patch);
  return { docStatus: st, pronto, assinafy: patch.assinafy };
}

// Webhook: a Assinafy avisa quando algo muda. Não confiamos no conteúdo do aviso:
// usamos só para saber QUAL documento conferir, e consultamos a própria API.
async function assinafyWebhook(req, url) {
  const secret = env("ASSINAFY_WEBHOOK_SECRET");
  if (!secret) throw new HttpError("Webhook desativado: defina ASSINAFY_WEBHOOK_SECRET na Netlify.", 503);
  if (!safeEq(url.searchParams.get("chave") || "", secret)) throw new HttpError("Chave inválida.", 401);
  const body = await req.json().catch(() => ({}));
  const ids = new Set();
  (function walk(o, k) {
    if (!o || typeof o !== "object") return;
    for (const [key, val] of Object.entries(o)) {
      if (typeof val === "string" && /^(document_id|documentId)$/.test(key)) ids.add(val);
      if (typeof val === "string" && key === "id" && /document/i.test(k || "")) ids.add(val);
      if (val && typeof val === "object") walk(val, key);
    }
  })(body, "");
  const pend = (await load("vistorias", [])).filter((x) => x.assinafy?.docId && x.assinafy.status !== "assinado");
  const alvo = ids.size ? pend.filter((x) => ids.has(x.assinafy.docId)) : pend;
  const out = [];
  for (const v of alvo) {
    try { out.push({ codigo: v.codigo, ...(await afSync(v)).assinafy }); }
    catch (e) { console.error("webhook", v.codigo, e.message); }
  }
  return json({ ok: true, conferidos: out.length });
}

async function assinafy(req, id, step, m) {
  const v = (await load("vistorias", [])).find((x) => x.id === id);
  if (!v) throw new HttpError("Vistoria não encontrada", 404);
  if (v.status !== "concluida" || !v.pdfId) throw new HttpError("A vistoria precisa estar concluída.", 409);
  const acc = env("ASSINAFY_ACCOUNT_ID");

  // 1) sobe o PDF do Drive para a Assinafy
  if (step === "upload" && m === "POST") {
    const r = await drive(`/drive/v3/files/${v.pdfId}?alt=media`);
    if (!r.ok) throw new HttpError("Não consegui ler o PDF no Drive (" + r.status + ").", 502);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "application/pdf" }), `Termo de Vistoria ${v.codigo}.pdf`);
    const doc = await afJson(`/accounts/${acc}/documents`, { method: "POST", body: fd });
    await updateVistoria(v.id, { assinafy: { docId: doc.id, status: "processando", criadoEm: now() } });
    return json({ ok: true, docId: doc.id, docStatus: afStatus(doc) });
  }

  if (!v.assinafy?.docId) throw new HttpError("O documento ainda não foi enviado para a Assinafy.", 409);
  const docId = v.assinafy.docId;

  // 2) consulta o andamento; quando tudo estiver assinado, salva o PDF assinado no Drive
  if (step === "status" && m === "GET") return json({ ok: true, ...(await afSync(v)) });

  // 3) cadastra os signatários e dispara os convites por e-mail
  if (step === "send" && m === "POST") {
    const b = await req.json();
    const lista = (Array.isArray(b.signers) ? b.signers : [])
      .map((s) => ({ papel: str(s.papel, 30), nome: str(s.nome, 120), email: str(s.email, 160) }))
      .filter((s) => s.nome && s.email);
    if (!lista.length) throw new HttpError("Inclua pelo menos um signatário com nome e e-mail.");
    const bad = lista.find((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email));
    if (bad) throw new HttpError(`E-mail inválido para ${bad.nome}.`);
    const ids = [];
    for (const s of lista) ids.push(await afSigner(s.nome, s.email));
    const body = {
      method: "virtual",
      signers: ids.map((sid) => ({ id: sid, verification_method: "Email", notification_methods: ["Email"] })),
      message: str(b.message, 500) || `Termo de vistoria de ${v.tipo.toLowerCase()} do imóvel ${v.imovel.apelido}.`,
    };
    const as = await afJson(`/documents/${docId}/assignments`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    await updateVistoria(v.id, {
      assinafy: { ...v.assinafy, status: "enviado", assignmentId: as?.id || null, enviadoEm: now(), signers: lista },
    });
    return json({ ok: true });
  }

  throw new HttpError("Ação inválida.", 404);
}

// ---------- link do vistoriador ----------
async function vistoriador(req, url, token, action, m) {
  const v = (await load("vistorias", [])).find((x) => x.token === token);
  if (!v) throw new HttpError("Este link de vistoria não existe ou foi cancelado.", 404);

  if (!action && m === "GET") {
    if (!v.abertaEm) await updateVistoria(v.id, { abertaEm: now(), status: v.status === "aguardando" ? "aberta" : v.status });
    const [s, g] = await Promise.all([getSettings(), load("google", null)]);
    return json({
      ok: true,
      vistoria: {
        codigo: v.codigo, tipo: v.tipo, status: v.status === "aguardando" ? "aberta" : v.status,
        imovel: { apelido: v.imovel.apelido, endereco: v.imovel.endereco, locatario: v.imovel.locatario, locatarioCpf: v.imovel.locatarioCpf, locatarioEmail: v.imovel.locatarioEmail || "", comodos: v.imovel.comodos },
        vistoriadorNome: v.vistoriadorNome, locadorNome: s.locadorNome, locadorCpf: s.locadorCpf,
        concluidaEm: v.concluidaEm || null,
      },
      driveConnected: !!g?.refreshToken,
    });
  }

  if (v.status === "concluida") throw new HttpError("Esta vistoria já foi enviada.", 409);

  if (action === "start" && m === "POST") {
    const b = await req.json().catch(() => ({}));
    const patch = { status: "enviando", iniciadaEm: v.iniciadaEm || now(), vistoriadorNome: str(b.vistoriador, 120) || v.vistoriadorNome };
    if (!(await folderOk(v.folderId))) {
      const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || "") ? b.data : now().slice(0, 10);
      const pasta = await createFolder(`${data} · ${v.tipo} · ${v.codigo}`, await imovelFolder(v.imovel));
      const fotos = await createFolder("Fotos", pasta.id);
      Object.assign(patch, { folderId: pasta.id, folderLink: pasta.webViewLink, fotosFolderId: fotos.id });
    }
    await updateVistoria(v.id, patch);
    return json({ ok: true });
  }

  if (!v.folderId) throw new HttpError("O envio ainda não foi iniciado.", 409);

  if (action === "photo" && m === "POST") {
    const name = str(url.searchParams.get("name") || "foto.jpg", 150);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length) throw new HttpError("Foto vazia.");
    const f = await uploadSmall(name, "image/jpeg", bytes, v.fotosFolderId);
    return json({ ok: true, id: f.id });
  }

  if (action === "pdf-init" && m === "POST") {
    const b = await req.json();
    const size = Number(b.size);
    if (!size || size > 300 * 1024 * 1024) throw new HttpError("Tamanho de PDF inválido.");
    const r = await drive("/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": "application/pdf",
        "x-upload-content-length": String(size),
      },
      body: JSON.stringify({ name: str(b.name, 150) || "Termo de vistoria.pdf", parents: [v.folderId] }),
    });
    if (!r.ok) throw new HttpError("Google Drive não aceitou iniciar o envio do PDF (" + r.status + ").", 502);
    await updateVistoria(v.id, { pdfSession: { uri: r.headers.get("location"), size } });
    return json({ ok: true });
  }

  if (action === "pdf-chunk" && m === "PUT") {
    const s = v.pdfSession;
    if (!s?.uri) throw new HttpError("Envio do PDF não iniciado.", 409);
    const offset = Number(url.searchParams.get("offset") || 0);
    const bytes = new Uint8Array(await req.arrayBuffer());
    const r = await fetch(s.uri, {
      method: "PUT",
      headers: { "content-range": `bytes ${offset}-${offset + bytes.length - 1}/${s.size}` },
      body: bytes,
      redirect: "manual",
    });
    if (r.status === 308) {
      const range = r.headers.get("range");
      return json({ ok: true, done: false, next: range ? Number(range.split("-")[1]) + 1 : 0 });
    }
    if (r.ok) {
      const f = await r.json();
      await updateVistoria(v.id, { pdfId: f.id, pdfLink: f.webViewLink, pdfSession: null });
      return json({ ok: true, done: true });
    }
    throw new HttpError("Google Drive recusou parte do PDF (" + r.status + ").", 502);
  }

  if (action === "finish" && m === "POST") {
    if (!v.pdfId) throw new HttpError("O PDF ainda não foi enviado.", 409);
    const b = await req.json().catch(() => ({}));
    try {
      await uploadSmall("dados-da-vistoria.json", "application/json",
        new TextEncoder().encode(JSON.stringify(b.dados || {}, null, 2)), v.folderId);
    } catch (e) { console.error("backup json", e); }
    const pt = b.partes || {};
    const parte = (x) => ({ nome: str(x?.nome, 120), email: str(x?.email, 160), cpf: str(x?.cpf, 20), assinouNaTela: !!x?.assinouNaTela });
    await updateVistoria(v.id, {
      status: "concluida", concluidaEm: now(), resumo: b.resumo || null,
      partes: { vistoriador: parte(pt.vistoriador), locatario: parte(pt.locatario) },
    });
    return json({ ok: true, pdfLink: v.pdfLink, folderLink: v.folderLink });
  }

  throw new HttpError("Ação inválida.", 404);
}
