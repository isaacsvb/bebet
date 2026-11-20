/* ============================================================
   bebet — parser de texto colado da Betfair Exchange / AsianOdds
   ------------------------------------------------------------
   Objetivo: receber o texto bruto que o usuário copia da tela
   (Ctrl+C) e extrair as odds 1X2 (e over/under quando houver).

   Formato Betfair Exchange observado:
     <Seleção>
     <odd back3> <size>
     <odd back2> <size>
     <odd back1>  <size>   (melhor back = maior)
     <odd lay1>  <size>
     <odd lay2>  <size>
     <odd lay3>  <size>
   Três seleções no 1X2: Casa, (The Draw / Empate), Fora.
   ============================================================ */

// Palavras de UI que NÃO são nomes de time/seleção
const LIXO = new RegExp(
  "^(in-?play|in play|rules|matched|refresh|back all|lay all|back|lay|cash ?out|" +
  "selections?|market|odds|stake|profit|total|suspended|closed)",
  "i"
);

// Linha que é um número puro (odd OU size) — na Exchange os números vêm
// em pares: a odd e, logo abaixo, o volume (size). Tratamos por posição.
function ehNumero(linha) {
  const t = linha.trim().replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t);
}
function valorNum(linha) {
  return parseFloat(linha.trim().replace(/\s/g, "").replace(",", "."));
}
// Odd plausível (1.01 .. 1000). Sizes costumam ser inteiros grandes,
// mas odds de azarão também são inteiras (10, 11, 12). Por isso NÃO
// decidimos só pelo formato: usamos a posição (par odd/size) nos blocos.
function oddPlausivel(v) { return v >= 1.01 && v <= 1000; }

function limpa(s) { return s.trim().replace(/\s+/g, " "); }

/* Detecta o nome de uma partida "A x B" dentro do texto, se houver.
   Evita rótulos de UI como "In-Play" e linhas com números. */
function detectarPartida(linhas) {
  for (const l of linhas) {
    if (ehNumero(l) || LIXO.test(limpa(l))) continue;
    const m = l.match(/^(.+?)\s+(?:x|v|vs\.?|×|–|—)\s+(.+)$/i); // exige espaços em volta do separador (x, v, vs, –)
    if (m && m[1].length > 1 && m[2].length > 1 && !/\d{3,}/.test(l)) {
      return { casa: limpa(m[1]), fora: limpa(m[2]) };
    }
  }
  return null;
}

/* Agrupa o texto em blocos: cada bloco = 1 seleção seguida de seus números.
   Os números dentro de um bloco vêm em pares (odd, size); separamos por
   posição em vez de tentar adivinhar pelo formato, o que resolve odds
   inteiras de azarão (10, 11, 12) sendo confundidas com volumes. */
function extrair(textoBruto) {
  const linhas = textoBruto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);

  const blocos = [];
  let atual = null;

  for (const l of linhas) {
    if (ehNumero(l)) {
      if (atual) atual.nums.push(valorNum(l));
      continue;
    }
    if (LIXO.test(limpa(l))) { atual = null; continue; } // rótulo de UI encerra bloco atual
    // nome de seleção -> novo bloco
    atual = { nome: limpa(l), nums: [] };
    blocos.push(atual);
  }

  // Dentro de cada bloco, os números alternam odd/size/odd/size...
  // => odds ficam nos índices pares (0,2,4,...).
  const selecoes = [];
  for (const b of blocos) {
    if (b.nums.length < 2) continue; // bloco sem par odd/size válido
    const odds = b.nums.filter((_, i) => i % 2 === 0).filter(oddPlausivel);
    if (odds.length === 0) continue;
    // melhor BACK = maior odd entre as 3 primeiras colunas (backs crescentes)
    const backs = odds.slice(0, 3);
    selecoes.push({ nome: b.nome, odds, melhorBack: Math.max(...backs) });
  }

  return { selecoes, partida: detectarPartida(linhas) };
}

/* Mapeia as seleções para 1X2.
   Regra: a seleção cujo nome casa com "draw/empate" é o X.
   As outras duas são Casa e Fora, na ordem em que aparecem. */
function mapear1x2(selecoes) {
  const draw = selecoes.find((s) => /draw|empate|the draw|tie/i.test(s.nome));
  const times = selecoes.filter((s) => s !== draw);
  if (times.length < 2) return null;
  return {
    casa: times[0],
    empate: draw || null,
    fora: times[1]
  };
}

function parse(textoBruto) {
  const { selecoes, partida } = extrair(textoBruto);
  const r = { partida, selecoes, oddCasa: null, oddEmpate: null, oddFora: null, nomeCasa: null, nomeFora: null, aviso: null };
  if (selecoes.length < 2) { r.aviso = "Não encontrei seleções suficientes no texto colado."; return r; }

  const m = mapear1x2(selecoes);
  if (!m) { r.aviso = "Não consegui identificar as duas equipes."; return r; }

  r.nomeCasa = m.casa.nome;
  r.nomeFora = m.fora.nome;
  r.oddCasa = m.casa.melhorBack;
  r.oddFora = m.fora.melhorBack;
  r.oddEmpate = m.empate ? m.empate.melhorBack : null;
  if (!m.empate) r.aviso = "Não achei a linha de empate (The Draw) — preencha manualmente se for mercado 1X2.";
  return r;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parse, extrair, mapear1x2, ehNumero, detectarPartida };
}
