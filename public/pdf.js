/* Termo de Vistoria — gerador de PDF (jsPDF + autotable).
   Funciona no navegador (window.buildVistoriaPDF) e no Node (module.exports). */
(function (root) {
  "use strict";

  const COL = {
    navy: [18, 35, 61], navy2: [36, 58, 92], ink: [27, 35, 48], muted: [110, 116, 128],
    line: [228, 223, 212], soft: [248, 246, 241], gold: [184, 137, 58], white: [255, 255, 255],
  };
  const EST = {
    "Ótimo": [21, 145, 80], "Bom": [37, 99, 235], "Regular": [205, 120, 10],
    "Ruim": [205, 38, 38], "N/A": [140, 148, 162],
  };
  const ORDER = ["Ótimo", "Bom", "Regular", "Ruim", "N/A"];
  const tint = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));
  const contain = (iw, ih, bw, bh) => {
    const s = Math.min(bw / iw, bh / ih);
    return { w: iw * s, h: ih * s, dx: (bw - iw * s) / 2, dy: (bh - ih * s) / 2 };
  };

  async function buildVistoriaPDF(JsPDF, d) {
    const doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
    const W = 210, H = 297, M = 16, CW = W - 2 * M, BOTTOM = H - 20;
    const headed = new Set([1]);
    let y = 0;

    const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);
    const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const font = (size, style) => { doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); };
    const pageNo = () => doc.internal.getCurrentPageInfo().pageNumber;

    function runningHeader() {
      const p = pageNo();
      if (headed.has(p)) return;
      headed.add(p);
      fill(COL.navy); doc.rect(0, 0, W, 11, "F");
      fill(COL.gold); doc.rect(0, 11, W, 0.7, "F");
      font(7.2, "bold"); color(COL.white);
      doc.text("TERMO DE VISTORIA DE " + d.tipo.toUpperCase(), M, 7);
      font(7.2, "normal"); color(tint(COL.navy, 0.7));
      doc.text(d.codigo + "  ·  " + d.dataVistoria, W - M, 7, { align: "right" });
    }
    function newPage() { doc.addPage(); runningHeader(); y = 21; }
    function ensure(h) { if (y + h > BOTTOM) newPage(); }

    function pill(text, x, yc, c, center) {
      font(7, "bold");
      const w = doc.getTextWidth(text) + 6, h = 5;
      const px = center ? x - w / 2 : x;
      fill(c); doc.roundedRect(px, yc - h / 2, w, h, 2.5, 2.5, "F");
      color(COL.white); doc.text(text, px + 3, yc + 1.2);
      return w;
    }

    function sectionTitle(t, right) {
      ensure(16);
      font(11.5, "bold"); color(COL.navy); doc.text(t, M, y);
      if (right) { font(8, "normal"); color(COL.muted); doc.text(right, W - M, y, { align: "right" }); }
      draw(COL.line); doc.setLineWidth(0.3); doc.line(M, y + 2.4, W - M, y + 2.4);
      y += 8;
    }

    function textBlock(label, text) {
      if (!text) return;
      ensure(14);
      font(6.8, "bold"); color(COL.muted); doc.text(label.toUpperCase(), M, y); y += 4.6;
      font(9, "normal");
      doc.splitTextToSize(text, CW).forEach((ln) => {
        ensure(5); font(9, "normal"); color(COL.ink); doc.text(ln, M, y); y += 4.4;
      });
      y += 3;
    }

    // ---------------- capa ----------------
    fill(COL.navy); doc.rect(0, 0, W, 52, "F");
    fill(COL.gold); doc.rect(0, 52, W, 1.2, "F");
    font(7.5, "bold"); color(COL.gold);
    doc.text("TERMO DE VISTORIA DE IMÓVEL", M, 15, { charSpace: 0.5 });
    font(23, "bold"); color(COL.white);
    doc.text("Vistoria de " + d.tipo, M, 27.5);
    font(9.5, "normal"); color(tint(COL.navy, 0.72));
    doc.text(doc.splitTextToSize(d.imovel.endereco, CW - 58).slice(0, 2), M, 35.5);

    const bx = W - M - 48;
    fill(COL.navy2); doc.roundedRect(bx, 12, 48, 27, 2.5, 2.5, "F");
    font(6.5, "bold"); color(COL.gold); doc.text("DOCUMENTO", bx + 5, 19);
    font(11, "bold"); color(COL.white); doc.text(d.codigo, bx + 5, 25.5);
    font(7.5, "normal"); color(tint(COL.navy, 0.72));
    doc.text("Vistoria em " + d.dataVistoria, bx + 5, 32);
    y = 64;

    // dados
    (function infoGrid() {
      const rows = [
        ["Imóvel", d.imovel.apelido], ["Tipo de vistoria", d.tipo],
        ["Endereço", d.imovel.endereco, true],
        ["Locador", d.locador.nome], ["Locatário(a)", d.locatario.nome],
        ["Vistoriador(a)", d.vistoriador.nome], ["Data da vistoria", d.dataVistoria],
      ];
      const colW = (CW - 8) / 2;
      font(9.5, "bold");
      const items = rows.map(([l, v, full]) => ({ l, full, txt: doc.splitTextToSize(v || "Não informado", (full ? CW - 8 : colW) - 4) }));
      const grid = []; let cur = [];
      items.forEach((it) => {
        if (it.full) { if (cur.length) grid.push(cur); cur = []; grid.push([it]); }
        else { cur.push(it); if (cur.length === 2) { grid.push(cur); cur = []; } }
      });
      if (cur.length) grid.push(cur);
      const rowH = (r) => 6 + Math.max(...r.map((it) => it.txt.length)) * 4.1 + 2.5;
      const total = grid.reduce((s, r) => s + rowH(r), 0) + 4;
      fill(COL.soft); doc.roundedRect(M, y, CW, total, 2.5, 2.5, "F");
      let yy = y + 6;
      grid.forEach((r) => {
        r.forEach((it, k) => {
          const x = M + 4 + k * colW;
          font(6.6, "bold"); color(COL.muted); doc.text(it.l.toUpperCase(), x, yy);
          font(9.5, "bold"); color(COL.ink); doc.text(it.txt, x, yy + 4.8);
        });
        yy += rowH(r);
      });
      y += total + 9;
    })();

    // resumo
    const counts = {};
    ORDER.forEach((e) => (counts[e] = 0));
    d.rooms.forEach((r) => r.itens.forEach((i) => { if (counts[i.estado] !== undefined) counts[i.estado]++; }));
    sectionTitle("Resumo da vistoria", `${d.totais.itens} itens  ·  ${d.totais.fotos} fotos  ·  ${d.rooms.length} cômodos`);
    (function () {
      const gap = 3, bw = (CW - gap * 4) / 5;
      ORDER.forEach((e, k) => {
        const x = M + k * (bw + gap);
        fill(tint(EST[e], 0.9)); doc.roundedRect(x, y, bw, 19, 2, 2, "F");
        fill(EST[e]); doc.rect(x, y + 3, 1.3, 13, "F");
        font(17, "bold"); color(EST[e]); doc.text(String(counts[e]), x + 5, y + 10);
        font(7.5, "bold"); color(COL.ink); doc.text(e === "N/A" ? "Não se aplica" : e, x + 5, y + 15.3);
      });
      y += 25;
      if (d.geral.estado) {
        font(9, "normal"); color(COL.muted); doc.text("Estado geral do imóvel:", M, y);
        pill(d.geral.estado, M + doc.getTextWidth("Estado geral do imóvel:") + 3, y - 1.2, EST[d.geral.estado] || COL.navy);
        y += 13;
      }
    })();

    // medidores e chaves
    (function () {
      const me = d.medidores, ch = d.chaves;
      const has = me.energia.leitura || me.agua.leitura || me.energia.fotoNums.length || me.agua.fotoNums.length || ch.qtd || ch.desc || ch.declarado;
      if (!has) return;
      sectionTitle("Medidores e chaves");
      const bw = (CW - 5) / 2;
      font(9, "normal");
      const keyTxt = doc.splitTextToSize(ch.desc || "Descrição não informada", bw - 8);
      const declTxt = ch.declarado
        ? doc.splitTextToSize(d.tipo === "Saída" ? "Devolução das chaves declarada na vistoria." : "Entrega das chaves ao(à) locatário(a) declarada na vistoria.", bw - 8)
        : [];
      const h = Math.max(33, 18 + keyTxt.length * 4.2 + (declTxt.length ? declTxt.length * 4 + 3 : 0) + 3);
      ensure(h);
      fill(COL.soft); doc.roundedRect(M, y, bw, h, 2.5, 2.5, "F");
      const med = (label, m, yy) => {
        font(6.6, "bold"); color(COL.muted); doc.text(label.toUpperCase(), M + 5, yy);
        font(11, "bold"); color(m.leitura ? COL.ink : COL.muted); doc.text(m.leitura || "Não informado", M + 5, yy + 5.5);
        if (m.fotoNums.length) { font(7.5, "normal"); color(COL.muted); doc.text("Foto " + m.fotoNums.join(", "), M + bw - 5, yy + 5.5, { align: "right" }); }
      };
      med("Energia elétrica", me.energia, y + 7);
      med("Água (hidrômetro)", me.agua, y + 20);
      const x2 = M + bw + 5;
      fill(COL.soft); doc.roundedRect(x2, y, bw, h, 2.5, 2.5, "F");
      font(6.6, "bold"); color(COL.muted); doc.text("CHAVES", x2 + 5, y + 7);
      const q = Number(ch.qtd);
      font(11, "bold"); color(ch.qtd ? COL.ink : COL.muted);
      doc.text(ch.qtd ? `${ch.qtd} chave${q === 1 ? "" : "s"}` : "Quantidade não informada", x2 + 5, y + 12.5);
      font(9, "normal"); color(COL.ink); doc.text(keyTxt, x2 + 5, y + 18.5);
      if (declTxt.length) { font(8, "bold"); color(EST["Ótimo"]); doc.text(declTxt, x2 + 5, y + 18.5 + keyTxt.length * 4.2 + 2); }
      y += h + 8;
    })();

    textBlock("Observações gerais e pendências", d.geral.obs);

    // ---------------- cômodos ----------------
    function photoGrid(fotos) {
      const list = fotos.filter((f) => f.dataUrl);
      if (!list.length) return;
      const gap = 5, cw = (CW - gap) / 2, ih = 63, ch = ih + 11;
      for (let k = 0; k < list.length; k += 2) {
        ensure(ch + 2);
        [list[k], list[k + 1]].forEach((f, j) => {
          if (!f) return;
          const x = M + j * (cw + gap);
          fill(COL.soft); doc.roundedRect(x, y, cw, ih, 2, 2, "F");
          const fit = contain(f.w, f.h, cw - 3, ih - 3);
          try { doc.addImage(f.dataUrl, "JPEG", x + 1.5 + fit.dx, y + 1.5 + fit.dy, fit.w, fit.h, "foto" + f.num, "FAST"); } catch (e) { /* imagem inválida */ }
          font(7, "bold");
          const lbl = "Foto " + f.num, tw = doc.getTextWidth(lbl) + 5;
          fill(COL.navy); doc.roundedRect(x + 3.5, y + 3.5, tw, 5.4, 1.3, 1.3, "F");
          color(COL.white); doc.text(lbl, x + 3.5 + tw / 2, y + 7.2, { align: "center" });
          font(8, "normal"); color(COL.ink);
          doc.text(doc.splitTextToSize(f.caption, cw - 2).slice(0, 2), x + 1, y + ih + 4.6);
        });
        y += ch + 2;
      }
    }

    d.rooms.forEach((room, idx) => {
      ensure(55);
      y += 2;
      fill(COL.navy); doc.roundedRect(M, y - 5.8, 9, 9, 1.8, 1.8, "F");
      font(9, "bold"); color(COL.white); doc.text(String(idx + 1).padStart(2, "0"), M + 4.5, y + 0.4, { align: "center" });
      font(13.5, "bold"); color(COL.navy); doc.text(room.nome, M + 12.5, y + 0.8);
      font(8, "normal"); color(COL.muted);
      doc.text(`${room.itens.length} itens  ·  ${room.fotos.length} fotos`, W - M, y + 0.8, { align: "right" });
      y += 6.5;

      doc.autoTable({
        startY: y,
        margin: { left: M, right: M, top: 21, bottom: 22 },
        head: [["Item", "Estado", "Observações", "Fotos"]],
        body: room.itens.map((i) => [i.nome, i.estado || "", i.obs || "", i.fotoNums.length ? i.fotoNums.join(", ") : ""]),
        theme: "plain",
        styles: { font: "helvetica", fontSize: 8.6, textColor: COL.ink, cellPadding: { top: 2.7, bottom: 2.7, left: 2.6, right: 2.6 }, valign: "middle", overflow: "linebreak" },
        headStyles: { fontStyle: "bold", fontSize: 6.8, textColor: COL.muted, fillColor: COL.soft },
        columnStyles: {
          0: { cellWidth: 56, fontStyle: "bold" },
          1: { cellWidth: 25, halign: "center" },
          2: { cellWidth: "auto", textColor: [72, 78, 90] },
          3: { cellWidth: 17, halign: "center", textColor: COL.muted, fontSize: 7.8 },
        },
        didParseCell: (h) => {
          if (h.section === "head") h.cell.text = [String(h.cell.raw).toUpperCase()];
          if (h.section === "body" && h.column.index === 1) { h.cell.estado = h.cell.raw; h.cell.text = [""]; }
        },
        didDrawCell: (h) => {
          if (h.section !== "body") return;
          draw(COL.line); doc.setLineWidth(0.2);
          doc.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
          if (h.column.index === 1 && EST[h.cell.estado]) {
            pill(h.cell.estado, h.cell.x + h.cell.width / 2, h.cell.y + h.cell.height / 2, EST[h.cell.estado], true);
          }
        },
        didDrawPage: () => runningHeader(),
      });
      y = doc.lastAutoTable.finalY + 5;
      textBlock("Observações do cômodo", room.obs);
      photoGrid(room.fotos);
      y += 5;
    });

    if (d.extraFotos.some((f) => f.dataUrl)) {
      sectionTitle("Medidores, fachada e áreas gerais", d.extraFotos.length + " fotos");
      photoGrid(d.extraFotos);
    }

    // ---------------- assinaturas ----------------
    newPage();
    font(17, "bold"); color(COL.navy); doc.text("Declarações e assinaturas", M, y + 3);
    y += 12;
    const decl = [
      `As partes reconhecem que este termo descreve o estado de conservação do imóvel situado em ${d.imovel.endereco} na data de ${d.dataVistoria}, conforme os itens, observações e ${d.totais.fotos} registros fotográficos que o integram, nos termos dos arts. 22, inciso V, e 23, inciso III, da Lei nº 8.245/1991.`,
      d.tipo === "Saída"
        ? "Este termo servirá de base para a comparação com a vistoria de entrada e para a apuração de reparos de responsabilidade do(a) locatário(a), ressalvado o desgaste natural decorrente do uso normal."
        : "Este termo servirá de referência para a devolução do imóvel, que deverá ocorrer no estado aqui descrito, ressalvado o desgaste natural decorrente do uso normal. Divergências deverão ser comunicadas ao locador no prazo previsto no contrato de locação.",
      "O(a) vistoriador(a) declara que as informações e fotografias registradas refletem fielmente o estado do imóvel no momento da vistoria.",
    ];
    decl.forEach((p) => {
      font(9.6, "normal"); color(COL.ink);
      const l = doc.splitTextToSize(p, CW);
      doc.text(l, M, y, { lineHeightFactor: 1.45 });
      y += l.length * 4.9 + 3.5;
    });
    y += 5;

    font(11.5, "bold"); color(COL.navy); doc.text("Signatários", M, y);
    draw(COL.line); doc.setLineWidth(0.3); doc.line(M, y + 2.4, W - M, y + 2.4);
    y += 8;
    const bw = (CW - 6) / 2, bh = 33;
    const blocks = [
      { role: "Locador", p: d.locador },
      { role: "Locatário(a)", p: d.locatario },
      { role: "Vistoriador(a)", p: d.vistoriador },
    ];
    ensure(bh * 2 + 30);
    blocks.forEach((b, k) => {
      const x = M + (k % 2) * (bw + 6), yy = y + Math.floor(k / 2) * (bh + 6);
      fill(COL.soft); doc.roundedRect(x, yy, bw, bh, 2.5, 2.5, "F");
      fill(COL.gold); doc.rect(x, yy + 4, 1.3, bh - 8, "F");
      font(6.8, "bold"); color(COL.gold); doc.text(b.role.toUpperCase(), x + 6, yy + 7.5, { charSpace: 0.3 });
      font(10, "bold"); color(COL.ink); doc.text(doc.splitTextToSize(b.p.nome || "Nome não informado", bw - 12)[0], x + 6, yy + 14);
      font(8, "normal"); color(COL.muted);
      doc.text(b.p.cpf ? "CPF " + b.p.cpf : "CPF não informado", x + 6, yy + 19.5);
      doc.text(doc.splitTextToSize(b.p.email || "E-mail não informado", bw - 12)[0], x + 6, yy + 24);
      font(7, "bold"); color(COL.navy2); doc.text("Assinatura eletrônica", x + 6, yy + 29);
    });
    y += bh * 2 + 14;
    fill(tint(COL.navy, 0.93));
    font(8.5, "normal");
    const nota = doc.splitTextToSize("Este termo é assinado eletronicamente por todas as partes, nos termos da Lei nº 14.063/2020 e da MP nº 2.200-2/2001. A comprovação das assinaturas (data, hora, e-mail e endereço IP de cada signatário) consta da página de certificação emitida pela plataforma de assinatura e anexada a este documento.", CW - 10);
    const nh = nota.length * 4 + 8;
    doc.roundedRect(M, y, CW, nh, 2.5, 2.5, "F");
    color(COL.ink); doc.text(nota, M + 5, y + 6);
    y += nh + 6;
    font(7.5, "normal"); color(COL.muted);
    doc.text(doc.splitTextToSize(`Documento ${d.codigo} gerado em ${d.geradoEm}. As fotos originais estão arquivadas na pasta da vistoria, numeradas na mesma ordem deste termo.`, CW), M, y);

    // ---------------- rodapé ----------------
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      draw(COL.line); doc.setLineWidth(0.3); doc.line(M, H - 13, W - M, H - 13);
      font(7, "normal"); color(COL.muted);
      doc.text(doc.splitTextToSize(d.imovel.endereco, CW - 40)[0], M, H - 8.5);
      doc.text(`Página ${i} de ${n}`, W - M, H - 8.5, { align: "right" });
    }
    return doc;
  }

  root.buildVistoriaPDF = buildVistoriaPDF;
  if (typeof module !== "undefined" && module.exports) module.exports = { buildVistoriaPDF };
})(typeof window !== "undefined" ? window : globalThis);
