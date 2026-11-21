/* Sistema de Vistorias — painel do proprietário */
"use strict";
(() => {
  const app = document.getElementById("app");
  let KEY = sessionStorage.getItem("vst-admin") || "";
  let S = null, tab = "vistorias", editing = null, created = null, preImovel = "";
  let signing = null; // { id, signers: [{papel, nome, email, on}], message, busy, step }

  const PRESETS = {
    "Sala": ["Piso", "Paredes e pintura", "Teto", "Porta e fechadura", "Janelas e vidros", "Tomadas e interruptores", "Iluminação"],
    "Quarto": ["Piso", "Paredes e pintura", "Teto", "Porta e fechadura", "Janelas e vidros", "Armário embutido", "Tomadas e interruptores", "Iluminação"],
    "Cozinha": ["Piso", "Paredes e azulejos", "Teto", "Porta e fechadura", "Janelas e vidros", "Pia e torneira", "Armários", "Tomadas e interruptores", "Iluminação", "Ralos"],
    "Banheiro": ["Piso", "Paredes e azulejos", "Teto", "Porta e fechadura", "Janela / ventilação", "Vaso sanitário e descarga", "Pia e torneira", "Box e chuveiro", "Espelho e acessórios", "Tomadas e iluminação", "Ralos"],
    "Área de serviço": ["Piso", "Paredes", "Tanque e torneira", "Ponto da máquina de lavar", "Iluminação", "Ralos"],
    "Garagem / quintal": ["Piso / pavimentação", "Muros", "Portão e fechadura", "Iluminação externa", "Ralos e escoamento"],
    "Varanda": ["Piso", "Teto / cobertura", "Guarda-corpo", "Iluminação"],
    "Instalações gerais": ["Quadro de energia (disjuntores)", "Caixa d'água", "Interfone / campainha"],
  };

  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    home: svg('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    wa: svg('<path d="M21 12a9 9 0 0 1-13.4 7.9L3 21l1.2-4.4A9 9 0 1 1 21 12z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>'),
    share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v14"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
    file: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    up: svg('<path d="M18 15l-6-6-6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    alert: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
    cloud: svg('<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.7A4 4 0 0 0 6.5 19z"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    pen: svg('<path d="M3 17c3-3 5-8 8-8s-1 9 2 9 3-4 5-4 2 2 3 2"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") : "");
  const linkOf = (v) => `${location.origin}/?v=${v.token}`;
  const findV = (id) => S.vistorias.find((v) => v.id === id) || (created && created.id === id ? created : null);

  let toastT;
  function toast(msg, kind = "") {
    const t = document.getElementById("toast");
    t.textContent = msg; t.className = "toast show " + kind;
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast " + kind), 3400);
  }
  async function api(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: { "x-admin-key": KEY, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null;
    try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok || (j && j.ok === false)) { const e = new Error((j && j.erro) || `Erro ${r.status}`); e.status = r.status; throw e; }
    return j;
  }
  async function copiar(text, msg = "Link copiado") {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const i = document.createElement("textarea"); i.value = text; document.body.appendChild(i); i.select(); document.execCommand("copy"); i.remove(); }
    toast(msg, "ok");
  }
  function msgVistoria(v) {
    const nome = v.vistoriadorNome ? ", " + v.vistoriadorNome.split(" ")[0] : "";
    return `Olá${nome}! Segue o link da vistoria de ${v.tipo.toLowerCase()} do imóvel ${v.imovel.apelido} (${v.imovel.endereco}):\n\n${linkOf(v)}\n\nAbra no celular e siga cômodo por cômodo, marcando o estado de cada item e tirando as fotos. Tudo fica salvo no aparelho, então pode pausar e voltar pelo mesmo link. No final, confira o seu e-mail e o do(a) locatário(a) e envie: o termo chega pra mim e todos recebem o convite para assinar eletronicamente.`;
  }
  const waLink = (v) => "https://wa.me/?text=" + encodeURIComponent(msgVistoria(v));

  // ---------- login ----------
  function renderLogin(err) {
    app.innerHTML = `<main class="login"><div class="login-card">
      <div class="brand-mark">${ICON.home}</div>
      <h1>Painel de vistorias</h1><p>Acesso do proprietário.</p>
      <form id="login-form"><label class="field"><span>Senha</span><input type="password" id="pw" autocomplete="current-password" required autofocus></label>
      <button class="btn btn-primary btn-block">Entrar</button></form>
      ${err ? `<div class="banner error mt">${ICON.alert}<div>${esc(err)}</div></div>` : ""}
    </div></main>`;
  }

  // ---------- estrutura ----------
  async function refresh() { S = await api("GET", "/api/admin/state"); render(); }
  function render() {
    const tabs = [["vistorias", "Vistorias"], ["imoveis", "Imóveis"], ["config", "Configurações"]];
    const body = tab === "imoveis" ? tabImoveis() : tab === "config" ? tabConfig() : tabVistorias();
    app.innerHTML = `
    <header class="adm-top">
      <div class="adm-top-in">
        <div class="brand-row"><span class="brand-mark">${ICON.home}</span><div><div class="kicker">Sistema de vistorias</div><div style="font-weight:800;font-size:18px">Painel do proprietário</div></div></div>
        <button class="btn btn-soft" style="min-height:38px;padding:0 12px" data-a="logout">Sair</button>
      </div>
      <nav class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? "on" : ""}" data-a="tab" data-t="${k}">${l}</button>`).join("")}</nav>
    </header>
    <main class="wrap wide">${body}</main>`;
  }

  // ---------- vistorias ----------
  const STATUS = {
    aguardando: ["Link ainda não aberto", "gray"], aberta: ["Em preenchimento", "amber"],
    enviando: ["Enviando", "blue"], concluida: ["Concluída", "green"],
  };
  function linkCard(v) {
    return `<section class="card accent" id="link-card">
      <div class="card-kicker">Link pronto · ${esc(v.codigo)}</div>
      <h2 style="margin-bottom:4px">${esc(v.imovel.apelido)}</h2>
      <p class="meta" style="margin-bottom:12px">Vistoria de ${esc(v.tipo.toLowerCase())}. Este link mostra só este imóvel.</p>
      <div class="linkbox"><input readonly value="${esc(linkOf(v))}"><button class="btn btn-soft" data-a="copy" data-id="${v.id}">${ICON.copy}</button></div>
      <div class="row-btns">
        <a class="btn btn-wa" href="${waLink(v)}" target="_blank" rel="noopener">${ICON.wa} Enviar no WhatsApp</a>
        ${navigator.share ? `<button class="btn btn-soft" data-a="share" data-id="${v.id}">${ICON.share} Compartilhar</button>` : ""}
        <a class="btn btn-ghost" href="${esc(linkOf(v))}" target="_blank" rel="noopener">Ver como o vistoriador</a>
      </div>
    </section>`;
  }
  function assinaturaBloco(v) {
    const a = v.assinafy;
    if (signing && signing.id === v.id) {
      const s = signing;
      return `<div class="sign-box">
        <h4>${ICON.pen} Enviar para assinatura eletrônica</h4>
        <p class="hint small" style="margin:0 0 10px">Cada pessoa marcada recebe um e-mail da Assinafy com o termo para assinar.</p>
        ${s.signers.map((p, k) => `<div class="signer-row">
          <label class="signer-on"><input type="checkbox" data-sg="${k}" data-f="on" ${p.on ? "checked" : ""}><span>${esc(p.papel)}</span></label>
          <div class="grid2"><input data-sg="${k}" data-f="nome" value="${esc(p.nome)}" placeholder="Nome completo"><input type="email" inputmode="email" data-sg="${k}" data-f="email" value="${esc(p.email)}" placeholder="E-mail"></div>
        </div>`).join("")}
        <label class="field" style="margin:10px 0 0"><span>Mensagem no convite</span><textarea data-sgmsg rows="2">${esc(s.message)}</textarea></label>
        <div class="row-btns">
          <button class="btn btn-primary" data-a="afSend" data-id="${v.id}" ${s.busy ? "disabled" : ""}>${s.busy ? '<i class="spin"></i> ' + esc(s.step) : ICON.pen + " Enviar convites"}</button>
          <button class="btn btn-ghost" data-a="afCancel" ${s.busy ? "disabled" : ""}>Cancelar</button>
        </div></div>`;
    }
    if (!a || !a.status || a.status === "processando") {
      return S.assinafy.configured
        ? `<div class="row-btns"><button class="btn btn-gold" data-a="afOpen" data-id="${v.id}">${ICON.pen} Enviar para assinatura</button></div>`
        : `<p class="hint small">Para enviar à assinatura eletrônica, configure a Assinafy em Configurações.</p>`;
    }
    if (a.status === "assinado") {
      return `<div class="sign-status ok">${ICON.check}<div><b>Assinado por todos</b> em ${dt(a.assinadoEm)}</div></div>
        <div class="row-btns">${a.signedLink ? `<a class="btn btn-primary" href="${esc(a.signedLink)}" target="_blank" rel="noopener">${ICON.file} PDF assinado</a>` : ""}</div>`;
    }
    const quem = (a.signers || []).map((s) => esc(s.nome.split(" ")[0])).join(", ");
    return `<div class="sign-status ${a.status === "problema" ? "bad" : "wait"}">${a.status === "problema" ? ICON.alert : ICON.pen}<div>
        <b>${a.status === "problema" ? "Assinatura com problema" : "Aguardando assinaturas"}</b>${quem ? ` · ${quem}` : ""}
        <div class="meta">Convites enviados em ${dt(a.enviadoEm)}${a.docStatus ? " · status na Assinafy: " + esc(a.docStatus) : ""}</div></div></div>
      <div class="row-btns"><button class="btn btn-soft" data-a="afCheck" data-id="${v.id}">${ICON.refresh} Verificar assinaturas</button></div>`;
  }
  function vCard(v) {
    const [lbl, cls] = STATUS[v.status] || [v.status, "gray"];
    const r = v.resumo;
    const done = v.status === "concluida";
    const attn = r && r.atencao ? r.atencao.length : 0;
    return `<article class="vcard">
      <div class="vcard-top"><span class="code">${esc(v.codigo)}</span><span class="status ${cls}">${lbl}</span></div>
      <h3>${esc(v.imovel.apelido)}</h3>
      <p class="meta">${esc(v.tipo)} · criada em ${dt(v.criadaEm)}${v.vistoriadorNome ? " · " + esc(v.vistoriadorNome) : ""}</p>
      ${done ? `<p class="meta strong">Enviada em ${dt(v.concluidaEm)}${r ? ` · ${r.itens} itens · ${r.fotos} fotos${attn ? ` · <span class="warn-t">${attn} ponto${attn > 1 ? "s" : ""} de atenção</span>` : ""}` : ""}</p>` : ""}
      <div class="row-btns">
        ${done
          ? `${v.pdfLink ? `<a class="btn btn-primary" href="${esc(v.pdfLink)}" target="_blank" rel="noopener">${ICON.file} Abrir PDF</a>` : ""}${v.folderLink ? `<a class="btn btn-soft" href="${esc(v.folderLink)}" target="_blank" rel="noopener">${ICON.folder} Pasta com fotos</a>` : ""}`
          : `<button class="btn btn-soft" data-a="copy" data-id="${v.id}">${ICON.copy} Copiar link</button><a class="btn btn-wa" href="${waLink(v)}" target="_blank" rel="noopener">${ICON.wa} WhatsApp</a>`}
        <button class="btn btn-ghost danger" data-a="delV" data-id="${v.id}" aria-label="Excluir">${ICON.trash}</button>
      </div>
      ${done ? assinaturaBloco(v) : ""}
    </article>`;
  }
  function tabVistorias() {
    const banner = !S.google.connected
      ? `<div class="banner warn">${ICON.alert}<div><b>Google Drive não conectado.</b> O vistoriador consegue preencher, mas não consegue enviar até você conectar. <button class="link" data-a="tab" data-t="config">Conectar agora</button></div></div>`
      : !S.assinafy.configured
        ? `<div class="banner warn">${ICON.alert}<div><b>Assinafy não configurada.</b> As vistorias chegam ao Drive, mas os convites de assinatura não saem. <button class="link" data-a="tab" data-t="config">Ver como configurar</button></div></div>`
        : !S.settings.locadorEmail
          ? `<div class="banner warn">${ICON.alert}<div><b>Falta o seu e-mail.</b> Sem ele, você não entra como signatário quando o vistoriador envia o termo. <button class="link" data-a="tab" data-t="config">Cadastrar agora</button></div></div>` : "";
    return `${banner}
    <section class="card">
      <h2>${ICON.link} Nova vistoria</h2>
      <p class="hint"><span>Escolha o imóvel e envie o link. O vistoriador só vê o imóvel deste link.</span></p>
      ${S.imoveis.length ? `<form id="nova-form">
        <label class="field"><span>Imóvel</span><select name="imovelId">${S.imoveis.map((i) => `<option value="${esc(i.id)}" ${i.id === preImovel ? "selected" : ""}>${esc(i.apelido)} — ${esc(i.endereco)}</option>`).join("")}</select></label>
        <div class="grid2">
          <div class="field"><span>Tipo</span><div class="seg"><label><input type="radio" name="tipo" value="Entrada" checked><span>Entrada</span></label><label><input type="radio" name="tipo" value="Saída"><span>Saída</span></label></div></div>
          <label class="field"><span>Nome do vistoriador <em>opcional</em></span><input name="vistoriadorNome" placeholder="Já vem preenchido para ele"></label>
        </div>
        <button class="btn btn-primary btn-block">${ICON.link} Criar link da vistoria</button>
      </form>` : `<p class="empty">Cadastre um imóvel primeiro. <button class="link" data-a="tab" data-t="imoveis">Ir para Imóveis</button></p>`}
    </section>
    ${created ? linkCard(created) : ""}
    <h2 class="section-title">Histórico</h2>
    ${S.vistorias.length ? `<div class="vlist">${S.vistorias.map(vCard).join("")}</div>` : `<p class="empty">Nenhuma vistoria criada ainda.</p>`}`;
  }

  // ---------- imóveis ----------
  function tabImoveis() {
    if (editing) return editor();
    return `<div class="row-head"><h2 class="section-title">Imóveis</h2><button class="btn btn-primary" data-a="newIm">${ICON.plus} Cadastrar imóvel</button></div>
    ${S.imoveis.length ? S.imoveis.map((i) => {
      const itens = i.comodos.reduce((s, c) => s + c.itens.length, 0);
      return `<article class="vcard"><h3 style="margin-top:0">${esc(i.apelido)}</h3><p class="meta">${esc(i.endereco)}</p>
        <p class="meta">${i.locatario ? "Locatário(a): " + esc(i.locatario) + " · " : ""}${i.comodos.length} cômodos · ${itens} itens</p>
        <div class="row-btns"><button class="btn btn-primary" data-a="vistoriar" data-id="${esc(i.id)}">${ICON.link} Nova vistoria</button><button class="btn btn-soft" data-a="editIm" data-id="${esc(i.id)}">${ICON.edit} Editar</button></div></article>`;
    }).join("") : `<p class="empty">Nenhum imóvel cadastrado.</p>`}`;
  }
  function editor() {
    const e = editing;
    return `<div class="row-head"><button class="back dark" data-a="cancelEdit">${ICON.back}<span>Imóveis</span></button></div>
    <section class="card">
      <h2>${e.id ? "Editar imóvel" : "Novo imóvel"}</h2>
      <label class="field"><span>Apelido</span><input data-e="apelido" value="${esc(e.apelido)}" placeholder="Ex.: Casa Peruíbe"></label>
      <label class="field"><span>Endereço completo</span><textarea data-e="endereco" rows="2" placeholder="Rua, número, bairro, cidade-UF, CEP">${esc(e.endereco)}</textarea></label>
      <div class="grid2">
        <label class="field"><span>Locatário(a)</span><input data-e="locatario" value="${esc(e.locatario)}"></label>
        <label class="field"><span>CPF do locatário <em>opcional</em></span><input data-e="locatarioCpf" value="${esc(e.locatarioCpf)}" inputmode="numeric"></label>
      </div>
      <label class="field"><span>E-mail do(a) locatário(a) <em>para a assinatura eletrônica</em></span><input type="email" data-e="locatarioEmail" value="${esc(e.locatarioEmail || "")}" inputmode="email"></label>
      <p class="hint small">Mudanças aqui valem para os próximos links. Links já enviados continuam com os cômodos da época.</p>
    </section>
    <h2 class="section-title">Cômodos · ${e.comodos.length}</h2>
    <p class="hint"><span>Um item por linha. O vistoriador marca o estado e fotografa cada um.</span></p>
    ${e.comodos.map((c, k) => `<section class="card" id="room-${k}">
      <div class="room-ed-head"><input data-room="${k}" value="${esc(c.nome)}" placeholder="Nome do cômodo">
        <div class="mini-btns">
          <button class="icon-btn plain" data-a="mvRoom" data-k="${k}" data-d="-1" ${k === 0 ? "disabled" : ""} aria-label="Subir">${ICON.up}</button>
          <button class="icon-btn plain" data-a="mvRoom" data-k="${k}" data-d="1" ${k === e.comodos.length - 1 ? "disabled" : ""} aria-label="Descer">${ICON.down}</button>
          <button class="icon-btn plain danger" data-a="rmRoom" data-k="${k}" aria-label="Remover cômodo">${ICON.trash}</button>
        </div></div>
      <textarea class="room-items" data-items="${k}" rows="${Math.max(3, c.itens.length)}">${esc(c.itens.join("\n"))}</textarea>
    </section>`).join("")}
    <section class="card"><label class="field" style="margin:0"><span>Adicionar cômodo</span>
      <div class="inline"><select id="preset">${Object.keys(PRESETS).map((p) => `<option>${p}</option>`).join("")}<option value="">Em branco</option></select>
      <button class="btn btn-soft" data-a="addRoom">${ICON.plus} Adicionar</button></div></label></section>
    <div class="cta-bar"><div>${e.id ? `<button class="btn btn-ghost danger" style="background:#fff" data-a="delIm" aria-label="Excluir imóvel">${ICON.trash}</button>` : ""}<button class="btn btn-primary btn-grow" data-a="saveIm">Salvar imóvel</button></div></div>`;
  }

  // ---------- configurações ----------
  function tabConfig() {
    const g = S.google, st = S.setup;
    const faltam = [!st.clientId && "GOOGLE_CLIENT_ID", !st.clientSecret && "GOOGLE_CLIENT_SECRET"].filter(Boolean);
    return `<section class="card">
      <div class="card-head"><h2>${ICON.cloud} Google Drive</h2><span class="status ${g.connected ? "green" : "gray"}">${g.connected ? "Conectado" : "Desconectado"}</span></div>
      ${g.connected
        ? `<p style="margin-bottom:4px">Conectado como <b>${esc(g.email || "sua conta Google")}</b>.</p><p class="meta">As vistorias ficam na pasta <b>Vistorias de Imóveis</b>, uma subpasta por imóvel.</p>
           <div class="row-btns">${g.rootLink ? `<a class="btn btn-soft" href="${esc(g.rootLink)}" target="_blank" rel="noopener">${ICON.folder} Abrir pasta</a>` : ""}<button class="btn btn-soft" data-a="connect">Reconectar</button><button class="btn btn-ghost danger" data-a="disconnect">Desconectar</button></div>`
        : faltam.length
          ? `<div class="banner warn">${ICON.alert}<div>Faltam variáveis na Netlify: <b>${faltam.join(", ")}</b>. Siga o passo a passo abaixo e faça um novo deploy.</div></div>`
          : `<p class="meta" style="margin-bottom:12px">Você vai autorizar o app a criar arquivos no seu Drive. Ele só enxerga os arquivos que ele mesmo cria.</p><button class="btn btn-primary btn-block" data-a="connect">${ICON.cloud} Conectar Google Drive</button>`}
      <div class="field" style="margin:16px 0 0"><span>URI de redirecionamento (cole no Google Cloud)</span>
        <div class="linkbox"><input readonly value="${esc(st.redirectUri)}"><button class="btn btn-soft" data-a="copyText" data-text="${esc(st.redirectUri)}">${ICON.copy}</button></div></div>
    </section>
    <section class="card"><h2>${ICON.user} Locador</h2><p class="hint"><span>Aparece no bloco de assinaturas do termo.</span></p>
      <form id="loc-form"><div class="grid2">
        <label class="field"><span>Nome completo</span><input name="locadorNome" value="${esc(S.settings.locadorNome)}"></label>
        <label class="field"><span>CPF <em>opcional</em></span><input name="locadorCpf" value="${esc(S.settings.locadorCpf)}" inputmode="numeric"></label>
      </div>
      <label class="field"><span>E-mail <em>para receber o convite de assinatura</em></span><input type="email" name="locadorEmail" value="${esc(S.settings.locadorEmail)}" inputmode="email"></label>
      <button class="btn btn-primary">Salvar</button></form></section>
    <section class="card">
      <div class="card-head"><h2>${ICON.pen} Assinafy</h2><span class="status ${S.assinafy.configured ? "green" : "gray"}">${S.assinafy.configured ? "Configurada" : "Não configurada"}</span></div>
      ${S.assinafy.configured
        ? `<p class="meta">Pronta. Quando o vistoriador envia a vistoria, os convites de assinatura saem automaticamente para você, o(a) locatário(a) e o vistoriador. Se algum envio falhar, use <b>Enviar para assinatura</b> no histórico.</p>
           ${S.assinafy.webhookUrl
             ? `<div class="field" style="margin:14px 0 0"><span>URL do webhook (cole na Assinafy › Integrações › Webhooks)</span>
                 <div class="linkbox"><input readonly value="${esc(S.assinafy.webhookUrl)}"><button class="btn btn-soft" data-a="copyText" data-text="${esc(S.assinafy.webhookUrl)}">${ICON.copy}</button></div></div>
                <p class="hint small">Eventos a ligar: <code>document_ready</code>, <code>signer_signed_document</code>, <code>signer_rejected_document</code>, <code>user_rejected_document</code>, <code>document_processing_failed</code>.</p>`
             : `<p class="hint small">Opcional: crie a variável <code>ASSINAFY_WEBHOOK_SECRET</code> na Netlify para o PDF assinado ir sozinho para o Drive. Sem ela, use o botão <b>Verificar assinaturas</b>.</p>`}`
        : `<ol class="howto">
            <li>Na Assinafy, em <b>Configurações › API</b>, gere uma <b>chave de API</b> e copie o <b>ID da conta (workspace)</b>.</li>
            <li>Na Netlify, crie as variáveis <code>ASSINAFY_API_KEY</code> e <code>ASSINAFY_ACCOUNT_ID</code>.</li>
            <li>Para testar sem gastar créditos, crie também <code>ASSINAFY_BASE_URL</code> com o endereço do sandbox deles. Apague depois de testar.</li>
            <li>Faça um novo deploy.</li>
          </ol>`}
    </section>
    <section class="card"><details ${g.connected ? "" : "open"}><summary><h2>Passo a passo do Google Cloud</h2></summary>
      <ol class="howto">
        <li>Acesse <b>console.cloud.google.com</b> e crie um projeto (ex.: "Vistorias").</li>
        <li>Em <b>APIs e serviços › Biblioteca</b>, ative a <b>Google Drive API</b>.</li>
        <li>Em <b>Google Auth Platform</b> (tela de consentimento OAuth), escolha <b>Externo</b> e preencha o nome do app e seu e-mail.</li>
        <li>Em <b>Público-alvo</b>, clique em <b>Publicar app</b> para ficar <b>Em produção</b>. Sem isso a conexão expira a cada 7 dias.</li>
        <li>Em <b>Clientes</b>, crie um <b>ID do cliente OAuth</b> do tipo <b>Aplicativo da Web</b> e cole a URI de redirecionamento acima em <b>URIs de redirecionamento autorizados</b>.</li>
        <li>Copie o <b>ID do cliente</b> e a <b>Chave secreta</b>. Na Netlify, em <b>Site configuration › Environment variables</b>, crie <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code>.</li>
        <li>Na Netlify, vá em <b>Deploys › Trigger deploy</b>, volte aqui e clique em <b>Conectar Google Drive</b>.</li>
      </ol></details></section>`;
  }

  // ---------- ações ----------
  const actions = {
    tab(t) { tab = t.dataset.t; editing = null; signing = null; if (tab !== "vistorias") created = null; render(); window.scrollTo(0, 0); },
    logout() { sessionStorage.removeItem("vst-admin"); KEY = ""; renderLogin(); },
    copy(t) { const v = findV(t.dataset.id); if (v) copiar(linkOf(v)); },
    copyText(t) { copiar(t.dataset.text, "Copiado"); },
    async share(t) { const v = findV(t.dataset.id); if (v) try { await navigator.share({ title: "Vistoria " + v.imovel.apelido, text: msgVistoria(v) }); } catch (e) { /* cancelado */ } },
    async delV(t) {
      const v = findV(t.dataset.id);
      const aviso = v && v.status === "concluida" ? "Remover esta vistoria do painel? O PDF e as fotos continuam no seu Drive." : "Cancelar esta vistoria? O link deixa de funcionar.";
      if (!confirm(aviso)) return;
      await api("DELETE", "/api/admin/vistorias/" + t.dataset.id);
      if (created && created.id === t.dataset.id) created = null;
      await refresh(); toast("Removida", "ok");
    },
    newIm() { editing = { id: "", apelido: "", endereco: "", locatario: "", locatarioCpf: "", comodos: [] }; render(); window.scrollTo(0, 0); },
    editIm(t) { editing = JSON.parse(JSON.stringify(S.imoveis.find((i) => i.id === t.dataset.id))); render(); window.scrollTo(0, 0); },
    cancelEdit() { editing = null; render(); },
    vistoriar(t) { preImovel = t.dataset.id; tab = "vistorias"; created = null; render(); window.scrollTo(0, 0); },
    addRoom() {
      const p = document.getElementById("preset").value;
      let nome = p;
      if (p) { const n = editing.comodos.filter((c) => c.nome === p || c.nome.startsWith(p + " ")).length; if (n) nome = `${p} ${n + 1}`; }
      editing.comodos.push({ nome, itens: p ? [...PRESETS[p]] : [] });
      render();
      const el = document.getElementById("room-" + (editing.comodos.length - 1));
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); if (!p) el.querySelector("input").focus(); }
    },
    mvRoom(t) {
      const k = +t.dataset.k, d = +t.dataset.d, c = editing.comodos;
      [c[k], c[k + d]] = [c[k + d], c[k]]; render();
    },
    rmRoom(t) {
      const c = editing.comodos[+t.dataset.k];
      if (!confirm(`Remover "${c.nome || "cômodo"}"?`)) return;
      editing.comodos.splice(+t.dataset.k, 1); render();
    },
    async saveIm(t) {
      const payload = { ...editing, comodos: editing.comodos.map((c) => ({ nome: c.nome.trim(), itens: c.itens.map((s) => s.trim()).filter(Boolean) })) };
      t.disabled = true;
      try { await api("POST", "/api/admin/imoveis", payload); editing = null; await refresh(); toast("Imóvel salvo", "ok"); }
      catch (e) { toast(e.message, "error"); t.disabled = false; }
    },
    async delIm() {
      if (!confirm(`Excluir o imóvel "${editing.apelido}"? As vistorias já feitas continuam no histórico.`)) return;
      await api("DELETE", "/api/admin/imoveis/" + editing.id);
      editing = null; await refresh(); toast("Imóvel excluído", "ok");
    },
    afOpen(t) {
      const v = findV(t.dataset.id), p = v.partes || {};
      signing = {
        id: v.id, busy: false, step: "",
        message: `Olá! Segue o termo de vistoria de ${v.tipo.toLowerCase()} do imóvel ${v.imovel.apelido} para assinatura.`,
        signers: [
          { papel: "Locador", nome: S.settings.locadorNome, email: S.settings.locadorEmail, on: true },
          { papel: "Locatário(a)", nome: p.locatario?.nome || v.imovel.locatario, email: p.locatario?.email || v.imovel.locatarioEmail || "", on: true },
          { papel: "Vistoriador(a)", nome: p.vistoriador?.nome || v.vistoriadorNome, email: p.vistoriador?.email || "", on: !!p.vistoriador?.email },
        ],
      };
      render();
    },
    afCancel() { signing = null; render(); },
    async afSend(t) {
      const id = t.dataset.id;
      const lista = signing.signers.filter((s) => s.on);
      if (!lista.length) return toast("Marque pelo menos um signatário", "error");
      const falta = lista.find((s) => !s.nome.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()));
      if (falta) return toast(`Confira nome e e-mail de: ${falta.papel}`, "error");
      const step = (txt) => { signing.busy = true; signing.step = txt; render(); };
      try {
        const v = findV(id);
        if (!v.assinafy || !v.assinafy.docId) { step("Enviando o PDF"); await api("POST", `/api/admin/vistorias/${id}/assinafy/upload`); }
        step("Preparando o documento");
        let pronto = false;
        for (let i = 0; i < 25 && !pronto; i++) {
          const r = await api("GET", `/api/admin/vistorias/${id}/assinafy/status`);
          pronto = r.pronto;
          if (!pronto) await new Promise((res) => setTimeout(res, 2000));
        }
        if (!pronto) throw new Error("A Assinafy ainda está processando o PDF. Tente de novo em um minuto.");
        step("Enviando convites");
        await api("POST", `/api/admin/vistorias/${id}/assinafy/send`, {
          signers: lista.map((s) => ({ papel: s.papel, nome: s.nome.trim(), email: s.email.trim() })),
          message: signing.message,
        });
        signing = null;
        await refresh();
        toast("Convites de assinatura enviados", "ok");
      } catch (e) {
        if (signing) { signing.busy = false; render(); }
        toast(e.message, "error");
      }
    },
    async afCheck(t) {
      t.disabled = true;
      try {
        const r = await api("GET", `/api/admin/vistorias/${t.dataset.id}/assinafy/status`);
        await refresh();
        toast(r.assinafy.status === "assinado" ? "Tudo assinado. O PDF assinado foi salvo no Drive." : "Ainda faltam assinaturas", r.assinafy.status === "assinado" ? "ok" : "");
      } catch (e) { toast(e.message, "error"); t.disabled = false; }
    },
    async connect() { try { const r = await api("GET", "/api/admin/google/auth-url"); location.href = r.url; } catch (e) { toast(e.message, "error"); } },
    async disconnect() {
      if (!confirm("Desconectar o Google Drive? Os arquivos continuam no Drive, mas novas vistorias não conseguirão ser enviadas.")) return;
      await api("POST", "/api/admin/google/disconnect"); await refresh();
    },
  };
  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-a]");
    if (!t || !app.contains(t)) return;
    const fn = actions[t.dataset.a];
    if (fn) { e.preventDefault(); Promise.resolve(fn(t, e)).catch((err) => toast(err.message, "error")); }
  });
  app.addEventListener("input", (e) => {
    const t = e.target;
    if (signing && t.dataset.sg !== undefined) {
      const p = signing.signers[+t.dataset.sg];
      p[t.dataset.f] = t.dataset.f === "on" ? t.checked : t.value;
      return;
    }
    if (signing && t.hasAttribute("data-sgmsg")) { signing.message = t.value; return; }
    if (!editing) return;
    if (t.dataset.e) editing[t.dataset.e] = t.value;
    else if (t.dataset.room) editing.comodos[+t.dataset.room].nome = t.value;
    else if (t.dataset.items) editing.comodos[+t.dataset.items].itens = t.value.split("\n");
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (signing && t.dataset.sg !== undefined && t.type === "checkbox") signing.signers[+t.dataset.sg].on = t.checked;
  });
  app.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, fd = new FormData(f), btn = f.querySelector("button");
    if (btn) btn.disabled = true;
    try {
      if (f.id === "login-form") {
        KEY = document.getElementById("pw").value;
        await api("POST", "/api/admin/login");
        sessionStorage.setItem("vst-admin", KEY);
        await refresh();
        return;
      }
      if (f.id === "nova-form") {
        const r = await api("POST", "/api/admin/vistorias", { imovelId: fd.get("imovelId"), tipo: fd.get("tipo"), vistoriadorNome: fd.get("vistoriadorNome") });
        created = r.vistoria; preImovel = r.vistoria.imovelId;
        await refresh();
        document.getElementById("link-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (f.id === "loc-form") {
        await api("POST", "/api/admin/settings", { locadorNome: fd.get("locadorNome"), locadorCpf: fd.get("locadorCpf"), locadorEmail: fd.get("locadorEmail") });
        await refresh(); toast("Dados do locador salvos", "ok");
      }
    } catch (err) {
      if (f.id === "login-form") { KEY = ""; renderLogin(err.message); return; }
      toast(err.message, "error");
    } finally { if (btn && document.contains(btn)) btn.disabled = false; }
  });

  // ---------- início ----------
  (async function init() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("drive")) {
      history.replaceState(null, "", location.pathname);
      tab = "config";
      const ok = h.get("drive") === "ok";
      setTimeout(() => toast(ok ? "Google Drive conectado" : "Não foi possível conectar: " + (h.get("msg") || ""), ok ? "ok" : "error"), 300);
    }
    if (!KEY) return renderLogin();
    try { await refresh(); }
    catch (e) {
      if (e.status === 401) { KEY = ""; sessionStorage.removeItem("vst-admin"); return renderLogin(); }
      renderLogin(e.message);
    }
  })();
})();
