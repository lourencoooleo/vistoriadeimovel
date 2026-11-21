/* Sistema de Vistorias — app do vistoriador (abre pelo link ?v=TOKEN) */
"use strict";
(() => {
  const ESTADOS = ["Ótimo", "Bom", "Regular", "Ruim", "N/A"];
  const CLS = { "Ótimo": "otimo", "Bom": "bom", "Regular": "regular", "Ruim": "ruim", "N/A": "na" };
  const app = document.getElementById("app");
  const token = new URLSearchParams(location.search).get("v");
  let C = null, D = null, screen = "intro", roomIdx = 0;
  let pads = {}, lastPdf = null, lastData = null, sending = false, sendState = null;
  const openObs = new Set();
  const urlCache = new Map();

  // ---------- ícones ----------
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    camera: svg('<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>'),
    note: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    chev: svg('<path d="M9 18l6-6-6-6"/>'),
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    drop: svg('<path d="M12 2.5S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.5 12 2.5z"/>'),
    key: svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M15 8l2 2"/>'),
    home: svg('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    phone: svg('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
    pen: svg('<path d="M3 17c3-3 5-8 8-8s-1 9 2 9 3-4 5-4 2 2 3 2"/>'),
    send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
    file: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    alert: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  };

  // ---------- utilidades ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtData = (iso) => { const [a, m, d] = String(iso || "").split("-"); return a ? `${d}/${m}/${a}` : ""; };
  const fmtDataHora = (dt) => dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const pk = (id) => `photo:${token}:${id}`;

  let toastT;
  function toast(msg, kind = "", ms) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.className = "toast show " + kind;
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast " + kind), ms || (kind === "ok" ? 1600 : 3400));
  }

  // IndexedDB mínimo (rascunho e fotos ficam no celular)
  const idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("vistorias", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction("kv", mode); const req = fn(t.objectStore("kv"));
        t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    };
    return {
      get: (k) => tx("readonly", (s) => s.get(k)),
      set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
      del: (k) => tx("readwrite", (s) => s.delete(k)),
    };
  })();

  let saveT;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => idb.set("draft:" + token, D).catch(() => toast("Não consegui salvar no celular. Libere espaço.", "error")), 250); }

  async function call(method, path, body, raw) {
    const opts = { method, headers: {} };
    if (raw) { opts.body = body; opts.headers["content-type"] = body.type || "application/octet-stream"; }
    else if (body) { opts.body = JSON.stringify(body); opts.headers["content-type"] = "application/json"; }
    let r;
    try { r = await fetch(path, opts); } catch (e) { throw new Error("Sem conexão com a internet."); }
    let j = null;
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok || (j && j.ok === false)) {
      const err = new Error((j && j.erro) || `Erro ${r.status}`);
      err.fatal = r.status >= 400 && r.status < 500;
      throw err;
    }
    return j;
  }
  async function retry(fn, tries = 3) {
    let err;
    for (let i = 0; i < tries; i++) {
      try { return await fn(); }
      catch (e) { err = e; if (e.fatal) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
    throw err;
  }

  // ---------- fotos ----------
  async function loadImage(file) {
    if (window.createImageBitmap) {
      try { const b = await createImageBitmap(file, { imageOrientation: "from-image" }); return { img: b, w: b.width, h: b.height }; }
      catch (e) { /* cai no fallback */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      return { img, w: img.naturalWidth, h: img.naturalHeight };
    } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
  }
  async function compress(file, max, q) {
    const { img, w, h } = await loadImage(file);
    const s = Math.min(1, max / Math.max(w, h));
    const cw = Math.round(w * s), ch = Math.round(h * s);
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q));
    if (!blob) throw new Error("falha ao comprimir");
    return { blob, w: cw, h: ch };
  }
  const toDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

  function refList(ref) {
    const [k, a, b] = ref.split(":");
    if (k === "item") return D.itens[a][b].fotos;
    if (k === "room") return D.comodos[a].fotos;
    if (k === "med") return D.medidores[a].fotos;
    return D.geral.fotos;
  }
  async function photoURL(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const b = await idb.get(pk(id)); if (!b) return "";
    const u = URL.createObjectURL(b); urlCache.set(id, u); return u;
  }
  function hydrate() { app.querySelectorAll("img[data-photo]").forEach(async (img) => { img.src = await photoURL(img.dataset.photo); }); }

  async function addPhotos(files, ref) {
    if (!files.length) return;
    const list = refList(ref);
    toast(files.length > 1 ? `Salvando ${files.length} fotos...` : "Salvando foto...");
    let ok = 0;
    for (const f of files) {
      try {
        const { blob, w, h } = await compress(f, 1600, 0.82);
        const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await idb.set(pk(id), blob);
        D.photos[id] = { w, h }; list.push(id); ok++;
      } catch (e) { console.error(e); toast("Não consegui ler uma das fotos. Tente de novo.", "error"); }
    }
    save(); keepScroll(render);
    if (ok) toast(ok > 1 ? `${ok} fotos salvas` : "Foto salva", "ok");
  }
  function thumbs(ref) {
    const list = refList(ref);
    if (!list.length) return "";
    return `<div class="thumbs">${list.map((id) => `<div class="thumb"><img data-photo="${id}" alt=""><button class="thumb-x" data-a="delPhoto" data-ref="${ref}" data-id="${id}" aria-label="Remover foto">×</button></div>`).join("")}</div>`;
  }
  function photoBtn(ref, label = "Foto") {
    const n = refList(ref).length;
    return `<label class="btn btn-photo ${n ? "has" : ""}"><input class="sr-file" type="file" accept="image/*" multiple data-ref="${ref}">${ICON.camera}<span>${esc(label)}${n ? ` · ${n}` : ""}</span></label>`;
  }

  // ---------- cálculos ----------
  function stats() {
    let total = 0, feitos = 0, fotos = 0;
    D.itens.forEach((r) => r.forEach((i) => { total++; if (i.estado) feitos++; fotos += i.fotos.length; }));
    D.comodos.forEach((c) => (fotos += c.fotos.length));
    fotos += D.medidores.energia.fotos.length + D.medidores.agua.fotos.length + D.geral.fotos.length;
    return { total, feitos, falta: total - feitos, fotos };
  }
  function roomStats(r) {
    const it = D.itens[r];
    return { total: it.length, feitos: it.filter((i) => i.estado).length, fotos: it.reduce((s, i) => s + i.fotos.length, 0) + D.comodos[r].fotos.length };
  }
  function contagem() {
    const c = {}; ESTADOS.forEach((e) => (c[e] = 0));
    D.itens.forEach((r) => r.forEach((i) => { if (i.estado) c[i.estado]++; }));
    return c;
  }
  function atencao() {
    const out = [];
    C.imovel.comodos.forEach((c, r) => c.itens.forEach((nome, i) => {
      const it = D.itens[r][i];
      if (it.estado === "Regular" || it.estado === "Ruim") out.push({ comodo: c.nome, item: nome, estado: it.estado, fotos: it.fotos.length });
    }));
    return out;
  }

  // ---------- rascunho ----------
  function newDraft() {
    return {
      v: 2, iniciado: false,
      vistoriador: { nome: C.vistoriadorNome || "", cpf: "", email: "" }, data: hojeISO(),
      itens: C.imovel.comodos.map((c) => c.itens.map(() => ({ estado: "", obs: "", fotos: [] }))),
      comodos: C.imovel.comodos.map(() => ({ obs: "", fotos: [] })),
      medidores: { energia: { leitura: "", fotos: [] }, agua: { leitura: "", fotos: [] } },
      chaves: { qtd: "", desc: "", declarado: false },
      geral: { estado: "", obs: "", fotos: [] },
      locatario: { nome: C.imovel.locatario || "", cpf: C.imovel.locatarioCpf || "", email: C.imovel.locatarioEmail || "", ausente: false },
      assin: { vistoriador: null, locatario: null, vistoriadorEm: null, locatarioEm: null },
      declaracao: false, photos: {}, uploaded: {},
    };
  }
  function setPath(path, val) {
    const ks = path.split(".");
    let o = D;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = val;
    save();
  }

  // ---------- telas ----------
  function go(s, i) { screen = s; if (i !== undefined) roomIdx = i; render(); window.scrollTo(0, 0); }
  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }
  function render() {
    ({ intro: renderIntro, home: renderHome, room: renderRoom, extras: renderExtras, geral: renderGeral, assinar: renderAssinar }[screen] || renderHome)();
    hydrate();
  }

  function renderMsg(titulo, texto) {
    app.innerHTML = `<main class="wrap center done"><div class="done-ico" style="background:#fdf0d8;color:#a35f06">${ICON.alert}</div><h1>${esc(titulo)}</h1><p>${esc(texto)}</p></main>`;
  }

  function topbar(title, sub) {
    return `<header class="topbar"><div class="topbar-in"><button class="back" data-a="home">${ICON.back}<span>Cômodos</span></button></div>
      <h1 class="room-title">${esc(title)}</h1>${sub ? `<div class="progress-label">${esc(sub)}</div>` : ""}</header>`;
  }

  function renderIntro() {
    const im = C.imovel;
    app.innerHTML = `
    <header class="hero"><div class="hero-in">
      <div class="kicker">Vistoria de ${esc(C.tipo.toLowerCase())} · ${esc(C.codigo)}</div>
      <h1>${esc(im.apelido)}</h1><p>${esc(im.endereco)}</p>
    </div></header>
    <main class="wrap">
      <section class="card">
        <h2>Como funciona</h2>
        <ol class="howto">
          <li><b>Passe por cada cômodo</b> e toque no estado de cada item.</li>
          <li><b>Fotografe</b> o ambiente e, principalmente, qualquer defeito.</li>
          <li><b>No final</b>, você e o(a) locatário(a) assinam na tela e o termo é enviado.</li>
        </ol>
        <p class="hint">${ICON.phone}<span>Tudo fica salvo neste celular enquanto você preenche. Pode fechar e voltar pelo mesmo link. A internet só é necessária no envio.</span></p>
      </section>
      <section class="card">
        <h2>Seus dados</h2>
        <label class="field"><span>Seu nome completo</span><input data-bind="vistoriador.nome" value="${esc(D.vistoriador.nome)}" autocomplete="name" placeholder="Nome de quem faz a vistoria"></label>
        <label class="field"><span>E-mail</span><input type="email" data-bind="vistoriador.email" value="${esc(D.vistoriador.email)}" autocomplete="email" inputmode="email" placeholder="Para assinar o termo eletronicamente"></label>
        <label class="field"><span>CPF <em>opcional</em></span><input data-bind="vistoriador.cpf" value="${esc(D.vistoriador.cpf)}" inputmode="numeric" placeholder="000.000.000-00"></label>
        <label class="field"><span>Data da vistoria</span><input type="date" data-bind="data" value="${esc(D.data)}"></label>
      </section>
    </main>
    <div class="cta-bar"><div><button class="btn btn-primary btn-block" data-a="start">${D.iniciado ? "Voltar à vistoria" : "Começar vistoria"}</button></div></div>`;
  }

  function renderHome() {
    const s = stats(), pct = s.total ? Math.round((s.feitos / s.total) * 100) : 0;
    const rows = C.imovel.comodos.map((c, i) => {
      const r = roomStats(i);
      const cls = r.feitos === r.total ? "done" : r.feitos ? "partial" : "";
      return `<button class="row ${cls}" data-a="room" data-i="${i}">
        <span class="row-ico">${cls === "done" ? ICON.check : i + 1}</span>
        <span class="row-main"><span class="row-title">${esc(c.nome)}</span>
          <span class="row-sub">${r.feitos} de ${r.total} itens · ${plural(r.fotos, "foto", "fotos")}</span>
          <span class="mini-bar"><i style="width:${Math.round((r.feitos / r.total) * 100)}%"></i></span></span>
        <span class="row-chev">${ICON.chev}</span></button>`;
    }).join("");
    const m = D.medidores, k = D.chaves;
    const extrasSub = [m.energia.leitura && "energia", m.agua.leitura && "água", k.qtd && plural(Number(k.qtd), "chave", "chaves")].filter(Boolean).join(" · ") || "Opcional";
    app.innerHTML = `
    <header class="topbar">
      <div class="topbar-in"><div><div class="kicker">${esc(C.tipo)} · ${esc(C.codigo)}</div><div class="title">${esc(C.imovel.apelido)}</div></div>
        <button class="icon-btn" data-a="intro" aria-label="Seus dados">${ICON.user}</button></div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="progress-label">${s.feitos} de ${s.total} itens · ${plural(s.fotos, "foto", "fotos")}</div>
    </header>
    <main class="wrap">
      <h2 class="section-title">Cômodos</h2>
      <div class="list">${rows}</div>
      <h2 class="section-title">Complementos</h2>
      <div class="list">
        <button class="row ${D.geral.estado ? "done" : ""}" data-a="geral"><span class="row-ico">${D.geral.estado ? ICON.check : ICON.home}</span>
          <span class="row-main"><span class="row-title">Estado geral e fachada</span><span class="row-sub">${D.geral.estado ? "Estado geral: " + esc(D.geral.estado) : "Obrigatório"} · ${plural(D.geral.fotos.length, "foto", "fotos")}</span></span><span class="row-chev">${ICON.chev}</span></button>
        <button class="row" data-a="extras"><span class="row-ico">${ICON.key}</span>
          <span class="row-main"><span class="row-title">Medidores e chaves</span><span class="row-sub">${esc(extrasSub)}</span></span><span class="row-chev">${ICON.chev}</span></button>
      </div>
    </main>
    <div class="cta-bar"><div><button class="btn btn-primary btn-block" data-a="toSign">${s.falta ? `Revisar e assinar · faltam ${s.falta}` : `${ICON.pen} Revisar e assinar`}</button></div></div>`;
  }

  function itemCard(r, i, nome) {
    const it = D.itens[r][i], ref = `item:${r}:${i}`;
    const showObs = it.obs || openObs.has(`${r}-${i}`);
    const attn = it.estado === "Regular" || it.estado === "Ruim";
    return `<article class="item ${it.estado ? (attn ? "is-attn" : "is-done") : ""}" id="it-${r}-${i}">
      <div class="item-head"><h3>${esc(nome)}</h3>${it.estado ? `<span class="badge est-${CLS[it.estado]}">${it.estado}</span>` : ""}</div>
      <div class="estados">${ESTADOS.map((e) => `<button class="est est-${CLS[e]} ${it.estado === e ? "on" : ""}" data-a="estado" data-r="${r}" data-i="${i}" data-e="${e}">${e}</button>`).join("")}</div>
      <div class="item-actions">${photoBtn(ref)}<button class="btn btn-soft" data-a="obs" data-r="${r}" data-i="${i}">${ICON.note}<span>${it.obs ? "Observação ✓" : "Observação"}</span></button></div>
      ${thumbs(ref)}
      ${showObs ? `<textarea class="obs" data-bind="itens.${r}.${i}.obs" rows="2" placeholder="Descreva o que viu: riscos, manchas, peças soltas...">${esc(it.obs)}</textarea>` : ""}
      ${attn && !it.fotos.length ? `<p class="nudge">Tire ao menos uma foto para comprovar o estado "${it.estado.toLowerCase()}".</p>` : ""}
    </article>`;
  }

  function renderRoom() {
    const r = roomIdx, c = C.imovel.comodos[r], n = C.imovel.comodos.length;
    const falta = D.itens[r].filter((x) => !x.estado).length;
    const next = r < n - 1 ? C.imovel.comodos[r + 1].nome : null;
    app.innerHTML = `
    <header class="topbar">
      <div class="topbar-in"><button class="back" data-a="home">${ICON.back}<span>Cômodos</span></button><span class="topbar-count">${r + 1} de ${n}</span></div>
      <h1 class="room-title">${esc(c.nome)}</h1>
      <div class="progress-label">${D.itens[r].length - falta} de ${D.itens[r].length} itens marcados</div>
    </header>
    <main class="wrap">
      ${falta > 1 ? `<button class="btn btn-ghost btn-block" data-a="fillBom" style="margin-bottom:12px">Marcar os ${falta} itens que faltam como "Bom"</button>` : ""}
      ${c.itens.map((nome, i) => itemCard(r, i, nome)).join("")}
      <section class="card">
        <h2>${ICON.camera} Visão geral do cômodo</h2>
        <p class="hint"><span>Fotos amplas, de cantos opostos, ajudam muito na comparação da saída.</span></p>
        ${photoBtn(`room:${r}`, "Fotos do cômodo")}
        ${thumbs(`room:${r}`)}
        <label class="field" style="margin:14px 0 0"><span>Observações do cômodo <em>opcional</em></span>
          <textarea data-bind="comodos.${r}.obs" rows="2" placeholder="Ex.: cheiro de umidade, mancha no canto do teto...">${esc(D.comodos[r].obs)}</textarea></label>
      </section>
    </main>
    <div class="cta-bar"><div>${next
      ? `<button class="btn btn-primary btn-block" data-a="room" data-i="${r + 1}">Próximo: ${esc(next)} ${ICON.chev}</button>`
      : `<button class="btn btn-primary btn-block" data-a="home">Voltar aos cômodos</button>`}</div></div>`;
  }

  function renderExtras() {
    const m = D.medidores, k = D.chaves;
    const decl = C.tipo === "Saída"
      ? "Declaro que as chaves acima foram devolvidas pelo(a) locatário(a) nesta data."
      : "Declaro que as chaves acima foram entregues ao(à) locatário(a) nesta data.";
    app.innerHTML = `${topbar("Medidores e chaves", "Tudo nesta tela é opcional")}
    <main class="wrap">
      <section class="card"><h2>${ICON.bolt} Medidor de energia</h2>
        <label class="field"><span>Leitura (kWh)</span><input data-bind="medidores.energia.leitura" value="${esc(m.energia.leitura)}" inputmode="decimal" placeholder="Ex.: 012345"></label>
        ${photoBtn("med:energia", "Foto do relógio")}${thumbs("med:energia")}</section>
      <section class="card"><h2>${ICON.drop} Hidrômetro (água)</h2>
        <label class="field"><span>Leitura (m³)</span><input data-bind="medidores.agua.leitura" value="${esc(m.agua.leitura)}" inputmode="decimal" placeholder="Ex.: 00089"></label>
        ${photoBtn("med:agua", "Foto do hidrômetro")}${thumbs("med:agua")}</section>
      <section class="card"><h2>${ICON.key} Chaves</h2>
        <label class="field"><span>Quantidade</span><input type="number" min="0" inputmode="numeric" data-bind="chaves.qtd" value="${esc(k.qtd)}" placeholder="0"></label>
        <label class="field"><span>Quais chaves</span><textarea data-bind="chaves.desc" rows="2" placeholder="Ex.: 2 da porta da sala, 1 do portão, 1 controle do portão">${esc(k.desc)}</textarea></label>
        <label class="check"><input type="checkbox" data-bind="chaves.declarado" ${k.declarado ? "checked" : ""}><span>${decl}</span></label>
      </section>
    </main>
    <div class="cta-bar"><div><button class="btn btn-primary btn-block" data-a="home">Concluir</button></div></div>`;
  }

  function renderGeral() {
    app.innerHTML = `${topbar("Estado geral e fachada", "Como o imóvel está no conjunto")}
    <main class="wrap">
      <section class="card"><h2>Estado geral do imóvel</h2>
        <div class="estados big">${["Ótimo", "Bom", "Regular", "Ruim"].map((e) => `<button class="est est-${CLS[e]} ${D.geral.estado === e ? "on" : ""}" data-a="geralEstado" data-e="${e}">${e}</button>`).join("")}</div>
      </section>
      <section class="card"><h2>${ICON.camera} Fachada e áreas gerais</h2>
        <p class="hint"><span>Frente do imóvel, calçada, vista geral do terreno.</span></p>
        ${photoBtn("geral", "Adicionar fotos")}${thumbs("geral")}</section>
      <section class="card"><h2>${ICON.note} Observações gerais e pendências</h2>
        <textarea data-bind="geral.obs" rows="4" placeholder="Ex.: imóvel entregue limpo; pintura recente; trocar vedação da torneira do banheiro.">${esc(D.geral.obs)}</textarea></section>
    </main>
    <div class="cta-bar"><div><button class="btn btn-primary btn-block" data-a="home">Concluir</button></div></div>`;
  }

  function sigBox(who) {
    return `<div class="sig"><canvas data-sig="${who}"></canvas><div class="sig-line"></div><div class="sig-hint">Assine com o dedo acima da linha</div><button class="sig-clear" data-a="clearSig" data-who="${who}">Limpar</button></div>`;
  }

  function renderAssinar() {
    const s = stats(), counts = contagem(), attn = atencao();
    app.innerHTML = `${topbar("Revisar e assinar", `${s.total} itens · ${plural(s.fotos, "foto", "fotos")}`)}
    <main class="wrap">
      <section class="card"><h2>Resumo</h2>
        <div class="count-row">${ESTADOS.map((e) => `<div class="count est-${CLS[e]}"><b>${counts[e]}</b>${e}</div>`).join("")}</div>
        ${attn.length
          ? `<h3 class="attn-title">Pontos de atenção</h3><ul class="attn">${attn.map((a) => `<li><span class="badge est-${CLS[a.estado]}">${a.estado}</span><span>${esc(a.comodo)} · ${esc(a.item)}${a.fotos ? "" : ' <em class="nofoto">sem foto</em>'}</span></li>`).join("")}</ul>`
          : `<p class="hint" style="margin:0">${ICON.check}<span>Nenhum item regular ou ruim.</span></p>`}
      </section>
      <section class="card"><h2>${ICON.pen} Vistoriador(a)</h2>
        <div class="grid2">
          <label class="field"><span>Nome</span><input data-bind="vistoriador.nome" value="${esc(D.vistoriador.nome)}"></label>
          <label class="field"><span>CPF <em>opcional</em></span><input data-bind="vistoriador.cpf" value="${esc(D.vistoriador.cpf)}" inputmode="numeric"></label>
        </div>${sigBox("vistoriador")}
      </section>
      <section class="card"><h2>${ICON.pen} Locatário(a)</h2>
        <div class="grid2">
          <label class="field"><span>Nome</span><input data-bind="locatario.nome" value="${esc(D.locatario.nome)}"></label>
          <label class="field"><span>CPF <em>opcional</em></span><input data-bind="locatario.cpf" value="${esc(D.locatario.cpf)}" inputmode="numeric"></label>
        </div>
        <label class="field"><span>E-mail do(a) locatário(a)</span><input type="email" data-bind="locatario.email" value="${esc(D.locatario.email)}" inputmode="email" placeholder="Para receber o termo e assinar eletronicamente"></label>
        <label class="check compact"><input type="checkbox" data-bind="locatario.ausente" data-rerender="1" ${D.locatario.ausente ? "checked" : ""}><span>O(a) locatário(a) não está presente e vai assinar eletronicamente depois.</span></label>
        ${D.locatario.ausente ? "" : sigBox("locatario")}
      </section>
      <section class="card note"><b>${esc(C.locadorNome || "O locador")}</b> assina eletronicamente depois que o termo chegar. Com os e-mails preenchidos, todos recebem o convite para a assinatura eletrônica.</section>
      <label class="check"><input type="checkbox" data-bind="declaracao" ${D.declaracao ? "checked" : ""}><span>Declaro que as informações e fotos registradas refletem fielmente o estado do imóvel nesta data.</span></label>
    </main>
    <div class="cta-bar"><div><button class="btn btn-primary btn-block" data-a="send">${ICON.send} Gerar termo e enviar</button></div></div>`;
    mountPads();
  }

  // ---------- assinatura ----------
  function sigPad(canvas, initial, onChange) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#12233d"; ctx.fillStyle = "#12233d";
    if (initial && initial.full) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, rect.width, rect.height); im.src = initial.full; }
    let drawing = false, last = null;
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.onpointerdown = (e) => { drawing = true; canvas.setPointerCapture(e.pointerId); last = pt(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fill(); };
    canvas.onpointermove = (e) => {
      if (!drawing) return;
      const p = pt(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
      ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    };
    // exporta só a área desenhada (sem a margem vazia), para a assinatura ficar grande no PDF
    function trimmed() {
      const { width: w, height: h } = canvas;
      const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        if (px[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return null;
      const pad = 12 * ratio;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w, x1 + pad); y1 = Math.min(h, y1 + pad);
      const out = document.createElement("canvas");
      out.width = x1 - x0; out.height = y1 - y0;
      out.getContext("2d").drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      return { full: canvas.toDataURL("image/png"), crop: out.toDataURL("image/png") };
    }
    const end = () => { if (!drawing) return; drawing = false; onChange(trimmed()); };
    canvas.onpointerup = end; canvas.onpointercancel = end; canvas.onpointerleave = end;
    return { clear() { ctx.clearRect(0, 0, rect.width, rect.height); onChange(null); } };
  }
  function mountPads() {
    pads = {};
    app.querySelectorAll("canvas[data-sig]").forEach((cv) => {
      const who = cv.dataset.sig;
      pads[who] = sigPad(cv, D.assin[who], (url) => { D.assin[who] = url; D.assin[who + "Em"] = url ? new Date().toISOString() : null; save(); });
    });
  }

  // ---------- eventos ----------
  const actions = {
    start() {
      if (!D.vistoriador.nome.trim()) return toast("Informe seu nome para começar", "error");
      D.iniciado = true; save(); go("home");
    },
    intro: () => go("intro"),
    home: () => go("home"),
    room: (t) => go("room", Number(t.dataset.i)),
    extras: () => go("extras"),
    geral: () => go("geral"),
    estado(t) {
      const r = +t.dataset.r, i = +t.dataset.i, e = t.dataset.e, it = D.itens[r][i];
      it.estado = it.estado === e ? "" : e;
      if (it.estado === "Regular" || it.estado === "Ruim") openObs.add(`${r}-${i}`);
      save(); keepScroll(render);
    },
    obs(t) {
      const r = t.dataset.r, i = t.dataset.i, k = `${r}-${i}`;
      if (openObs.has(k) && !D.itens[r][i].obs) openObs.delete(k); else openObs.add(k);
      keepScroll(render);
      const ta = app.querySelector(`[data-bind="itens.${r}.${i}.obs"]`);
      if (ta) ta.focus({ preventScroll: true });
    },
    fillBom() {
      let n = 0;
      D.itens[roomIdx].forEach((i) => { if (!i.estado) { i.estado = "Bom"; n++; } });
      save(); keepScroll(render); toast(`${n} itens marcados como Bom`, "ok");
    },
    geralEstado(t) { D.geral.estado = D.geral.estado === t.dataset.e ? "" : t.dataset.e; save(); keepScroll(render); },
    async delPhoto(t) {
      if (!confirm("Remover esta foto?")) return;
      const list = refList(t.dataset.ref), id = t.dataset.id, ix = list.indexOf(id);
      if (ix >= 0) list.splice(ix, 1);
      delete D.photos[id];
      await idb.del(pk(id)).catch(() => {});
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
      save(); keepScroll(render);
    },
    toSign() {
      const s = stats();
      if (s.falta) {
        const r = D.itens.findIndex((x) => x.some((i) => !i.estado));
        toast(`Faltam ${s.falta} itens. Começando por ${C.imovel.comodos[r].nome}.`, "warn");
        go("room", r);
        const i = D.itens[r].findIndex((x) => !x.estado);
        setTimeout(() => document.getElementById(`it-${r}-${i}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
        return;
      }
      if (!D.geral.estado) { toast("Falta informar o estado geral do imóvel", "warn"); return go("geral"); }
      go("assinar");
    },
    clearSig: (t) => pads[t.dataset.who]?.clear(),
    send: () => enviar(),
    retry: () => enviar(),
    backToSign: () => go("assinar"),
    downloadPdf() {
      if (!lastPdf) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(lastPdf); a.download = nomeArquivo() + ".pdf";
      document.body.appendChild(a); a.click(); a.remove();
    },
  };
  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-a]");
    if (!t || !app.contains(t)) return;
    const fn = actions[t.dataset.a];
    if (fn) { e.preventDefault(); fn(t, e); }
  });
  app.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.bind && t.type !== "checkbox") setPath(t.dataset.bind, t.value);
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type === "file" && t.dataset.ref) { const files = [...t.files]; t.value = ""; addPhotos(files, t.dataset.ref); return; }
    if (t.dataset.bind && t.type === "checkbox") { setPath(t.dataset.bind, t.checked); if (t.dataset.rerender) keepScroll(render); }
  });

  // ---------- PDF ----------
  function nomeArquivo() {
    return `Termo de Vistoria ${C.tipo} - ${C.imovel.apelido} - ${fmtData(D.data).replace(/\//g, "-")}`.replace(/[\\/:*?"<>|]/g, "-");
  }
  async function gerarPDF(onProg) {
    const fotos = [];
    let n = 0;
    const add = (id, caption) => {
      n++;
      fotos.push({ id, num: n, caption, nome: `${String(n).padStart(3, "0")} - ${caption}`.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120) + ".jpg" });
      return n;
    };
    const rooms = C.imovel.comodos.map((c, r) => {
      const itens = c.itens.map((nome, i) => {
        const it = D.itens[r][i];
        return { nome, estado: it.estado, obs: it.obs.trim(), fotoNums: it.fotos.map((id) => add(id, `${c.nome} · ${nome}`)) };
      });
      const gerais = D.comodos[r].fotos.map((id) => add(id, `${c.nome} · visão geral`));
      return { nome: c.nome, obs: D.comodos[r].obs.trim(), itens, nums: [...itens.flatMap((i) => i.fotoNums), ...gerais] };
    });
    const medE = D.medidores.energia.fotos.map((id) => add(id, "Medidor de energia"));
    const medA = D.medidores.agua.fotos.map((id) => add(id, "Hidrômetro"));
    const ger = D.geral.fotos.map((id) => add(id, "Fachada e áreas gerais"));

    const imgs = {};
    for (let k = 0; k < fotos.length; k++) {
      onProg(`Preparando foto ${k + 1} de ${fotos.length}`);
      const b = await idb.get(pk(fotos[k].id));
      if (!b) continue;
      const s = await compress(b, 1100, 0.72);
      imgs[fotos[k].num] = { dataUrl: await toDataURL(s.blob), w: s.w, h: s.h };
    }
    const pick = (nums) => nums.map((num) => ({ num, caption: fotos[num - 1].caption, ...(imgs[num] || {}) }));
    const quando = (iso) => (iso ? fmtDataHora(new Date(iso)) : "");
    const s = stats();
    const leit = (v, u) => (v.trim() ? `${v.trim()} ${u}` : "");
    const data = {
      codigo: C.codigo, tipo: C.tipo, dataVistoria: fmtData(D.data), geradoEm: fmtDataHora(new Date()),
      imovel: { apelido: C.imovel.apelido, endereco: C.imovel.endereco },
      locador: { nome: C.locadorNome || "", cpf: C.locadorCpf || "" },
      locatario: { nome: D.locatario.nome.trim(), cpf: D.locatario.cpf.trim(), assinatura: D.locatario.ausente || !D.assin.locatario ? null : D.assin.locatario.crop, assinadoEm: quando(D.assin.locatarioEm) },
      vistoriador: { nome: D.vistoriador.nome.trim(), cpf: D.vistoriador.cpf.trim(), assinatura: D.assin.vistoriador ? D.assin.vistoriador.crop : null, assinadoEm: quando(D.assin.vistoriadorEm) },
      rooms: rooms.map((r) => ({ nome: r.nome, obs: r.obs, itens: r.itens, fotos: pick(r.nums) })),
      medidores: { energia: { leitura: leit(D.medidores.energia.leitura, "kWh"), fotoNums: medE }, agua: { leitura: leit(D.medidores.agua.leitura, "m3"), fotoNums: medA } },
      chaves: { qtd: String(D.chaves.qtd || "").trim(), desc: D.chaves.desc.trim(), declarado: D.chaves.declarado },
      geral: { estado: D.geral.estado, obs: D.geral.obs.trim() },
      extraFotos: pick([...medE, ...medA, ...ger]),
      totais: { itens: s.total, fotos: fotos.length },
    };
    onProg("Montando o documento");
    await new Promise((r) => setTimeout(r, 30));
    const doc = await window.buildVistoriaPDF(window.jspdf.jsPDF, data);
    const strip = (arr) => arr.map((f) => ({ num: f.num, caption: f.caption }));
    lastData = {
      ...data,
      rooms: data.rooms.map((r) => ({ ...r, fotos: strip(r.fotos) })),
      extraFotos: strip(data.extraFotos),
      locatario: { nome: data.locatario.nome, cpf: data.locatario.cpf, assinouNaTela: !!data.locatario.assinatura },
      vistoriador: { nome: data.vistoriador.nome, cpf: data.vistoriador.cpf, assinouNaTela: !!data.vistoriador.assinatura },
    };
    return { blob: doc.output("blob"), fotos };
  }

  // ---------- envio ----------
  const STEPS = [["pdf", "Montando o termo em PDF"], ["pasta", "Criando a pasta no Google Drive"], ["fotos", "Enviando as fotos"], ["upload", "Enviando o termo"], ["fim", "Finalizando"]];
  function setStep(k) {
    const idx = STEPS.findIndex((s) => s[0] === k);
    STEPS.forEach(([s], j) => (sendState.st[s] = j < idx ? "ok" : j === idx ? "run" : "wait"));
    sendState.cur = k; sendState.detail = ""; renderSend();
  }
  function renderSend() {
    const s = sendState;
    app.innerHTML = `
    <header class="hero slim"><div class="hero-in"><div class="kicker">${esc(C.codigo)}</div>
      <h1>${s.error ? "Envio interrompido" : "Enviando a vistoria"}</h1>
      <p>${s.error ? "Nada foi perdido. Tudo continua salvo neste celular." : "Mantenha esta tela aberta até terminar."}</p></div></header>
    <main class="wrap">
      <section class="card"><ul class="steps">${STEPS.map(([k, label]) => {
        const st = s.st[k] || "wait";
        const dot = st === "ok" ? ICON.check : st === "run" ? '<i class="spin"></i>' : st === "err" ? "!" : "";
        return `<li class="step ${st}"><span class="dot">${dot}</span><div><div>${label}</div>
          ${st === "run" && s.detail ? `<div class="step-sub">${esc(s.detail)}</div>` : ""}
          ${k === "fotos" && st === "run" ? `<div class="mini-bar"><i style="width:${s.pct}%"></i></div>` : ""}</div></li>`;
      }).join("")}</ul></section>
      ${s.error ? `<div class="banner error">${ICON.alert}<div>${esc(s.error)}</div></div>
        <button class="btn btn-primary btn-block" data-a="retry">Tentar de novo</button>
        ${lastPdf ? `<button class="btn btn-soft btn-block mt" data-a="downloadPdf">${ICON.file} Baixar o PDF neste celular</button>` : ""}
        <button class="btn btn-ghost btn-block mt" data-a="backToSign">Voltar e revisar</button>` : ""}
    </main>`;
  }

  function validar() {
    if (!D.vistoriador.nome.trim()) return "Informe o nome do vistoriador.";
    if (!D.assin.vistoriador) return "Falta a assinatura do vistoriador.";
    if (!D.locatario.nome.trim()) return "Informe o nome do(a) locatário(a).";
    if (!D.locatario.ausente && !D.assin.locatario) return "Falta a assinatura do(a) locatário(a). Se ele(a) não estiver presente, marque a opção acima da assinatura.";
    const mail = (e) => !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
    if (!mail(D.vistoriador.email || "")) return "O e-mail do vistoriador parece incompleto.";
    if (!mail(D.locatario.email || "")) return "O e-mail do(a) locatário(a) parece incompleto.";
    if (!D.declaracao) return "Marque a declaração no fim da página.";
    return "";
  }
  function resumo() {
    const s = stats();
    return {
      itens: s.total, fotos: s.fotos, porEstado: contagem(), estadoGeral: D.geral.estado,
      atencao: atencao().map((a) => ({ comodo: a.comodo, item: a.item, estado: a.estado })),
      locatarioAssinou: !D.locatario.ausente && !!D.assin.locatario,
    };
  }

  async function enviar() {
    if (sending) return;
    const erro = validar();
    if (erro) return toast(erro, "error");
    sending = true; screen = "envio";
    sendState = { st: {}, cur: "pdf", detail: "", pct: 0, error: null };
    window.scrollTo(0, 0);
    try {
      setStep("pdf");
      const { blob, fotos } = await gerarPDF((t) => { sendState.detail = t; renderSend(); });
      lastPdf = blob;

      setStep("pasta");
      await retry(() => call("POST", `/api/v/${token}/start`, { vistoriador: D.vistoriador.nome.trim(), data: D.data }));

      setStep("fotos");
      for (let k = 0; k < fotos.length; k++) {
        const f = fotos[k];
        sendState.detail = `${k + 1} de ${fotos.length}`; sendState.pct = Math.round((k / fotos.length) * 100); renderSend();
        if (D.uploaded[f.id]) continue;
        const b = await idb.get(pk(f.id));
        if (!b) continue;
        const r = await retry(() => call("POST", `/api/v/${token}/photo?name=${encodeURIComponent(f.nome)}`, b, true));
        D.uploaded[f.id] = r.id; save();
      }

      setStep("upload");
      await retry(() => call("POST", `/api/v/${token}/pdf-init`, { size: blob.size, name: nomeArquivo() + ".pdf" }));
      const CH = 2 * 1024 * 1024;
      let off = 0;
      while (off < blob.size) {
        sendState.detail = `${Math.round((off / blob.size) * 100)}%`; renderSend();
        const part = blob.slice(off, Math.min(blob.size, off + CH));
        const at = off;
        const r = await retry(() => call("PUT", `/api/v/${token}/pdf-chunk?offset=${at}`, part, true), 2);
        if (r.done) break;
        off = r.next;
      }

      setStep("fim");
      const partes = {
        vistoriador: { ...D.vistoriador, assinouNaTela: !!D.assin.vistoriador },
        locatario: { nome: D.locatario.nome, cpf: D.locatario.cpf, email: D.locatario.email, assinouNaTela: !D.locatario.ausente && !!D.assin.locatario },
      };
      await retry(() => call("POST", `/api/v/${token}/finish`, { resumo: resumo(), dados: lastData, partes }));
      await limpar();
      renderFim(fotos.length);
    } catch (e) {
      console.error(e);
      sendState.error = e.message || "Falha no envio.";
      sendState.st[sendState.cur] = "err";
      renderSend();
    } finally { sending = false; }
  }

  async function limpar() {
    for (const id of Object.keys(D.photos)) await idb.del(pk(id)).catch(() => {});
    await idb.del("draft:" + token).catch(() => {});
  }
  function renderFim(nFotos) {
    app.innerHTML = `<main class="wrap center done">
      <div class="done-ico">${ICON.check}</div>
      <h1>Vistoria enviada</h1>
      <p>O termo em PDF e ${plural(nFotos, "foto", "fotos")} já estão no Google Drive do responsável pelo imóvel. Ele envia o convite de assinatura eletrônica por e-mail a partir daqui.</p>
      ${lastPdf ? `<button class="btn btn-soft btn-block" data-a="downloadPdf">${ICON.file} Baixar uma cópia do PDF</button>` : ""}
    </main>`;
  }

  // ---------- início ----------
  async function init() {
    if (!token) return renderMsg("Link incompleto", "Abra a vistoria pelo link que você recebeu do responsável pelo imóvel.");
    let res;
    try {
      res = await call("GET", `/api/v/${encodeURIComponent(token)}`);
      idb.set("cfg:" + token, res).catch(() => {});
    } catch (e) {
      const cached = e.fatal ? null : await idb.get("cfg:" + token).catch(() => null);
      if (!cached) return renderMsg("Não foi possível abrir", e.message);
      res = cached;
      toast("Sem internet: usando os dados salvos no celular", "warn");
    }
    C = res.vistoria;
    if (C.status === "concluida") {
      return renderMsg("Vistoria já enviada", `Esta vistoria foi concluída${C.concluidaEm ? " em " + fmtDataHora(new Date(C.concluidaEm)) : ""}. Se precisar refazer, peça um novo link ao responsável.`);
    }
    D = await idb.get("draft:" + token).catch(() => null);
    if (!D || D.v !== 2) D = newDraft();
    screen = D.iniciado ? "home" : "intro";
    render();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  init();
})();
