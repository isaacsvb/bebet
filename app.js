/* ============================================================
   bebet — UI / cola entre interface e motor de estratégias
   ============================================================ */
/* ODD_FAVORITA vem de strategies.js (escopo global compartilhado no navegador).
   Não redeclaramos aqui para evitar SyntaxError de identificador duplicado. */
const $ = (id) => document.getElementById(id);
const fmtBRL = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };

/* ---------- Abas (registradas primeiro e isoladas, para nunca falharem) ---------- */
function ativarAba(nome) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === nome));
  document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== nome));
}
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => ativarAba(t.dataset.tab));
});

/* ============================================================
   ABA 1 — ANALISAR PARTIDA (recomendação de estratégia)
   ============================================================ */
let ultimaRecomendacao = null;

function lerContexto() {
  // deriva nomes dos times a partir do campo "Jogo" (A x B) para usar na seleção EN
  const ev = $("p-evento").value.trim();
  let nomeCasa = null, nomeFora = null;
  const mjogo = ev.match(/^(.+?)\s+(?:x|v|vs\.?|×|–|—|-)\s+(.+)$/i);
  if (mjogo) { nomeCasa = mjogo[1].trim(); nomeFora = mjogo[2].trim(); }
  return {
    evento: ev, nomeCasa, nomeFora,
    oddCasa: num("p-oddCasa"), oddEmpate: num("p-oddEmpate"), oddFora: num("p-oddFora"),
    oddOver25: num("p-oddOver25"), oddUnder25: num("p-oddUnder25"),
    oddBttsSim: num("p-oddBttsSim"), oddBttsNao: num("p-oddBttsNao"),
    mediaGolsCasa: num("p-mediaGolsCasa"), mediaGolsFora: num("p-mediaGolsFora"),
    golsSofridosCasa: num("p-golsSofridosCasa"), golsSofridosFora: num("p-golsSofridosFora"),
    posClassCasa: num("p-posClassCasa"), posClassFora: num("p-posClassFora"),
    formaCasa: num("p-formaCasa"), formaFora: num("p-formaFora")
  };
}

$("p-analisar").addEventListener("click", () => {
  const ctx = lerContexto();
  if (!ctx.oddCasa || !ctx.oddEmpate || !ctx.oddFora) {
    return setV("p-verdict", "bad", "⚠️", "Faltam as odds 1X2",
      "Informe pelo menos as odds de Casa, Empate e Fora para gerar a recomendação.");
  }
  const { recomendada, nivel, todas, resumo } = recomendar(ctx);
  if (!recomendada) {
    return setV("p-verdict", "bad", "🚫", "Sem recomendação", resumo);
  }

  const tipo = nivel === "ideal" ? "good" : (nivel === "valor_fora_faixa" || nivel === "sem_valor") ? "warn" : "bad";
  const icon = tipo === "good" ? "✅" : tipo === "warn" ? "🟡" : "🚫";
  setV("p-verdict", tipo, icon,
    `${recomendada.nome} — ${recomendada.lado}`,
    resumo);

  // bloco "Onde apostar na AsianConnect" (nomes em inglês + odd aceitável)
  renderOndeApostar(recomendada);

  // ranking
  const banca = num("bankroll") || 0;
  $("p-ranking").innerHTML = todas.map((r, i) => {
    const best = i === 0;
    const pct = Math.round(r.prob * 100);
    const badge = r.temValor
      ? `<span class="rank-badge val">+EV ${(r.ev*100).toFixed(1)}%</span>`
      : `<span class="rank-badge noval">sem valor</span>`;
    const faixa = r.oddNaFaixa ? "" : ` <span class="rank-badge">odd &lt; ${ODD_FAVORITA}</span>`;
    return `<div class="rank-item ${best ? "best" : ""}">
      <div class="rank-top">
        <span class="rank-name">${best ? "⭐ " : ""}${r.nome}</span>
        <span>${badge}${faixa}</span>
      </div>
      <div class="rank-bar"><span style="width:${pct}%"></span></div>
      <div class="rank-meta">
        <span>Prob.: <b>${pct}%</b></span>
        <span>Odd: <b>${r.odd.toFixed(2)}</b></span>
        <span>Odd mín.: <b>${r.oddMinima ? r.oddMinima.toFixed(2) : "—"}</b></span>
      </div>
      ${r.mercadoEN ? `<div class="rank-aposta">📍 <code>${escapeHtml(r.mercadoEN)}</code> → <code>${escapeHtml(r.selecaoEN)}</code></div>` : ""}
      <div class="rank-motivo">${r.motivo}</div>
    </div>`;
  }).join("");

  ultimaRecomendacao = {
    data: new Date().toISOString(),
    evento: ctx.evento || "(partida sem nome)",
    nome: recomendada.nome, lado: recomendada.lado,
    odd: recomendada.odd, prob: recomendada.prob, ev: recomendada.ev,
    stakePct: Math.min(Math.max(0, kellyLocal(recomendada.prob, recomendada.odd) * 0.5), 0.10)
  };
  ultimaRecomendacao.stakeValor = banca * ultimaRecomendacao.stakePct;
  ultimaRecomendacao.retornoPot = ultimaRecomendacao.stakeValor * (recomendada.odd - 1);
  $("p-registrar").disabled = false;
});

$("p-registrar").addEventListener("click", () => {
  if (!ultimaRecomendacao) return;
  const r = ultimaRecomendacao;
  diario.unshift({ id: Date.now(), data: r.data, evento: `${r.evento} — ${r.lado}`,
    odd: r.odd, prob: r.prob, ev: r.ev, stakeValor: r.stakeValor, retornoPot: r.retornoPot, resultado: null });
  salvar(); renderDiario();
  $("p-registrar").textContent = "✔ Registrado no diário";
  setTimeout(() => ($("p-registrar").textContent = "Registrar recomendação no diário ↓"), 1600);
});

$("p-limpar").addEventListener("click", () => {
  ["p-evento","p-oddCasa","p-oddEmpate","p-oddFora","p-oddOver25","p-oddUnder25",
   "p-oddBttsSim","p-oddBttsNao","p-mediaGolsCasa","p-mediaGolsFora","p-golsSofridosCasa",
   "p-golsSofridosFora","p-posClassCasa","p-posClassFora","p-formaCasa","p-formaFora"]
    .forEach((id) => ($(id).value = ""));
  setV("p-verdict", "neutral", "🎯", "Aguardando a partida", "Informe as odds 1X2 e clique em “Recomendar estratégia”.");
  $("p-ranking").innerHTML = "";
  $("p-registrar").disabled = true;
  ultimaRecomendacao = null;
});

function kellyLocal(p, odd) { const b = odd - 1; return b > 0 ? Math.max(0, (b*p - (1-p)) / b) : 0; }

/* Monta o bloco "Onde apostar na AsianConnect" com nomes em inglês e odd aceitável */
function renderOndeApostar(rec) {
  const box = $("p-ondeapostar");
  if (!box) return;
  const oddMin = rec.oddMinima ? rec.oddMinima.toFixed(2) : "—";
  const oddAtual = rec.odd.toFixed(2);
  const okValor = rec.oddMinima ? rec.odd >= rec.oddMinima : false;
  const okFaixa = rec.odd >= ODD_FAVORITA;
  const statusAtual = (okValor && okFaixa) ? "✅" : okValor ? "🟡" : "🚫";
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="oa-head">📍 Onde apostar na AsianConnect</div>
    <div class="oa-row"><span class="oa-k">Mercado (Market)</span><code class="oa-v">${escapeHtml(rec.mercadoEN || "—")}</code></div>
    <div class="oa-row"><span class="oa-k">Seleção (Selection)</span><code class="oa-v">${escapeHtml(rec.selecaoEN || rec.lado)}</code></div>
    <div class="oa-odds">
      <div><span class="oa-k">Odd mínima p/ valor</span><b>${oddMin}</b></div>
      <div><span class="oa-k">Sua faixa preferida</span><b>≥ ${ODD_FAVORITA.toFixed(2)}</b></div>
      <div><span class="oa-k">Odd atual</span><b class="${okValor&&okFaixa?'pos':okValor?'':'neg'}">${oddAtual} ${statusAtual}</b></div>
    </div>
    <div class="oa-note">Aceite a aposta somente se a odd na tela estiver <b>≥ ${Math.max(rec.oddMinima||0, ODD_FAVORITA).toFixed(2)}</b> (o maior entre a odd mínima de valor e a sua faixa).</div>`;
}

/* ---------- Colar e extrair odds (parser) ---------- */
$("p-extrair").addEventListener("click", () => {
  const txt = $("p-colar").value;
  const box = $("p-extraido");
  if (!txt.trim()) { box.classList.add("hidden"); return; }
  if (typeof parse !== "function") { box.classList.remove("hidden"); box.innerHTML = "⚠️ Parser não carregou. Recarregue a página."; return; }

  let r;
  try { r = parse(txt); } catch (e) { box.classList.remove("hidden"); box.innerHTML = "⚠️ Não consegui ler o texto: " + e.message; return; }

  // preenche campos quando encontrou
  if (r.partida) $("p-evento").value = `${r.partida.casa} x ${r.partida.fora}`;
  else if (r.nomeCasa && r.nomeFora) $("p-evento").value = `${r.nomeCasa} x ${r.nomeFora}`;
  if (r.oddCasa) $("p-oddCasa").value = r.oddCasa;
  if (r.oddEmpate) $("p-oddEmpate").value = r.oddEmpate;
  if (r.oddFora) $("p-oddFora").value = r.oddFora;

  // resumo do que foi entendido (para o usuário conferir)
  const linhas = [];
  if (r.selecoes && r.selecoes.length) {
    r.selecoes.forEach((s) => linhas.push(`<li><b>${escapeHtml(s.nome)}</b> → melhor back <b>${s.melhorBack.toFixed(2)}</b> <span class="mut">(odds: ${s.odds.map(o=>o).join(", ")})</span></li>`));
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="extraido-head">✅ Extraído — confira antes de analisar:</div>
    <ul>${linhas.join("") || "<li>Nenhuma seleção reconhecida.</li>"}</ul>
    <div class="extraido-map">
      Casa: <b>${$("p-oddCasa").value || "—"}</b> ·
      Empate: <b>${$("p-oddEmpate").value || "—"}</b> ·
      Fora: <b>${$("p-oddFora").value || "—"}</b>
    </div>
    ${r.aviso ? `<div class="extraido-aviso">⚠️ ${escapeHtml(r.aviso)}</div>` : ""}
    <div class="hint">Confira os valores acima. Ajuste manualmente se algo saiu errado, depois clique em “Recomendar estratégia”.</div>`;
});

/* ---------- Busca de odds via The Odds API (opcional) ---------- */
$("api-buscar").addEventListener("click", async () => {
  const key = $("api-key").value.trim();
  const sport = $("api-sport").value;
  if (!key) return alert("Cole uma chave da The Odds API (grátis) ou use a entrada manual.");
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${encodeURIComponent(key)}`;
  try {
    $("api-buscar").textContent = "Buscando...";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const jogos = await res.json();
    if (!Array.isArray(jogos) || jogos.length === 0) { alert("Nenhum jogo encontrado agora."); return; }
    const sel = $("api-jogos");
    sel.innerHTML = '<option value="">— escolha um jogo —</option>' +
      jogos.map((j, i) => `<option value="${i}">${j.home_team} x ${j.away_team}</option>`).join("");
    sel.classList.remove("hidden");
    sel.onchange = () => { if (sel.value !== "") preencherDeApi(jogos[+sel.value]); };
    window._bebetJogos = jogos;
  } catch (e) {
    alert("Falha ao buscar odds: " + e.message + "\nVerifique a chave ou use a entrada manual.");
  } finally {
    $("api-buscar").textContent = "Buscar jogos";
  }
});

function preencherDeApi(j) {
  $("p-evento").value = `${j.home_team} x ${j.away_team}`;
  const bk = (j.bookmakers || [])[0];
  if (!bk) return;
  const h2h = (bk.markets || []).find((m) => m.key === "h2h");
  if (h2h) {
    const casa = h2h.outcomes.find((o) => o.name === j.home_team);
    const fora = h2h.outcomes.find((o) => o.name === j.away_team);
    const emp = h2h.outcomes.find((o) => /draw|empate/i.test(o.name));
    if (casa) $("p-oddCasa").value = casa.price;
    if (emp) $("p-oddEmpate").value = emp.price;
    if (fora) $("p-oddFora").value = fora.price;
  }
  const tot = (bk.markets || []).find((m) => m.key === "totals");
  if (tot) {
    const over = tot.outcomes.find((o) => /over/i.test(o.name) && String(o.point) === "2.5");
    const under = tot.outcomes.find((o) => /under/i.test(o.name) && String(o.point) === "2.5");
    if (over) $("p-oddOver25").value = over.price;
    if (under) $("p-oddUnder25").value = under.price;
  }
}

/* ============================================================
   ABA 2 — CALCULADORA MANUAL
   ============================================================ */
let metodo = "prob", ultimaAnalise = null;
document.querySelectorAll('[data-pane="manual"] .seg-btn').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-pane="manual"] .seg-btn').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    metodo = btn.dataset.metodo;
    document.querySelector(".metodo-prob").classList.toggle("hidden", metodo !== "prob");
    document.querySelector(".metodo-oddjusta").classList.toggle("hidden", metodo !== "oddjusta");
  });
});
$("kellyFrac").addEventListener("change", (e) => { $("stakeFixo").disabled = e.target.value !== "0"; });

$("analisar").addEventListener("click", () => {
  const odd = num("odd"), banca = num("bankroll") || 0;
  const evento = $("evento").value.trim() || "(sem descrição)";
  if (!odd || odd <= 1) return setV("verdict","bad","⚠️","Odd inválida","Informe uma odd maior que 1.00.");

  let prob = null, vig = null;
  if (metodo === "prob") { const p = num("probReal"); if (!p||p<=0||p>=100) return setV("verdict","bad","⚠️","Probabilidade inválida","Entre 1 e 99%."); prob = p/100; }
  else if (metodo === "oddjusta") { const oj = num("oddJusta"); if (!oj||oj<=1) return setV("verdict","bad","⚠️","Odd justa inválida","Informe odd > 1.00."); prob = 1/oj; }
  else { const oc = num("oddContra"); if (!oc||oc<=1) return setV("verdict","bad","⚠️","Falta a odd contrária","Informe a odd do lado oposto."); const r = semVig(odd, oc); prob = r; vig = (1/odd + 1/oc) - 1; }

  const oc = num("oddContra");
  if (vig === null && oc && oc > 1) vig = (1/odd + 1/oc) - 1;

  const evUnit = prob*(odd-1) - (1-prob);
  const pImpl = 1/odd, edge = prob - pImpl, temValor = evUnit > 0;

  const fracSel = parseFloat($("kellyFrac").value);
  let stakePct = fracSel === 0 ? (num("stakeFixo")||2)/100 : kellyLocal(prob, odd)*fracSel;
  stakePct = Math.min(stakePct, 0.10);
  const stakeValor = banca*stakePct, retornoPot = stakeValor*(odd-1);

  $("m-ev").textContent = (evUnit>=0?"+":"") + (evUnit*100).toFixed(1) + "%"; $("m-ev").className = "m-value " + (evUnit>=0?"pos":"neg");
  $("m-implicita").textContent = fmtPct(pImpl*100);
  $("m-prob").textContent = fmtPct(prob*100);
  $("m-vig").textContent = vig==null ? "—" : fmtPct(vig*100);
  $("m-stake").textContent = banca>0 ? `${fmtBRL(stakeValor)} (${(stakePct*100).toFixed(1)}%)` : (stakePct*100).toFixed(1)+"%";
  $("m-retorno").textContent = banca>0 ? "+"+fmtBRL(retornoPot) : "—";

  const oddOk = odd >= ODD_FAVORITA;
  if (!temValor) setV("verdict","bad","🚫","Sem valor — não operar", `Odd ${odd.toFixed(2)} paga menos que o risco justifica (EV ${(evUnit*100).toFixed(1)}%).`);
  else if (!oddOk) setV("verdict","warn","🟡","Tem valor, mas abaixo da faixa", `+${(evUnit*100).toFixed(1)}% EV, porém odd ${odd.toFixed(2)} < ${ODD_FAVORITA}.`);
  else if (edge < 0.03) setV("verdict","warn","🟢","Valor pequeno — entrada marginal", `Vantagem de só +${(edge*100).toFixed(1)}%. Reduza o stake.`);
  else setV("verdict","good","✅","Operação com valor — pode entrar", `Odd ${odd.toFixed(2)} (≥ ${ODD_FAVORITA}), EV +${(evUnit*100).toFixed(1)}%, vantagem +${(edge*100).toFixed(1)}%.`);

  ultimaAnalise = { data: new Date().toISOString(), evento, odd, prob, ev: evUnit, stakeValor, retornoPot };
  $("registrar").disabled = false;
});

$("limpar").addEventListener("click", () => {
  ["evento","odd","oddContra","probReal","oddJusta"].forEach((id)=>($(id).value=""));
  setV("verdict","neutral","⏳","Aguardando dados","Preencha a odd e sua estimativa.");
  ["m-ev","m-implicita","m-prob","m-vig","m-stake","m-retorno"].forEach((id)=>{$(id).textContent="—";$(id).className="m-value";});
  $("registrar").disabled = true; ultimaAnalise = null;
});
$("registrar").addEventListener("click", () => {
  if (!ultimaAnalise) return;
  diario.unshift({ id: Date.now(), ...ultimaAnalise, resultado: null });
  salvar(); renderDiario();
  $("registrar").textContent = "✔ Registrado";
  setTimeout(()=>($("registrar").textContent="Registrar no diário ↓"), 1500);
});

document.querySelectorAll("input").forEach((inp) =>
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const pane = inp.closest(".tabpane"); if (pane?.dataset.pane === "partida") $("p-analisar").click(); else if (pane?.dataset.pane === "manual") $("analisar").click(); } }));

/* ---------- helper de veredito ---------- */
function setV(id, tipo, icon, titulo, sub) {
  const v = $(id); v.className = "verdict " + tipo;
  v.querySelector(".verdict-icon").textContent = icon;
  $(id + "-title").textContent = titulo;
  $(id + "-sub").textContent = sub;
}

/* ============================================================
   DIÁRIO (localStorage)
   ============================================================ */
const STORAGE_KEY = "bebet_diario_v1";
let diario = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
function salvar() { localStorage.setItem(STORAGE_KEY, JSON.stringify(diario)); }

function setResultado(id, res) { const o = diario.find((x)=>x.id===id); if(!o)return; o.resultado = o.resultado===res?null:res; salvar(); renderDiario(); }
function removerOp(id) { diario = diario.filter((x)=>x.id!==id); salvar(); renderDiario(); }

function renderDiario() {
  const body = $("journal-body");
  if (diario.length === 0) body.innerHTML = '<tr class="empty"><td colspan="8">Nenhuma operação registrada ainda.</td></tr>';
  else body.innerHTML = diario.map((o) => {
    const d = new Date(o.data);
    const dataStr = d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
    const evp = o.ev!=null ? (o.ev>=0?"+":"")+(o.ev*100).toFixed(1)+"%" : "—";
    return `<tr>
      <td>${dataStr}</td><td>${escapeHtml(o.evento)}</td><td>${o.odd.toFixed(2)}</td>
      <td>${(o.prob*100).toFixed(1)}%</td><td class="${o.ev>=0?'pos':'neg'}">${evp}</td>
      <td>${fmtBRL(o.stakeValor)}</td>
      <td>
        <button class="res-btn win ${o.resultado==='win'?'active':''}" data-id="${o.id}" data-res="win">Green</button>
        <button class="res-btn loss ${o.resultado==='loss'?'active':''}" data-id="${o.id}" data-res="loss">Red</button>
      </td>
      <td><button class="del" data-del="${o.id}">✕</button></td>
    </tr>`;
  }).join("");
  atualizarStats();
  body.querySelectorAll(".res-btn").forEach((b)=>b.addEventListener("click",()=>setResultado(Number(b.dataset.id),b.dataset.res)));
  body.querySelectorAll(".del").forEach((b)=>b.addEventListener("click",()=>removerOp(Number(b.dataset.del))));
}

function atualizarStats() {
  const resolvidas = diario.filter((o)=>o.resultado);
  const greens = resolvidas.filter((o)=>o.resultado==="win");
  let lucro=0, investido=0;
  resolvidas.forEach((o)=>{ investido+=o.stakeValor; lucro += o.resultado==="win" ? o.retornoPot : -o.stakeValor; });
  const roi = investido>0 ? (lucro/investido)*100 : 0;
  const acerto = resolvidas.length>0 ? (greens.length/resolvidas.length)*100 : 0;
  $("j-roi").textContent = resolvidas.length ? (roi>=0?"+":"")+roi.toFixed(1)+"%" : "—"; $("j-roi").className = roi>=0?"pos":"neg";
  $("j-acerto").textContent = resolvidas.length ? acerto.toFixed(0)+"% ("+greens.length+"/"+resolvidas.length+")" : "—";
  $("j-lucro").textContent = resolvidas.length ? (lucro>=0?"+":"")+fmtBRL(lucro) : "—"; $("j-lucro").className = lucro>=0?"pos":"neg";
}

$("exportar").addEventListener("click", () => {
  if (diario.length === 0) return alert("Diário vazio.");
  const header = ["Data","Evento","Odd","Prob%","EV%","Stake","RetornoPot","Resultado"];
  const linhas = diario.map((o)=>[
    new Date(o.data).toLocaleString("pt-BR"),
    '"'+o.evento.replace(/"/g,'""')+'"',
    o.odd.toFixed(2),(o.prob*100).toFixed(1),(o.ev!=null?(o.ev*100).toFixed(1):""),
    o.stakeValor.toFixed(2),o.retornoPot.toFixed(2),
    o.resultado==="win"?"Green":o.resultado==="loss"?"Red":"Pendente"
  ].join(","));
  const csv = [header.join(","), ...linhas].join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bebet_diario_"+new Date().toISOString().slice(0,10)+".csv";
  a.click();
});

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* ============================================================
   ABA AO VIVO (precisa do backend local: python3 server.py)
   ============================================================ */
let liveSel = null;      // {league, id, name}
let liveTimer = null;

async function liveFetch(url) {
  const res = await fetch(url);
  if (!res.ok) { let e = {}; try { e = await res.json(); } catch(_){} throw new Error(e.erro || ("HTTP " + res.status)); }
  return res.json();
}

function horaLocal(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
  catch (_) { return ""; }
}

function itemJogo(j, aoVivo) {
  const ph = j.home ? `${escapeHtml(j.home.team)} ${aoVivo ? j.home.score : ""}` : "";
  const pa = j.away ? `${aoVivo ? j.away.score : ""} ${escapeHtml(j.away.team)}` : "";
  const sel = aoVivo
    ? `<span class="li-min">🔴 ${escapeHtml(j.minute || "")}</span>`
    : `<span class="li-min li-pre">🕒 ${escapeHtml(horaLocal(j.start))}</span>`;
  return `<button class="live-item${aoVivo ? "" : " pre"}" data-pre="${aoVivo ? "0" : "1"}"
      data-league="${escapeHtml(j.league)}" data-id="${escapeHtml(j.id)}" data-name="${escapeHtml(j.name)}">
      ${sel}
      <span class="li-teams">${ph} <b>x</b> ${pa}</span>
      <span class="li-lg">${escapeHtml(j.league)}</span>
    </button>`;
}

async function carregarJogosAoVivo() {
  const status = $("live-status"), list = $("live-list");
  status.textContent = "Buscando jogos ao vivo...";
  list.innerHTML = "";
  try {
    const d = await liveFetch("/api/live");
    const aoVivo = d.jogos || [];
    const proximos = d.proximos || [];

    let html = "";
    if (aoVivo.length) {
      status.textContent = `${aoVivo.length} jogo(s) ao vivo:`;
      html += aoVivo.map((j) => itemJogo(j, true)).join("");
    } else {
      status.textContent = "Nenhum jogo ao vivo neste momento.";
    }
    if (proximos.length) {
      html += `<div class="live-sep">Próximos jogos (agendados)</div>`;
      html += proximos.map((j) => itemJogo(j, false)).join("");
    }
    if (!html) {
      status.textContent = "Nenhum jogo ao vivo nem agendado nas ligas cobertas agora.";
    }
    list.innerHTML = html;

    list.querySelectorAll(".live-item").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.pre === "1") return; // jogo agendado: sem stats ainda
        liveSel = { league: b.dataset.league, id: b.dataset.id, name: b.dataset.name };
        list.querySelectorAll(".live-item").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
        atualizarPainelAoVivo();
      }));
  } catch (e) {
    status.innerHTML = `⚠️ ${escapeHtml(e.message)}.<br>O backend local está rodando? Execute <code>python3 server.py</code> na pasta do projeto e abra <code>http://localhost:8000</code> (não o GitHub Pages).`;
  }
}

async function atualizarPainelAoVivo() {
  if (!liveSel) return;
  const panel = $("live-panel");
  $("live-title").textContent = liveSel.name || "Painel ao vivo";
  panel.innerHTML = '<p class="hint">Carregando estatísticas...</p>';
  try {
    const m = await liveFetch(`/api/match?league=${encodeURIComponent(liveSel.league)}&id=${encodeURIComponent(liveSel.id)}`);
    const r = analisarAoVivo(m);
    const sh = (m.home && m.home.stats) || {}, sa = (m.away && m.away.stats) || {};
    const linhaStat = (lbl, k, suf="") =>
      `<tr><td>${lbl}</td><td class="st-h">${sh[k] ?? "—"}${suf}</td><td class="st-a">${sa[k] ?? "—"}${suf}</td></tr>`;
    const sinalCls = (f) => f === "forte" ? "sig-forte" : f === "media" ? "sig-media" : "sig-fraca";
    panel.innerHTML = `
      <div class="live-score">
        <span>${escapeHtml(m.home?.team || "Casa")}</span>
        <b>${m.home?.score ?? 0} x ${m.away?.score ?? 0}</b>
        <span>${escapeHtml(m.away?.team || "Fora")}</span>
      </div>
      <div class="live-min">⏱ ${escapeHtml(m.minute || "")}</div>
      <table class="live-stats">
        <thead><tr><th>Estatística</th><th>Casa</th><th>Fora</th></tr></thead>
        <tbody>
          ${linhaStat("Posse de bola", "posse", "%")}
          ${linhaStat("Chutes", "chutes")}
          ${linhaStat("Chutes no gol", "chutesNoGol")}
          ${linhaStat("Escanteios", "escanteios")}
          ${linhaStat("Faltas", "faltas")}
          ${linhaStat("Amarelos", "amarelos")}
          ${linhaStat("Vermelhos", "vermelhos")}
        </tbody>
      </table>
      <div class="live-sinais">
        <div class="ls-head">📡 Sinais ao vivo</div>
        ${r.sinais.map((s) => `<div class="ls-item ${sinalCls(s.forca)}">${escapeHtml(s.texto)}</div>`).join("")}
      </div>
      <p class="hint">Use estes sinais com as odds ao vivo da AsianConnect. Sinal não é garantia — confirme o valor antes de entrar.</p>`;
  } catch (e) {
    panel.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
  }
}

$("live-refresh") && $("live-refresh").addEventListener("click", carregarJogosAoVivo);
$("live-auto") && $("live-auto").addEventListener("change", (e) => {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  if (e.target.checked) liveTimer = setInterval(() => { carregarJogosAoVivo(); atualizarPainelAoVivo(); }, 20000);
});

/* ---------- Lista de estratégias (aba ajuda) ---------- */
function renderEstrategias() {
  if (typeof estrategias === "undefined") return;
  $("lista-estrategias").innerHTML = estrategias.map((e) =>
    `<div class="estrat-item"><h4>${e.nome}</h4><p>${e.descricao}</p></div>`).join("");
}

/* ---------- Init ---------- */
renderDiario();
renderEstrategias();
