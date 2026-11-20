/* ============================================================
   bebet — Motor de estratégias de trade esportivo
   ------------------------------------------------------------
   Cada estratégia recebe o "contexto da partida" (odds + números
   que você informa) e devolve:
     - aplica:  se a estratégia faz sentido nesse jogo
     - prob:    probabilidade estimada de acerto (0..1)
     - odd:     odd-alvo da entrada
     - lado:    descrição do que apostar
     - motivo:  por que a estratégia disparou
   O motor compara todas e recomenda a de MAIOR probabilidade
   que ainda tenha VALOR (+EV) e respeite a odd favorita (>=1.85).
   ============================================================ */

const ODD_FAVORITA = 1.85;

/* -------- utilidades de probabilidade -------- */
const impl = (odd) => (odd && odd > 1 ? 1 / odd : null); // prob. implícita de uma odd

// Remove margem entre dois lados e devolve prob. justa do lado A
function semVig(oddA, oddB) {
  const a = impl(oddA), b = impl(oddB);
  if (a == null || b == null) return null;
  return a / (a + b);
}

// EV por unidade: p*(odd-1) - (1-p)
const ev = (p, odd) => (p == null || !odd ? null : p * (odd - 1) - (1 - p));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ============================================================
   DEFINIÇÃO DAS ESTRATÉGIAS
   ctx: {
     oddCasa, oddEmpate, oddFora,          // 1X2
     oddOver25, oddUnder25,                // gols over/under 2.5
     oddBttsSim, oddBttsNao,               // ambas marcam
     // dados opcionais que refinam a probabilidade:
     mediaGolsCasa, mediaGolsFora,         // média de gols marcados
     golsSofridosCasa, golsSofridosFora,   // média de gols sofridos
     posClassCasa, posClassFora,           // posição na tabela (1 = melhor)
     formaCasa, formaFora                  // pontos nos últimos 5 jogos (0..15)
   }
   ============================================================ */

const estrategias = [
  /* 1) LAY no azarão extremo (trade de valor clássico do Nettuno:
        proteger-se de favoritos caros não; aqui buscamos BACK no favorito
        com odd saudável quando os números confirmam domínio) */
  {
    id: "fav_solido",
    nome: "Back no favorito sólido",
    descricao: "Apostar no favorito quando força em campo + forma confirmam o domínio e a odd ainda paga ≥ 1.85.",
    avaliar(ctx) {
      const odd = ctx.oddCasa;
      if (!odd || odd < 1.4) return null;
      // base: prob implícita sem vig (usando empate+fora como contrapeso)
      let p = semVig(ctx.oddCasa, Math.min(ctx.oddEmpate || 99, ctx.oddFora || 99)) ?? impl(odd);
      if (p == null) return null;
      // ajustes pelos fundamentos (peso pequeno: a odd já é a melhor estimativa de mercado)
      if (ctx.formaCasa != null && ctx.formaFora != null)
        p += clamp((ctx.formaCasa - ctx.formaFora) / 15, -0.12, 0.12) * 0.15;
      if (ctx.posClassCasa != null && ctx.posClassFora != null)
        p += clamp((ctx.posClassFora - ctx.posClassCasa) / 20, -0.1, 0.1) * 0.12;
      p = clamp(p, 0.05, 0.95);
      return { aplica: p >= 0.55, prob: p, odd, lado: "Vitória do mandante (1)",
               mercadoEN: "Match Odds", selecaoEN: (ctx.nomeCasa || "Home team") + " (Home / 1)",
               motivo: "Mandante mais forte em forma/tabela; odd ainda recompensa." };
    }
  },

  /* 2) OVER 2.5 — jogo de ataque: duas equipes que marcam e sofrem muito */
  {
    id: "over25",
    nome: "Over 2.5 gols",
    descricao: "Entrar em Over 2.5 quando as médias ofensivas e defensivas apontam jogo aberto.",
    avaliar(ctx) {
      const odd = ctx.oddOver25;
      if (!odd) return null;
      let p = semVig(ctx.oddOver25, ctx.oddUnder25) ?? impl(odd);
      if (p == null) return null;
      // esperado de gols pela soma de ataques + defesas frágeis
      const golsEsp =
        (ctx.mediaGolsCasa ?? 1.3) + (ctx.mediaGolsFora ?? 1.1) +
        0.5 * ((ctx.golsSofridosCasa ?? 1.2) + (ctx.golsSofridosFora ?? 1.2) - 2.4);
      if (golsEsp) p += clamp((golsEsp - 2.5) / 2.5, -0.15, 0.2) * 0.4;
      p = clamp(p, 0.05, 0.92);
      return { aplica: p >= 0.52, prob: p, odd, lado: "Mais de 2.5 gols",
               mercadoEN: "Over/Under 2.5 Goals", selecaoEN: "Over 2.5 Goals",
               motivo: `Gols esperados ≈ ${golsEsp.toFixed(2)} (acima de 2.5).` };
    }
  },

  /* 3) UNDER 2.5 — jogo truncado entre defesas fortes */
  {
    id: "under25",
    nome: "Under 2.5 gols",
    descricao: "Entrar em Under 2.5 quando defesas sólidas e ataques apagados indicam jogo fechado.",
    avaliar(ctx) {
      const odd = ctx.oddUnder25;
      if (!odd) return null;
      let p = semVig(ctx.oddUnder25, ctx.oddOver25) ?? impl(odd);
      if (p == null) return null;
      const golsEsp =
        (ctx.mediaGolsCasa ?? 1.3) + (ctx.mediaGolsFora ?? 1.1) +
        0.5 * ((ctx.golsSofridosCasa ?? 1.2) + (ctx.golsSofridosFora ?? 1.2) - 2.4);
      if (golsEsp) p += clamp((2.5 - golsEsp) / 2.5, -0.15, 0.2) * 0.4;
      p = clamp(p, 0.05, 0.92);
      return { aplica: p >= 0.52, prob: p, odd, lado: "Menos de 2.5 gols",
               mercadoEN: "Over/Under 2.5 Goals", selecaoEN: "Under 2.5 Goals",
               motivo: `Gols esperados ≈ ${golsEsp.toFixed(2)} (abaixo de 2.5).` };
    }
  },

  /* 4) BTTS (ambas marcam) — dois ataques que furam defesas */
  {
    id: "btts",
    nome: "Ambas marcam (BTTS Sim)",
    descricao: "Entrar em 'ambas marcam' quando os dois times marcam com regularidade e sofrem gols.",
    avaliar(ctx) {
      const odd = ctx.oddBttsSim;
      if (!odd) return null;
      let p = semVig(ctx.oddBttsSim, ctx.oddBttsNao) ?? impl(odd);
      if (p == null) return null;
      const ataqueOk = (ctx.mediaGolsCasa ?? 1.2) >= 1.1 && (ctx.mediaGolsFora ?? 1.0) >= 1.0;
      const defesaFraca = (ctx.golsSofridosCasa ?? 1.1) >= 1.0 && (ctx.golsSofridosFora ?? 1.1) >= 1.0;
      if (ataqueOk) p += 0.03;
      if (defesaFraca) p += 0.03;
      p = clamp(p, 0.05, 0.9);
      return { aplica: p >= 0.55 && (ataqueOk || defesaFraca), prob: p, odd, lado: "Ambas as equipes marcam",
               mercadoEN: "Both Teams to Score", selecaoEN: "Yes",
               motivo: "Dois ataques produtivos contra defesas vazadas." };
    }
  },

  /* 5) Dupla chance no mandante — segurança com odd ainda decente */
  {
    id: "dupla_casa",
    nome: "Dupla chance mandante (1X)",
    descricao: "Cobrir vitória ou empate do mandante quando ele dificilmente perde, buscando odd ≥ 1.85.",
    avaliar(ctx) {
      if (!ctx.oddCasa || !ctx.oddEmpate) return null;
      // prob de (casa OU empate) = 1 - prob(fora)
      const pFora = semVig(ctx.oddFora, Math.min(ctx.oddCasa, ctx.oddEmpate)) ?? impl(ctx.oddFora);
      if (pFora == null) return null;
      let p = 1 - pFora;
      // odd sintética da dupla chance
      const oddDupla = 1 / (impl(ctx.oddCasa) + impl(ctx.oddEmpate));
      if (ctx.formaCasa != null && ctx.formaFora != null && ctx.formaCasa >= ctx.formaFora) p += 0.03;
      p = clamp(p, 0.3, 0.95);
      return { aplica: p >= 0.62 && oddDupla >= 1.5, prob: p, odd: oddDupla, lado: "Mandante não perde (1X)",
               mercadoEN: "Double Chance", selecaoEN: "Home or Draw (1X)",
               motivo: "Mandante raramente perde; dupla chance protege a entrada." };
    }
  }
];

/* ============================================================
   MOTOR: avalia todas e recomenda a melhor
   ============================================================ */
function avaliarTodas(ctx) {
  const resultados = [];
  for (const e of estrategias) {
    let r = null;
    try { r = e.avaliar(ctx); } catch (_) { r = null; }
    if (!r || r.prob == null) continue;
    const evUnit = ev(r.prob, r.odd);
    // odd mínima para a aposta ainda ter valor (break-even) = 1 / probabilidade.
    // abaixo dela, o EV fica negativo. é o "valor aceitável" real da entrada.
    const oddMinima = r.prob > 0 ? 1 / r.prob : null;
    resultados.push({
      id: e.id, nome: e.nome, descricao: e.descricao,
      aplica: !!r.aplica, prob: r.prob, odd: r.odd, lado: r.lado, motivo: r.motivo,
      mercadoEN: r.mercadoEN || null, selecaoEN: r.selecaoEN || null,
      oddMinima,                        // break-even
      oddMinimaPreferida: ODD_FAVORITA, // sua faixa fixa
      ev: evUnit,
      temValor: evUnit != null && evUnit > 0,
      oddNaFaixa: r.odd >= ODD_FAVORITA
    });
  }
  // ordenar: primeiro as que aplicam + têm valor + odd na faixa, depois por probabilidade
  resultados.sort((a, b) => {
    const score = (x) => (x.aplica ? 4 : 0) + (x.temValor ? 2 : 0) + (x.oddNaFaixa ? 1 : 0);
    const d = score(b) - score(a);
    return d !== 0 ? d : b.prob - a.prob;
  });
  return resultados;
}

// Escolhe a recomendação final e explica o porquê
function recomendar(ctx) {
  const todas = avaliarTodas(ctx);
  if (todas.length === 0) return { recomendada: null, todas, resumo: "Dados insuficientes para avaliar qualquer estratégia." };

  // candidata ideal: aplica + valor + odd na faixa favorita
  let rec = todas.find((r) => r.aplica && r.temValor && r.oddNaFaixa);
  let nivel = "ideal";
  if (!rec) { rec = todas.find((r) => r.aplica && r.temValor); nivel = "valor_fora_faixa"; }
  if (!rec) { rec = todas.find((r) => r.aplica); nivel = "sem_valor"; }
  if (!rec) { rec = todas[0]; nivel = "fraco"; }

  return { recomendada: rec, nivel, todas,
           resumo: montarResumo(rec, nivel) };
}

function montarResumo(rec, nivel) {
  const p = (rec.prob * 100).toFixed(0);
  const evp = rec.ev != null ? ((rec.ev >= 0 ? "+" : "") + (rec.ev * 100).toFixed(1) + "%") : "—";
  switch (nivel) {
    case "ideal":
      return `✅ Melhor opção: ${rec.nome} — ${rec.lado}. Prob. de acerto ≈ ${p}%, odd ${rec.odd.toFixed(2)} (na sua faixa ≥ ${ODD_FAVORITA}), EV ${evp}.`;
    case "valor_fora_faixa":
      return `🟡 Melhor opção: ${rec.nome} — ${rec.lado}. Prob. ≈ ${p}% e tem valor (EV ${evp}), mas a odd ${rec.odd.toFixed(2)} está abaixo de ${ODD_FAVORITA}.`;
    case "sem_valor":
      return `⚠️ Mais provável: ${rec.nome} — ${rec.lado} (≈ ${p}%), porém SEM valor na odd atual (EV ${evp}). Melhor não operar.`;
    default:
      return `🚫 Nenhuma estratégia confiável neste jogo. A menos ruim seria ${rec.nome} (≈ ${p}%), mas sem margem de segurança.`;
  }
}

/* Exporta para navegador e Node */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { estrategias, avaliarTodas, recomendar, ev, semVig, impl, ODD_FAVORITA };
}
