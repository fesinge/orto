/* ============================================================
   ORTO — logica dell'app (tutto offline)
   ============================================================ */

/* ---------- util ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const norm = (s) =>
  s.toLowerCase().trim()
    .replace(/à/g, "a").replace(/è|é/g, "e").replace(/ì/g, "i")
    .replace(/ò/g, "o").replace(/ù/g, "u")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/* ---------- COSTANTI TAG ---------- */
const TUTTI_TAG = [
  { id: "pasta",         tKey: "chip_pasta",    cls: "tag-pasta"        },
  { id: "cereali",       tKey: "chip_cereali",  cls: "tag-cereali"      },
  { id: "legumi",        tKey: "chip_legumi",   cls: "tag-legumi"       },
  { id: "uova",          tKey: "chip_uova",     cls: "tag-uova"         },
  { id: "senza cottura", tKey: "chip_sc",       cls: "tag-senza-cottura"},
  { id: "comfort",       tKey: "chip_comfort",  cls: "tag-comfort"      },
  { id: "leggero",       tKey: "chip_leggero",  cls: "tag-leggero"      },
  { id: "speziato",      tKey: "chip_speziato", cls: "tag-speziato"     },
];

/* ---------- COSTANTI PIANO ---------- */
const GIORNI      = ["lun","mar","mer","gio","ven","sab","dom"];
const PASTI_KEYS  = ["colazione","pranzo","cena"];

function initPiano() {
  const p = {};
  GIORNI.forEach(g => { p[g] = {}; PASTI_KEYS.forEach(pa => { p[g][pa] = null; }); });
  return p;
}

/* ---------- STATO ---------- */
const stato = {
  tab: "oggi",
  lang: localStorage.getItem("orto-lang") || "it",
  filtroTempo: "tutto",
  cercaTesto: "",
  preferiti: new Set(JSON.parse(localStorage.getItem("orto-preferiti") || "[]")),
  spesa: JSON.parse(localStorage.getItem("orto-spesa") || "[]"),
  piano: JSON.parse(localStorage.getItem("orto-piano") || "null") || initPiano(),
  slotAperto: null,
  modalCerca: "",
  filtriPiano: new Set(JSON.parse(localStorage.getItem("orto-filtri") || "[]")),
  modalFiltri: new Set(),
  esclusi: new Set(JSON.parse(localStorage.getItem("orto-esclusi") || "[]")),
};

/* ---------- PERSISTENZA ---------- */
const salvaPreferiti = () => localStorage.setItem("orto-preferiti", JSON.stringify([...stato.preferiti]));
const salvaSpesa     = () => localStorage.setItem("orto-spesa", JSON.stringify(stato.spesa));
const salvaPiano     = () => localStorage.setItem("orto-piano", JSON.stringify(stato.piano));
const salvaFiltri    = () => localStorage.setItem("orto-filtri", JSON.stringify([...stato.filtriPiano]));
const salvaEsclusi   = () => localStorage.setItem("orto-esclusi", JSON.stringify([...stato.esclusi]));

/* ---------- I18N ---------- */
const t = key => {
  const src = TESTI[stato.lang] || TESTI.it;
  return src[key] !== undefined ? src[key] : (TESTI.it[key] || key);
};

function getRicette()  { return stato.lang === "en" ? RICETTE_EN : RICETTE; }
function getMenu()     { return stato.lang === "en" ? MENU_EN : MENU_GIORNO; }

function getRicettaLocalizzata(titoloIT) {
  const idx = RICETTE.findIndex(r => r.titolo === titoloIT);
  if (idx === -1) return null;
  return stato.lang === "en" ? RICETTE_EN[idx] : RICETTE[idx];
}

function switchLang(lang) {
  stato.lang = lang;
  localStorage.setItem("orto-lang", lang);

  $$(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));

  // aggiorna testi statici — il primo childNode è sempre il text node del label
  $$(".tab").forEach(btn => {
    const key = "tab_" + btn.dataset.tab;
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3);
    if (textNode) textNode.textContent = t(key) + " ";
  });
  $("#tagline").textContent = t("tagline");
  $(".piedino").textContent = t("footer");

  // aggiorna chip griglia ricette
  $$("#chips-tempo .chip").forEach(c => {
    const f = c.dataset.filtro;
    const keyMap = { tutto:"chip_tutte", pref:"chip_pref", pasta:"chip_pasta", cereali:"chip_cereali",
      legumi:"chip_legumi", uova:"chip_uova", comfort:"chip_comfort", leggero:"chip_leggero",
      speziato:"chip_speziato", "senza cottura":"chip_sc" };
    if (keyMap[f]) c.textContent = t(keyMap[f]);
  });

  // re-render
  menuRicettaAttiva = null;
  $("#area-menu-ricetta").innerHTML = "";
  $("#area-ricetta").innerHTML = "";
  $("#area-swap").innerHTML = "";
  $("#btn-random").textContent = t("btn_random");
  renderMenu();
  aggiornaBadge();
  if (stato.tab === "ricette")   { renderEsclusi(); renderGrigliaRicette(); }
  if (stato.tab === "spesa")     renderSpesa();
  if (stato.tab === "settimana") renderPiano();
}

/* ---------- HELPER TAG ---------- */
function tagLabel(tagId) {
  const info = TUTTI_TAG.find(t => t.id === tagId);
  return info ? t(info.tKey) : tagId;
}
function elTag(tagId) {
  const info = TUTTI_TAG.find(x => x.id === tagId);
  if (!info) return null;
  return el("span", "tag " + info.cls, t(info.tKey));
}

/* ---------- INGREDIENTI ESCLUSI ---------- */
const PRESET_ESCLUSI = [
  { tKey: "preset_glutine",   termini: ["pasta","farro","orzo","gnocchi","pane","noodles","tortilla","couscous","farina","bread","barley","wheat"] },
  { tKey: "preset_latticini", termini: ["parmigiano","mozzarella","ricotta","caprino","halloumi","feta","burro","panna","yogurt","formaggio","butter","cream","cheese","dairy","parmesan"] },
  { tKey: "preset_uova",      termini: ["uova","uovo","eggs","egg"] },
  { tKey: "preset_frutta",    termini: ["noci","mandorle","arachidi","nocciole","sesamo","pistacchi","nuts","almonds","peanuts","hazelnuts","sesame"] },
  { tKey: "preset_cipolla",   termini: ["cipolla","porro","cipollotto","onion","leek","spring onion"] },
  { tKey: "preset_aglio",     termini: ["aglio","garlic"] },
];

function matchIngrediente(parola, termine) {
  if (!parola || !termine) return false;
  if (parola === termine) return true;
  if (parola.includes(termine) || termine.includes(parola)) return true;
  const stem = Math.min(parola.length, termine.length) - 1;
  if (stem >= 5 && Math.abs(parola.length - termine.length) <= 2) {
    if (parola.slice(0, stem) === termine.slice(0, stem)) return true;
  }
  return false;
}

function paroleRicetta(r) {
  return norm(r.ingredienti.map(i => i.t).join(" ") + " " + r.titolo)
    .split(" ").filter(w => w.length > 1);
}

function ricettaEsclusa(r) {
  if (stato.esclusi.size === 0) return false;
  const parole = paroleRicetta(r);
  return [...stato.esclusi].some(e => parole.some(w => matchIngrediente(w, e)));
}

function ingredientiProblematici(r) {
  if (stato.esclusi.size === 0) return [];
  const parole = paroleRicetta(r);
  return [...stato.esclusi].filter(e => parole.some(w => matchIngrediente(w, e)));
}

function renderEsclusi() {
  const lista = $("#esclusi-lista");
  const count = $("#esclusi-count");
  lista.innerHTML = "";
  count.textContent = stato.esclusi.size > 0 ? stato.esclusi.size : "";

  const presetContainer = $("#esclusi-preset");
  presetContainer.innerHTML = "";
  PRESET_ESCLUSI.forEach(p => {
    const attivo = p.termini.some(te => stato.esclusi.has(te));
    const chip = el("button", "chip" + (attivo ? " gia-aggiunto" : ""), t(p.tKey));
    chip.onclick = () => {
      if (attivo) p.termini.forEach(te => stato.esclusi.delete(te));
      else        p.termini.forEach(te => stato.esclusi.add(te));
      salvaEsclusi(); renderEsclusi(); renderGrigliaRicette();
    };
    presetContainer.appendChild(chip);
  });

  [...stato.esclusi].sort().forEach(e => {
    const tag = el("div", "escluso-tag");
    tag.innerHTML = `<span>${e}</span>`;
    const rem = el("button", "escluso-remove", "×");
    rem.onclick = () => { stato.esclusi.delete(e); salvaEsclusi(); renderEsclusi(); renderGrigliaRicette(); };
    tag.appendChild(rem);
    lista.appendChild(tag);
  });

  $("#esclusi-panel .piano-filtri-titolo").textContent = t("esclusi_titolo");
  $("#esclusi-panel .ricetta-sub").innerHTML = t("esclusi_desc");
  $("#esclusi-input").placeholder = t("esclusi_placeholder");
}

function aggiungiEscluso(input) {
  const val = norm(input.value).trim();
  if (!val || val.length < 2) return;
  val.split(/[,;\s]+/).filter(w => w.length >= 2).forEach(w => stato.esclusi.add(w));
  input.value = "";
  salvaEsclusi(); renderEsclusi(); renderGrigliaRicette();
}

/* ---------- BADGE ---------- */
function aggiornaBadge() {
  const n = stato.spesa.filter(i => !i.spuntato).length;
  $("#badge-spesa").textContent = n > 0 ? n : "";
}

/* ---------- TOAST ---------- */
function toast(msg) {
  const te = el("div", "feedback-toast", msg);
  document.body.appendChild(te);
  setTimeout(() => te.remove(), 2400);
}

/* ---------- TAB ---------- */
function switchTab(tab) {
  stato.tab = tab;
  $$(".tab").forEach(te => te.classList.toggle("active", te.dataset.tab === tab));
  $$(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + tab));
  if (tab === "ricette")   { renderEsclusi(); renderGrigliaRicette(); }
  if (tab === "spesa")     renderSpesa();
  if (tab === "settimana") renderPiano();
}

/* ---------- CHIPS BUILDER ---------- */
function buildChips(container, attiviSet, onToggle, includeAll = true) {
  container.innerHTML = "";
  if (includeAll) {
    const tutteBtn = el("button", "chip" + (attiviSet.size === 0 ? " active" : ""), t("chip_tutte"));
    tutteBtn.onclick = () => { attiviSet.clear(); onToggle(); };
    container.appendChild(tutteBtn);
  }
  TUTTI_TAG.forEach(tag => {
    const isActive = attiviSet.has(tag.id);
    const chip = el("button", "chip" + (isActive ? " active" : ""), t(tag.tKey));
    chip.onclick = () => {
      if (attiviSet.has(tag.id)) attiviSet.delete(tag.id);
      else attiviSet.add(tag.id);
      onToggle();
    };
    container.appendChild(chip);
  });
}

function ricetteFiltratePerTag(pool, filtri) {
  if (!filtri || filtri.size === 0) return pool;
  return pool.filter(r => (r.tags || []).some(tag => filtri.has(tag)));
}

/* ---------- MATCHING MENU → RICETTE ---------- */
function trovRicettaSimile(testo) {
  const words = norm(testo).split(" ").filter(w => w.length > 3);
  if (words.length === 0) return null;
  let best = null, bestScore = 0;
  getRicette().forEach(r => {
    const hay = norm(r.titolo + " " + r.ingredienti.map(i => i.t).join(" "));
    const score = words.filter(w => hay.includes(w)).length / words.length;
    if (score > bestScore) { bestScore = score; best = r; }
  });
  return bestScore >= 0.32 ? best : null;
}

let menuRicettaAttiva = null;
function mostraRicettaMenu(r) {
  const area = $("#area-menu-ricetta");
  if (menuRicettaAttiva === r.titolo) {
    area.innerHTML = ""; menuRicettaAttiva = null; return;
  }
  menuRicettaAttiva = r.titolo;
  area.innerHTML = "";
  area.appendChild(cardRicetta(r, t("label_dal_menu")));
  setTimeout(() => area.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
}

/* ---------- MENÙ DEL GIORNO ---------- */
function renderMenu() {
  const oggi = new Date();
  const inizio = new Date(oggi.getFullYear(), 0, 0);
  const giorno = Math.floor((oggi - inizio) / 86400000);
  const m = getMenu()[giorno % getMenu().length];

  const data = oggi.toLocaleDateString(stato.lang === "en" ? "en-GB" : "it-IT", {
    weekday: "long", day: "numeric", month: "long",
  });
  $("#menu-data").textContent = t("menu_label") + " · " + data;
  $("#menu-tema").textContent = m.tema;

  const righe = [
    [t("pasto_col"), m.colazione],
    [t("pasto_pra"), m.pranzo],
    [t("pasto_cen"), m.cena],
    [t("pasto_spu"), m.spuntino],
  ];
  const box = $("#menu-righe");
  box.innerHTML = "";
  righe.forEach(([k, v]) => {
    const r = el("div", "menu-riga");
    r.appendChild(el("div", "menu-pasto", k));
    const ricCorr = trovRicettaSimile(v);
    if (ricCorr) {
      const btn = el("button", "menu-piatto-btn");
      btn.innerHTML = `<span>${v}</span><span class="menu-link-ico">${t("ricetta_label")}</span>`;
      btn.onclick = () => mostraRicettaMenu(ricCorr);
      r.appendChild(btn);
    } else {
      r.appendChild(el("div", "menu-piatto", v));
    }
    box.appendChild(r);
  });
}

/* ---------- CARD RICETTA COMPLETA ---------- */
function cardRicetta(r, tag, mancanti) {
  const card = el("div", "card fadein");
  if (tag) card.appendChild(el("div", "etichetta", tag));
  card.appendChild(el("h3", "ricetta-titolo", r.titolo));
  if (r.sottotitolo) card.appendChild(el("p", "ricetta-sub", r.sottotitolo));

  const meta = el("div", "ricetta-meta");
  meta.innerHTML = `<span>⏱ ${r.tempo}</span><span>🍽 ${r.porzioni} ${stato.lang === "en" ? "servings" : "porzioni"}</span>`;
  card.appendChild(meta);

  card.appendChild(el("div", "etichetta piccola", t("label_ti_servono")));
  const ul = el("ul", "ingredienti");
  r.ingredienti.forEach((ing) => {
    const testo = ing.t || ing;
    const li = el("li");
    li.textContent = testo;
    if (mancanti && mancanti.has(testo)) {
      li.classList.add("manca");
      li.innerHTML = testo + ` <span class="badge-manca">${t("badge_manca")}</span>`;
    }
    ul.appendChild(li);
  });
  card.appendChild(ul);

  card.appendChild(el("div", "etichetta piccola", t("label_procedimento")));
  const ol = el("ol", "passi");
  r.passi.forEach((p, i) => {
    const li = el("li");
    li.innerHTML = `<span class="num">${i + 1}</span><span>${p}</span>`;
    ol.appendChild(li);
  });
  card.appendChild(ol);

  if (r.consiglio) {
    const tip = el("p", "consiglio");
    tip.innerHTML = `<strong>${t("label_consiglio")}</strong>` + r.consiglio;
    card.appendChild(tip);
  }

  const btns = el("div", "card-btns");
  const bSpesa = el("button", "btn-sm", t("btn_spesa"));
  bSpesa.onclick = () => aggiungiRicettaAllaSpesa(r);
  btns.appendChild(bSpesa);
  card.appendChild(btns);

  return card;
}

/* ---------- RICETTA CASUALE ---------- */
let ultima = null;
function ricettaCasuale() {
  const pool = getRicette().filter(r => !ricettaEsclusa(r));
  const sorgente = pool.length > 0 ? pool : getRicette();
  let scelta = ultima;
  while (sorgente.length > 1 && scelta === ultima) {
    scelta = sorgente[Math.floor(Math.random() * sorgente.length)];
  }
  ultima = scelta;

  const out = $("#area-ricetta");
  out.innerHTML = "";
  out.appendChild(cardRicetta(scelta, t("label_pesca")));

  const b = el("button", "btn btn-ghost mt", t("btn_no_ing"));
  b.onclick = mostraSwap;
  out.appendChild(b);

  $("#btn-random").textContent = t("btn_random_again");
  $("#area-swap").innerHTML = "";
}

/* ---------- PANNELLO "COSA HO IN CASA" ---------- */
function mostraSwap() {
  const area = $("#area-swap");
  area.innerHTML = "";

  const box = el("div", "card fadein");
  box.appendChild(el("div", "etichetta", t("swap_titolo")));
  box.appendChild(el("p", "ricetta-sub", t("swap_desc")));

  const ta = el("textarea");
  ta.placeholder = t("swap_placeholder");
  ta.rows = 3;
  box.appendChild(ta);

  const b = el("button", "btn btn-primary mt", t("btn_trova"));
  b.onclick = () => elaboraIngredienti(ta.value, box);
  box.appendChild(b);

  box.appendChild(el("div", "risultati-swap"));
  area.appendChild(box);
  ta.focus();
}

/* ---------- MATCH + GENERATORE ---------- */
function elaboraIngredienti(testo, box) {
  const risultati = box.querySelector(".risultati-swap");
  risultati.innerHTML = "";
  const ho = norm(testo).split(" ").filter(w => w.length > 2);
  if (ho.length === 0) {
    risultati.appendChild(el("p", "errore", stato.lang === "en" ? "Write at least one ingredient 🙂" : "Scrivi almeno un ingrediente 🙂"));
    return;
  }

  const possiede = (key) =>
    key.some(k => { const kn = norm(k); return ho.some(h => kn.includes(h) || h.includes(kn)); });

  const classificate = getRicette().map(r => {
    let avuti = 0;
    const mancanti = new Set();
    r.ingredienti.forEach(ing => {
      if (possiede(ing.key)) avuti++;
      else mancanti.add(ing.t);
    });
    return { r, punteggio: avuti / r.ingredienti.length, avuti, mancanti };
  }).filter(x => x.avuti > 0)
    .sort((a, b) => b.punteggio - a.punteggio || b.avuti - a.avuti);

  const generata = generaRicetta(testo, ho);
  risultati.appendChild(el("div", "etichetta piccola mt", t("label_creata")));
  risultati.appendChild(cardRicetta(generata, null));

  if (classificate.length) {
    risultati.appendChild(el("div", "etichetta piccola mt-big", t("label_dal_ricettario")));
    classificate.slice(0, 3).forEach(x => {
      const perc = Math.round(x.punteggio * 100);
      risultati.appendChild(cardRicetta(x.r, t("label_pct")(perc), x.mancanti));
    });
  }
}

function generaRicetta(testoOriginale, parole) {
  const DIZ = t("diz");
  const trova = (cat) => {
    const out = [];
    parole.forEach(p => {
      DIZ[cat].forEach(d => {
        if ((d.includes(p) || p.includes(d)) && !out.includes(d)) out.push(d);
      });
    });
    return out;
  };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const pro = trova("proteine"), car = trova("carbo"),
        ver = trova("verdure"), aro = trova("aromi"), gra = trova("grassi");

  let metodo;
  if (car.some(c => ["pasta","noodles","gnocchi"].includes(c)))                  metodo = "pasta";
  else if (car.some(c => ["riso","orzo","farro","quinoa","couscous","rice","spelt","orzo"].includes(c))) metodo = "cereali";
  else if (pro.includes("uova") || pro.includes("uovo") || pro.includes("eggs") || pro.includes("egg")) metodo = "uova";
  else if (ver.length >= 2 && car.length === 0)                                  metodo = "saltato";
  else                                                                            metodo = "zuppa";

  const aglioCipolla = (aro.some(a => ["aglio","garlic"].includes(a)) || ver.some(v => ["cipolla","onion"].includes(v)))
    ? (ver.some(v => ["cipolla","onion"].includes(v)) ? (ver.find(v => ["cipolla","onion"].includes(v))) : (aro.find(a => ["aglio","garlic"].includes(a))))
    : (stato.lang === "en" ? "a drizzle of oil" : "un filo d'olio");

  const verList = ver.length ? ver.join(", ") : (stato.lang === "en" ? "the vegetables you have" : "le verdure che hai");
  const proList = pro.length ? pro.join(stato.lang === "en" ? " and " : " e ") : "";

  let titolo;
  if (metodo === "pasta")    titolo = t("gen_titolo_pasta")(ver[0], pro[0]);
  else if (metodo === "cereali") titolo = t("gen_titolo_cer")(car[0], ver[0], pro[0]);
  else if (metodo === "uova")    titolo = t("gen_titolo_uova")(ver.slice(0,2).map(cap).join(stato.lang === "en" ? " and " : " e "));
  else if (metodo === "saltato") titolo = t("gen_titolo_salt")(ver.slice(0,2).map(cap).join(stato.lang === "en" ? " and " : " e "));
  else                           titolo = t("gen_titolo_zupp")(ver[0], pro[0]);

  const ingredienti = [];
  const aggiungi = lista => lista.forEach(x => ingredienti.push({ t: cap(x) }));
  aggiungi(pro); aggiungi(car); aggiungi(ver); aggiungi(aro);
  if (gra.length) aggiungi(gra);
  ingredienti.push({ t: stato.lang === "en" ? "Olive oil, salt and pepper (basics)" : "Olio, sale e pepe (le basi)" });
  if (ingredienti.length <= 1) ingredienti.unshift({ t: cap(parole[0]) });

  let passi;
  if (metodo === "pasta")    passi = t("gen_pasta")(car[0], aglioCipolla, verList, proList);
  else if (metodo === "cereali") passi = t("gen_cereali")(car[0], verList, aglioCipolla, proList);
  else if (metodo === "uova")    passi = t("gen_uova")(verList, aglioCipolla);
  else if (metodo === "saltato") passi = t("gen_saltato")(aglioCipolla, verList, proList);
  else                           passi = t("gen_zuppa")(aglioCipolla, verList, proList);

  return {
    titolo,
    sottotitolo: t("label_inventata"),
    tempo: stato.lang === "en" ? "about 25 min" : "circa 25 min",
    porzioni: 2,
    ingredienti,
    passi,
    consiglio: t("consiglio_gen"),
  };
}

/* ---------- GRIGLIA RICETTE ---------- */
function parseTempo(te) {
  const m = (te || "").match(/\d+/);
  return m ? parseInt(m[0]) : 99;
}

function renderGrigliaRicette() {
  const cerca = norm(stato.cercaTesto);
  const filtro = stato.filtroTempo;

  const filtrate = getRicette().filter(r => {
    if (filtro === "pref" && !stato.preferiti.has(RICETTE[getRicette().indexOf(r)]?.titolo || r.titolo)) return false;
    if (filtro === "20"   && parseTempo(r.tempo) > 20) return false;
    if (filtro === "30"   && parseTempo(r.tempo) > 30) return false;
    const isTagFiltro = TUTTI_TAG.some(tag => tag.id === filtro);
    if (isTagFiltro && !(r.tags || []).includes(filtro)) return false;
    if (cerca) {
      const hay = norm(r.titolo + " " + (r.sottotitolo || "") + " " + r.ingredienti.map(i => i.t).join(" "));
      if (!cerca.split(" ").filter(w => w.length > 1).every(w => hay.includes(w))) return false;
    }
    return true;
  });

  const nEscluse = filtrate.filter(r => ricettaEsclusa(r)).length;
  const visibili  = filtrate.filter(r => !ricettaEsclusa(r));

  const grid = $("#griglia-ricette");
  grid.innerHTML = "";

  if (filtrate.length === 0) {
    const msg = el("p", "errore");
    msg.style.marginTop = "20px";
    msg.textContent = filtro === "pref" ? t("msg_no_pref") : t("msg_no_trovate");
    grid.appendChild(msg);
    return;
  }

  if (nEscluse > 0) {
    const nota = el("p", "ricetta-sub fadein");
    nota.style.cssText = "margin-bottom:12px;font-size:13px;";
    nota.textContent = t("msg_nascoste")(nEscluse);
    grid.appendChild(nota);
  }

  if (visibili.length === 0) {
    const msg = el("p", "errore");
    msg.style.marginTop = "8px";
    msg.textContent = t("msg_no_filtri");
    grid.appendChild(msg);
    return;
  }

  filtrate.forEach((r, fi) => {
    if (ricettaEsclusa(r)) return;
    // indice nella lista italiana per il check preferiti
    const riIdx = getRicette().indexOf(r);
    const titoloIT = RICETTE[riIdx]?.titolo || r.titolo;

    const card = el("div", "card-compact fadein");
    const header = el("div", "card-compact-header");

    const info = el("div", "card-compact-info");
    info.appendChild(el("div", "card-compact-title", r.titolo));
    info.appendChild(el("div", "card-compact-meta", `⏱ ${r.tempo} · 🍽 ${r.porzioni} ${stato.lang === "en" ? "servings" : "porzioni"}`));
    if (r.tags && r.tags.length) {
      const tl = el("div", "tags-lista");
      r.tags.forEach(tag => { const tEl = elTag(tag); if (tEl) tl.appendChild(tEl); });
      info.appendChild(tl);
    }
    header.appendChild(info);

    const actions = el("div", "card-compact-actions");
    const isFav = stato.preferiti.has(titoloIT);
    const heartBtn = el("button", "btn-heart" + (isFav ? " attivo" : ""), isFav ? "♥" : "♡");
    heartBtn.title = stato.lang === "en" ? "Save as favourite" : "Salva tra i preferiti";
    heartBtn.onclick = e => { e.stopPropagation(); togglePreferito(titoloIT, heartBtn); };
    actions.appendChild(heartBtn);
    header.appendChild(actions);

    header.onclick = () => toggleCardCompact(card, r, titoloIT);
    card.appendChild(header);
    card.appendChild(el("div", "card-compact-body"));
    grid.appendChild(card);
  });
}

function togglePreferito(titoloIT, btn) {
  if (stato.preferiti.has(titoloIT)) {
    stato.preferiti.delete(titoloIT); btn.textContent = "♡"; btn.classList.remove("attivo");
  } else {
    stato.preferiti.add(titoloIT);   btn.textContent = "♥"; btn.classList.add("attivo");
  }
  salvaPreferiti();
  if (stato.filtroTempo === "pref") renderGrigliaRicette();
}

function toggleCardCompact(card, r, titoloIT) {
  const isOpen = card.classList.contains("aperta");
  $$(".card-compact.aperta").forEach(c => {
    c.classList.remove("aperta");
    c.querySelector(".card-compact-body").innerHTML = "";
  });
  if (!isOpen) {
    card.classList.add("aperta");
    const body = card.querySelector(".card-compact-body");
    if (r.sottotitolo) body.appendChild(el("p", "ricetta-sub", r.sottotitolo));
    const meta = el("div", "ricetta-meta");
    meta.innerHTML = `<span>⏱ ${r.tempo}</span><span>🍽 ${r.porzioni} ${stato.lang === "en" ? "servings" : "porzioni"}</span>`;
    body.appendChild(meta);
    body.appendChild(el("div", "etichetta piccola", t("label_ti_servono")));
    const ul = el("ul", "ingredienti");
    r.ingredienti.forEach(ing => { const li = el("li"); li.textContent = ing.t || ing; ul.appendChild(li); });
    body.appendChild(ul);
    body.appendChild(el("div", "etichetta piccola", t("label_procedimento")));
    const ol = el("ol", "passi");
    r.passi.forEach((p, i) => { const li = el("li"); li.innerHTML = `<span class="num">${i+1}</span><span>${p}</span>`; ol.appendChild(li); });
    body.appendChild(ol);
    if (r.consiglio) {
      const tip = el("p", "consiglio");
      tip.innerHTML = `<strong>${t("label_consiglio")}</strong>` + r.consiglio;
      body.appendChild(tip);
    }
    const btns = el("div", "card-btns");
    const bSpesa = el("button", "btn-sm", t("btn_spesa"));
    bSpesa.onclick = () => aggiungiRicettaAllaSpesa(r, titoloIT);
    btns.appendChild(bSpesa);
    body.appendChild(btns);
    setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  }
}

/* ---------- LISTA DELLA SPESA ---------- */
function aggiungiRicettaAllaSpesa(r, titoloIT) {
  const fonte = titoloIT || r.titolo;
  const nuovi = r.ingredienti.filter(
    ing => !stato.spesa.some(i => i.testo === (ing.t || ing) && i.fonte === fonte)
  ).map(ing => ({ id: Date.now() + Math.random(), testo: ing.t || ing, spuntato: false, fonte }));

  if (nuovi.length === 0) { toast(t("toast_gia")); return; }
  stato.spesa.push(...nuovi);
  salvaSpesa(); aggiornaBadge();
  toast(t("toast_spesa")(r.titolo));
}

function renderSpesa() {
  const area = $("#area-spesa");
  area.innerHTML = "";

  const addRow = el("div", "spesa-add");
  const addInput = el("input");
  addInput.type = "text";
  addInput.placeholder = t("spesa_placeholder");
  addInput.onkeydown = e => { if (e.key === "Enter") aggiungiManuale(addInput); };
  addRow.appendChild(addInput);
  const addBtn = el("button", "btn-spesa-add", "＋");
  addBtn.onclick = () => aggiungiManuale(addInput);
  addRow.appendChild(addBtn);
  area.appendChild(addRow);

  if (stato.spesa.length === 0) {
    const vuota = el("div", "spesa-vuota fadein");
    vuota.innerHTML = '<div class="ico">🛒</div><p>' + t("spesa_vuota") + '</p>';
    area.appendChild(vuota);
    return;
  }

  const fonti = {};
  stato.spesa.forEach(item => {
    if (!fonti[item.fonte]) fonti[item.fonte] = [];
    fonti[item.fonte].push(item);
  });

  const ordine = Object.keys(fonti).sort(a => a === "manuale" ? 1 : -1);
  ordine.forEach(fonte => {
    const sez = el("div", "spesa-sezione fadein");
    sez.appendChild(el("div", "spesa-fonte", fonte === "manuale" ? t("spesa_a_mano") : fonte));
    fonti[fonte].forEach(item => {
      const row = el("div", "spesa-item" + (item.spuntato ? " spuntato" : ""));
      const cb = el("input"); cb.type = "checkbox"; cb.checked = item.spuntato;
      cb.onchange = () => toggleSpuntato(item.id);
      row.appendChild(cb);
      row.appendChild(el("span", "spesa-testo", item.testo));
      const del = el("button", "btn-del-item", "×");
      del.onclick = () => rimuoviItem(item.id);
      row.appendChild(del);
      sez.appendChild(row);
    });
    area.appendChild(sez);
  });

  const azioni = el("div", "spesa-azioni fadein");
  const copiaBtn = el("button", "btn-sm", t("btn_copia"));
  copiaBtn.onclick = copiaLista;
  azioni.appendChild(copiaBtn);
  const svuotaBtn = el("button", "btn-sm", t("btn_svuota_lista"));
  svuotaBtn.onclick = svuotaLista;
  azioni.appendChild(svuotaBtn);
  area.appendChild(azioni);
}

function aggiungiManuale(input) {
  const testo = input.value.trim();
  if (!testo) return;
  stato.spesa.push({ id: Date.now() + Math.random(), testo, spuntato: false, fonte: "manuale" });
  input.value = "";
  salvaSpesa(); aggiornaBadge(); renderSpesa();
  setTimeout(() => $("#area-spesa .spesa-add input").focus(), 50);
}

function toggleSpuntato(id) {
  const item = stato.spesa.find(i => i.id === id);
  if (item) { item.spuntato = !item.spuntato; salvaSpesa(); aggiornaBadge(); renderSpesa(); }
}
function rimuoviItem(id) {
  stato.spesa = stato.spesa.filter(i => i.id !== id);
  salvaSpesa(); aggiornaBadge(); renderSpesa();
}
function svuotaLista()  { stato.spesa = []; salvaSpesa(); aggiornaBadge(); renderSpesa(); }
function copiaLista() {
  const righe = [];
  const fonti = {};
  stato.spesa.forEach(i => { if (!fonti[i.fonte]) fonti[i.fonte] = []; fonti[i.fonte].push(i); });
  Object.entries(fonti).forEach(([fonte, items]) => {
    righe.push(`\n— ${fonte === "manuale" ? t("spesa_a_mano") : fonte} —`);
    items.forEach(i => righe.push((i.spuntato ? "✓ " : "• ") + i.testo));
  });
  navigator.clipboard.writeText(righe.join("\n").trim()).then(() => toast(t("toast_copiata")));
}

/* ---------- PIANO SETTIMANALE ---------- */
function renderPiano() {
  const area = $("#area-settimana");
  area.innerHTML = "";

  const hdr = el("div", "piano-header");
  const autoBtn = el("button", "btn-sm", t("btn_auto"));
  autoBtn.onclick = riempiPianoAuto;
  hdr.appendChild(autoBtn);
  const spesaBtn = el("button", "btn-sm", t("btn_sett_spesa"));
  spesaBtn.onclick = aggiungiSettimanaAllaSpesa;
  hdr.appendChild(spesaBtn);
  const resetBtn = el("button", "btn-sm", t("btn_svuota_piano"));
  resetBtn.onclick = svuotaPiano;
  hdr.appendChild(resetBtn);
  area.appendChild(hdr);

  const filtriBox = el("div", "piano-filtri");
  filtriBox.appendChild(el("div", "piano-filtri-titolo", t("filtri_titolo")));
  const chipsContainer = el("div", "chips");
  buildChips(chipsContainer, stato.filtriPiano, () => { salvaFiltri(); renderPiano(); });
  filtriBox.appendChild(chipsContainer);
  const nRicette = ricetteFiltratePerTag(getRicette(), stato.filtriPiano).length;
  const descFiltro = el("p", "ricetta-sub");
  descFiltro.style.cssText = "margin-top:10px;font-size:13px;";
  descFiltro.textContent = stato.filtriPiano.size === 0 ? t("tutte_ric")(getRicette().length) : t("n_ric_match")(nRicette);
  filtriBox.appendChild(descFiltro);
  area.appendChild(filtriBox);

  const GIORNI_NOMI = t("giorni");
  const PASTI_NOMI  = t("pasti");

  GIORNI.forEach((g, gi) => {
    const gDiv = el("div", "piano-giorno fadein");
    gDiv.appendChild(el("div", "piano-giorno-nome", GIORNI_NOMI[gi]));
    const pasti = el("div", "piano-pasti");
    PASTI_KEYS.forEach((p, pi) => {
      const slot = el("div", "piano-slot");
      const titoloIT = stato.piano[g][p];
      slot.appendChild(el("div", "piano-slot-pasto", PASTI_NOMI[pi]));
      if (titoloIT) {
        slot.classList.add("pieno");
        const r = getRicettaLocalizzata(titoloIT);
        slot.appendChild(el("div", "piano-slot-ricetta", r ? r.titolo : titoloIT));
        const del = el("button", "piano-slot-del", "×");
        del.onclick = e => { e.stopPropagation(); rimuoviDalPiano(g, p); };
        slot.appendChild(del);
      } else {
        slot.appendChild(el("div", "piano-slot-vuoto", "+"));
      }
      slot.onclick = () => apriModal(g, p);
      pasti.appendChild(slot);
    });
    gDiv.appendChild(pasti);
    area.appendChild(gDiv);
  });
}

function riempiPianoAuto() {
  const conTag = ricetteFiltratePerTag(RICETTE, stato.filtriPiano);
  const senzaEscluse = conTag.filter(r => !ricettaEsclusa(r));
  const pool = senzaEscluse.length > 0 ? [...senzaEscluse] : (conTag.length > 0 ? [...conTag] : [...RICETTE]);
  pool.sort(() => Math.random() - 0.5);
  let idx = 0;
  GIORNI.forEach(g => { PASTI_KEYS.forEach(p => { stato.piano[g][p] = pool[idx % pool.length].titolo; idx++; }); });
  salvaPiano(); renderPiano();
  toast(t("toast_piano"));
}

function svuotaPiano() { stato.piano = initPiano(); salvaPiano(); renderPiano(); }

function rimuoviDalPiano(giorno, pasto) { stato.piano[giorno][pasto] = null; salvaPiano(); renderPiano(); }

function aggiungiSettimanaAllaSpesa() {
  let aggiunti = 0;
  GIORNI.forEach(g => {
    PASTI_KEYS.forEach(p => {
      const titoloIT = stato.piano[g][p];
      if (!titoloIT) return;
      const rIT = RICETTE.find(r => r.titolo === titoloIT);
      const rLoc = getRicettaLocalizzata(titoloIT);
      if (!rLoc) return;
      rLoc.ingredienti.forEach(ing => {
        const testo = ing.t || ing;
        if (!stato.spesa.some(i => i.testo === testo && i.fonte === titoloIT)) {
          stato.spesa.push({ id: Date.now() + Math.random(), testo, spuntato: false, fonte: titoloIT });
          aggiunti++;
        }
      });
    });
  });
  salvaSpesa(); aggiornaBadge();
  toast(t("toast_art")(aggiunti));
}

/* ---------- MODAL SELEZIONE RICETTA ---------- */
function apriModal(giorno, pasto) {
  stato.slotAperto = { giorno, pasto };
  stato.modalCerca = "";
  stato.modalFiltri = new Set([...stato.filtriPiano]);
  $("#modal-cerca").value = "";
  $("#modal-cerca").placeholder = t("modal_cerca");
  buildChips($("#modal-chips"), stato.modalFiltri, renderModalLista);
  renderModalLista();
  $("#modal-overlay").classList.remove("hidden");
  setTimeout(() => $("#modal-cerca").focus(), 150);
}

function chiudiModal() { $("#modal-overlay").classList.add("hidden"); stato.slotAperto = null; }

function renderModalLista() {
  const cerca = norm(stato.modalCerca);
  const lista = $("#modal-lista");
  lista.innerHTML = "";

  // update modal title
  $(".modal-header .etichetta").textContent = t("modal_titolo");

  if (stato.slotAperto) {
    const { giorno, pasto } = stato.slotAperto;
    if (stato.piano[giorno][pasto]) {
      const rimuovi = el("div", "modal-ricetta-item modal-rimuovi");
      rimuovi.innerHTML = `<span><div class="modal-ricetta-nome">${t("modal_rimuovi")}</div></span>`;
      rimuovi.onclick = () => { rimuoviDalPiano(giorno, pasto); chiudiModal(); };
      lista.appendChild(rimuovi);
    }
  }

  let filtrate = ricetteFiltratePerTag(RICETTE, stato.modalFiltri);
  if (cerca) {
    filtrate = filtrate.filter(r => {
      const hay = norm(r.titolo + " " + r.ingredienti.map(i => i.t).join(" "));
      return cerca.split(" ").filter(w => w.length > 1).every(w => hay.includes(w));
    });
  }

  if (filtrate.length === 0) { lista.appendChild(el("p", "errore", t("msg_no_trovate"))); return; }

  filtrate.forEach(rIT => {
    const r = getRicettaLocalizzata(rIT.titolo) || rIT;
    const isFav = stato.preferiti.has(rIT.titolo);
    const prob = ingredientiProblematici(rIT);
    const tagHtml = (rIT.tags || []).map(tag => {
      const info = TUTTI_TAG.find(x => x.id === tag);
      return info ? `<span class="tag ${info.cls}">${t(info.tKey)}</span>` : "";
    }).join("");
    const item = el("div", "modal-ricetta-item" + (prob.length > 0 ? " esclusa-modal" : ""));
    item.innerHTML = `
      <div>
        <div class="modal-ricetta-nome">${r.titolo}${isFav ? ' <span class="modal-fav">♥</span>' : ''}</div>
        <div class="modal-ricetta-tempo">⏱ ${r.tempo} · 🍽 ${r.porzioni} ${stato.lang === "en" ? "servings" : "porzioni"}</div>
        ${prob.length > 0 ? `<div class="modal-escluso">⚠ ${stato.lang === "en" ? "contains" : "contiene"}: ${prob.join(", ")}</div>` : ""}
        ${tagHtml ? `<div class="tags-lista" style="margin-top:5px">${tagHtml}</div>` : ""}
      </div>
      <span class="modal-freccia">›</span>
    `;
    item.onclick = () => {
      if (!stato.slotAperto) return;
      const { giorno, pasto } = stato.slotAperto;
      stato.piano[giorno][pasto] = rIT.titolo; // sempre italiano come chiave
      salvaPiano(); renderPiano(); chiudiModal();
    };
    lista.appendChild(item);
  });
}

/* ---------- AVVIO ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // applica lingua salvata ai tab
  const langInit = stato.lang;
  if (langInit === "en") {
    $$(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === "en"));
    $("#tagline").textContent = TESTI.en.tagline;
    $(".piedino").textContent = TESTI.en.footer;
  }

  renderMenu();
  aggiornaBadge();

  $("#btn-random").addEventListener("click", ricettaCasuale);

  $$(".tab").forEach(te => te.addEventListener("click", () => switchTab(te.dataset.tab)));

  $$(".chip").forEach(c => c.addEventListener("click", () => {
    stato.filtroTempo = c.dataset.filtro;
    $$(".chip").forEach(x => x.classList.toggle("active", x === c));
    renderGrigliaRicette();
  }));

  $("#cerca-ricette").addEventListener("input", e => { stato.cercaTesto = e.target.value; renderGrigliaRicette(); });
  $("#cerca-ricette").placeholder = t("cerca_placeholder");

  $("#esclusi-toggle").addEventListener("click", () => $("#esclusi-panel").classList.toggle("aperto"));
  $("#esclusi-add-btn").addEventListener("click", () => aggiungiEscluso($("#esclusi-input")));
  $("#esclusi-input").addEventListener("keydown", e => { if (e.key === "Enter") aggiungiEscluso(e.target); });

  $("#modal-overlay").addEventListener("click", e => { if (e.target === $("#modal-overlay")) chiudiModal(); });
  $("#modal-close").addEventListener("click", chiudiModal);
  document.addEventListener("keydown", e => { if (e.key === "Escape") chiudiModal(); });
  $("#modal-cerca").addEventListener("input", e => { stato.modalCerca = e.target.value; renderModalLista(); });

  $$(".lang-btn").forEach(b => b.addEventListener("click", () => switchLang(b.dataset.lang)));
});
