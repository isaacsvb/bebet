# bebet ⚽📊

Assistente **local** de trade esportivo de valor, no espírito do que o Nettuno Trader ensina: você não "adivinha o jogo", você entra quando a **odd está errada a seu favor** e dimensiona a aposta pela banca.

Roda 100% no navegador. Nenhum dado sai da sua máquina. Não precisa instalar nada, não precisa de chave paga.

## Como usar

**Modo simples (só análise manual/colar odds):** abra o arquivo **`index.html`** no navegador (duplo clique).

**Modo completo com estatísticas AO VIVO (o "bot" local):**
precisa de Python 3 (já vem no Mac/Linux; no Windows instale de python.org). No terminal, dentro da pasta do projeto:

```bash
python3 server.py
```

Depois abra **http://localhost:8000** no navegador. A aba **🔴 Ao vivo** vai listar os jogos em andamento e mostrar placar, estatísticas (posse, chutes, chutes no gol, escanteios, cartões) e **sinais ao vivo** — tudo automático.

- Fonte dos dados ao vivo: **ESPN** (grátis, sem chave, sem cadastro).
- O backend serve a página e a API na mesma origem (`localhost:8000`), então não há bloqueio de CORS.
- Nada é enviado para fora: o servidor só busca dados públicos da ESPN e repassa para a sua página local.
- A aba Ao vivo **só funciona** abrindo por `http://localhost:8000` (com o `server.py` rodando). Pelo GitHub Pages ela não tem backend e fica inativa — as outras abas funcionam normalmente.

### Abas

- **🎯 Analisar partida** — informe as odds da partida (1X2 obrigatório; gols/BTTS e fundamentos opcionais) e clique em **Recomendar estratégia**. O motor avalia todas as estratégias e recomenda a de **maior probabilidade de acerto** que ainda tenha **valor positivo (+EV)** e odd na sua faixa favorita (≥ 1.85). Mostra um ranking completo.
- **🧮 Calculadora manual** — para uma aposta específica: informe odd + sua probabilidade (ou a odd justa, ou tire a margem usando as duas odds) e veja EV, margem da casa e stake sugerido (Kelly).
- **📒 Diário** — registre as entradas, marque Green/Red e acompanhe ROI, taxa de acerto e lucro reais. Exporta CSV.
- **📖 Estratégias** — lista e explica as estratégias e como a recomendação é escolhida.

## Estratégias incluídas

1. **Back no favorito sólido** — mandante confirmado por força/forma, com odd ainda ≥ 1.85.
2. **Over 2.5 gols** — ataques produtivos + defesas vazadas.
3. **Under 2.5 gols** — defesas fortes, jogo truncado.
4. **Ambas marcam (BTTS Sim)** — dois ataques que furam defesas.
5. **Dupla chance mandante (1X)** — segurança quando o mandante raramente perde.

## Como a probabilidade é estimada

A base é a **odd sem margem (vig)** — a melhor estimativa de mercado. Os fundamentos que você informa (médias de gols, posição na tabela, forma) **ajustam levemente** essa base. Isso evita confiança excessiva: a odd manda, os números refinam.

## Odds automáticas (opcional)

Na aba *Analisar partida* há um bloco "Buscar odds automaticamente". Cole uma chave grátis da [The Odds API](https://the-odds-api.com/) (500 créditos/mês, sem cartão) e o app preenche as odds dos jogos. **Sem chave, tudo funciona em modo manual** — a ferramenta nunca depende de chave paga.

> A AsianConnect/AsianOdds não tem API pública, então para essas odds a entrada é manual (cole os valores que você vê na plataforma).

## Aviso importante

Isto é **apoio à decisão e disciplina de banca**, não uma bola de cristal. Probabilidade estimada não é garantia. Nenhuma ferramenta prevê o resultado de uma partida. Estatísticas de mercado mostram que a maioria dos apostadores termina no negativo — a vantagem de longo prazo vem de só entrar com valor e respeitar a gestão de banca. **Aposte apenas o que pode perder.**

## Virar um app do Mac (abrir com 1 clique, sem terminal)

Duas formas, da mais simples para a mais "app de verdade":

### Opção 1 — atalho clicável (mais rápido)
1. Na pasta do projeto, dê **duplo clique em `bebet.command`**.
2. Na primeira vez o Mac pode bloquear: **clique com o botão direito em `bebet.command` → Abrir → Abrir**. Só precisa fazer isso uma vez.
3. O servidor sobe e o navegador abre sozinho em `http://localhost:8000`.
4. Para parar: feche a janelinha do terminal que abriu (ou `Ctrl+C`).

### Opção 2 — aplicativo bebet.app (aparece no Launchpad/Aplicativos)
1. Dê **duplo clique em `criar-app-mac.command`** (botão direito → Abrir, na 1ª vez).
2. Ele gera um **`bebet.app`** na mesma pasta.
3. **Arraste `bebet.app` para a pasta Aplicativos.**
4. Abra pelo **Launchpad** ou Finder como qualquer app. Na primeira vez: botão direito no app → **Abrir → Abrir**.
5. Clicar no app inicia o servidor em segundo plano e abre o navegador — **sem janela de terminal**.

> Requisito: Python 3 (já vem no macOS). Se o macOS pedir para instalar as "Command Line Tools" na primeira execução do `python3`, aceite.
>
> **Importante:** não mova a pasta do projeto depois de criar o `bebet.app` (o app guarda o caminho dela). Se mover, rode `criar-app-mac.command` de novo.

## Arquivos

- `index.html` — interface
- `style.css` — estilo
- `strategies.js` — motor de estratégias + análise ao vivo (puro, testável em Node)
- `parser.js` — leitor do texto de odds colado (Betfair/AsianOdds)
- `app.js` — cola entre interface e motor + diário + aba ao vivo
- `server.py` — backend local (o "bot"): serve a página e busca estatísticas ao vivo da ESPN
- `bebet.command` — atalho clicável do Mac (duplo clique abre tudo)
- `criar-app-mac.command` — gera o `bebet.app` para a pasta Aplicativos
