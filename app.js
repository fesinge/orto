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
  { id: "pasta",        label: "Pasta",        cls: "tag-pasta"       },
  { id: "cereali",      label: "Cereali",       cls: "tag-cereali"     },
  { id: "legumi",       label: "Legumi",        cls: "tag-legumi"      },
  { id: "uova",         label: "Uova",          cls: "tag-uova"        },
  { id: "senza cottura",label: "Senza cottura", cls: "tag-senza-cottura"},
  { id: "comfort",      label: "Comfort",       cls: "tag-comfort"     },
  { id: "leggero",      label: "Leggero",       cls: "tag-leggero"     },
  { id: "speziato",     label: "Speziato",      cls: "tag-speziato"    },
];

/* ---------- COSTANTI PIANO ---------- */
const GIORNI     = ["lun","mar","mer","gio","ven","sab","dom"];
const GIORNI_NOMI = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];
const PASTI      = ["colazione","pranzo","cena"];
const PASTI_NOMI = ["Colazione","Pranzo","Cena"];

function initPiano() {
  const p = {};
  GIORNI.forEach(g => {
    p[g] = {};
    PASTI.forEach(pa => { p[g][pa] = null; });
  });
  return p;
}

/* ---------- STATO ---------- */
const stato = {
  tab: "oggi",
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
const salvaPreferiti  = () => localStorage.setItem("orto-preferiti", JSON.stringify([...stato.preferiti]));
const salvaSpesa      = () => localStorage.setItem("orto-spesa", JSON.stringify(stato.spesa));
const salvaPiano      = () => localStorage.setItem("orto-piano", JSON.stringify(stato.piano));
const salvaFiltri     = () => localStorage.setItem("orto-filtri", JSON.stringify([...stato.filtriPiano]));
const salvaEsclusi    = () => localStorage.setItem("orto-esclusi", JSON.stringify([...stato.esclusi]));

/* ---------- HELPER TAG ---------- */
function tagCls(tagId) {
  return (TUTTI_TAG.find(t => t.id === tagId) || {}).cls || "";
}

function elTag(tagId) {
  const info = TUTTI_TAG.find(t => t.id === tagId);
  if (!info) return null;
  return el("span", "tag " + info.cls, info.label);
}

function ricetteFiltratePerTag(pool, filtri) {
  if (!filtri || filtri.size === 0) return pool;
  return pool.filter(r => (r.tags || []).some(t => filtri.has(t)));
}

function buildChips(container, attiviSet, onToggle, includeAll = true) {
  container.innerHTML = "";
  if (includeAll) {
    const tutteBtn = el("button", "chip" + (attiviSet.size === 0 ? " active" : ""), "Tutte");
    tutteBtn.onclick = () => { attiviSet.clear(); onToggle(); };
    container.appendChild(tutteBtn);
  }
  TUTTI_TAG.forEach(t => {
    const isActive = attiviSet.has(t.id);
    const chip = el("button", "chip" + (isActive ? " active" : ""), t.label);
    chip.style.setProperty("--chip-color", "");
    chip.onclick = () => {
      if (attiviSet.has(t.id)) attiviSet.delete(t.id);
      else attiviSet.add(t.id);
      onToggle();
    };
    container.appendChild(chip);
  });
}

/* ---------- INGREDIENTI ESCLUSI ---------- */
const PRESET_ESCLUSI = [
  { label: "Glutine",      termini: ["pasta","farro","orzo","gnocchi","pane","noodles","tortilla","couscous","farina"] },
  { label: "Latticini",    termini: ["parmigiano","mozzarella","ricotta","caprino","halloumi","feta","burro","panna","yogurt","formaggio"] },
  { label: "Uova",         termini: ["uova","uovo"] },
  { label: "Frutta secca", termini: ["noci","mandorle","arachidi","nocciole","sesamo","pistacchi"] },
  { label: "Cipolla",      termini: ["cipolla","porro","cipollotto"] },
  { label: "Aglio",        termini: ["aglio"] },
];

function matchIngrediente(parola, termine) {
  if (parola === termine) return true;
  if (parola.includes(termine) || termine.includes(parola)) return true;
  // plurali italiani: cipolla↔cipolle, zucchina↔zucchine, patata↔patate ecc.
  // confronta lo stem (tutti i char tranne l'ultimo) se abbastanza lungo
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
  count.textContent = stato.esclusi.size > 0 ? stato.esclusi.size + " esclus" + (stato.esclusi.size === 1 ? "o" : "i") : "";

  // aggiorna preset chips
  const presetContainer = $("#esclusi-preset");
  presetContainer.innerHTML = "";
  PRESET_ESCLUSI.forEach(p => {
    const attivo = p.termini.some(t => stato.esclusi.has(t));
    const chip = el("button", "chip" + (attivo ? " gia-aggiunto" : ""), p.label);
    chip.onclick = () => {
      if (attivo) {
        p.termini.forEach(t => stato.esclusi.delete(t));
      } else {
        p.termini.forEach(t => stato.esclusi.add(t));
      }
      salvaEsclusi();
      renderEsclusi();
      renderGrigliaRicette();
    };
    presetContainer.appendChild(chip);
  });

  // tag rimovibili
  [...stato.esclusi].sort().forEach(e => {
    const tag = el("div", "escluso-tag");
    tag.innerHTML = `<span>${e}</span>`;
    const rem = el("button", "escluso-remove", "×");
    rem.onclick = () => { stato.esclusi.delete(e); salvaEsclusi(); renderEsclusi(); renderGrigliaRicette(); };
    tag.appendChild(rem);
    lista.appendChild(tag);
  });
}

function aggiungiEscluso(input) {
  const val = norm(input.value).trim();
  if (!val || val.length < 2) return;
  val.split(/[,;\s]+/).filter(w => w.length >= 2).forEach(w => stato.esclusi.add(w));
  input.value = "";
  salvaEsclusi();
  renderEsclusi();
  renderGrigliaRicette();
}

/* ---------- BADGE ---------- */
function aggiornaBadge() {
  const n = stato.spesa.filter(i => !i.spuntato).length;
  $("#badge-spesa").textContent = n > 0 ? n : "";
}

/* ---------- TOAST ---------- */
function toast(msg) {
  const t = el("div", "feedback-toast", msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ---------- TAB ---------- */
function switchTab(tab) {
  stato.tab = tab;
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $$(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + tab));
  if (tab === "ricette")  { renderEsclusi(); renderGrigliaRicette(); }
  if (tab === "spesa")    renderSpesa();
  if (tab === "settimana") renderPiano();
}

/* ---------- MATCHING MENU → RICETTE ---------- */
function trovRicettaSimile(testo) {
  const words = norm(testo).split(" ").filter(w => w.length > 3);
  if (words.length === 0) return null;
  let best = null, bestScore = 0;
  RICETTE.forEach(r => {
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
    area.innerHTML = "";
    menuRicettaAttiva = null;
    return;
  }
  menuRicettaAttiva = r.titolo;
  area.innerHTML = "";
  area.appendChild(cardRicetta(r, "Dal menù di oggi"));
  setTimeout(() => area.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
}

/* ---------- MENÙ DEL GIORNO ---------- */
function renderMenu() {
  const oggi = new Date();
  const inizio = new Date(oggi.getFullYear(), 0, 0);
  const giorno = Math.floor((oggi - inizio) / 86400000);
  const m = MENU_GIORNO[giorno % MENU_GIORNO.length];

  const data = oggi.toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long",
  });
  $("#menu-data").textContent = "Menù del giorno · " + data;
  $("#menu-tema").textContent = m.tema;

  const righe = [
    ["Colazione", m.colazione],
    ["Pranzo",    m.pranzo],
    ["Cena",      m.cena],
    ["Spuntino",  m.spuntino],
  ];
  const box = $("#menu-righe");
  box.innerHTML = "";
  righe.forEach(([k, v]) => {
    const r = el("div", "menu-riga");
    r.appendChild(el("div", "menu-pasto", k));
    const ricCorr = trovRicettaSimile(v);
    if (ricCorr) {
      const btn = el("button", "menu-piatto-btn");
      btn.innerHTML = `<span>${v}</span><span class="menu-link-ico">ricetta</span>`;
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
  meta.innerHTML = `<span>⏱ ${r.tempo}</span><span>🍽 ${r.porzioni} porzioni</span>`;
  card.appendChild(meta);

  card.appendChild(el("div", "etichetta piccola", "Ti servono"));
  const ul = el("ul", "ingredienti");
  r.ingredienti.forEach((ing) => {
    const testo = ing.t || ing;
    const li = el("li");
    li.textContent = testo;
    if (mancanti && mancanti.has(testo)) {
      li.classList.add("manca");
      li.innerHTML = testo + ' <span class="badge-manca">da comprare</span>';
    }
    ul.appendChild(li);
  });
  card.appendChild(ul);

  card.appendChild(el("div", "etichetta piccola", "Procedimento"));
  const ol = el("ol", "passi");
  r.passi.forEach((p, i) => {
    const li = el("li");
    li.innerHTML = `<span class="num">${i + 1}</span><span>${p}</span>`;
    ol.appendChild(li);
  });
  card.appendChild(ol);

  if (r.consiglio) {
    const tip = el("p", "consiglio");
    tip.innerHTML = "<strong>Consiglio · </strong>" + r.consiglio;
    card.appendChild(tip);
  }

  const btns = el("div", "card-btns");
  const bSpesa = el("button", "btn-sm", "🛒 Aggiungi alla spesa");
  bSpesa.onclick = () => aggiungiRicettaAllaSpesa(r);
  btns.appendChild(bSpesa);
  card.appendChild(btns);

  return card;
}

/* ---------- RICETTA CASUALE ---------- */
let ultima = null;
function ricettaCasuale() {
  const pool = RICETTE.filter(r => !ricettaEsclusa(r));
  const sorgente = pool.length > 0 ? pool : RICETTE;
  let scelta = ultima;
  while (sorgente.length > 1 && scelta === ultima) {
    scelta = sorgente[Math.floor(Math.random() * sorgente.length)];
  }
  ultima = scelta;

  const out = $("#area-ricetta");
  out.innerHTML = "";
  out.appendChild(cardRicetta(scelta, "Pesca del giorno"));

  const b = el("button", "btn btn-ghost mt", "Non ho questi ingredienti →");
  b.onclick = mostraSwap;
  out.appendChild(b);

  $("#btn-random").textContent = "🎲  Sorprendimi di nuovo";
  $("#area-swap").innerHTML = "";
}

/* ---------- PANNELLO "COSA HO IN CASA" ---------- */
function mostraSwap() {
  const area = $("#area-swap");
  area.innerHTML = "";

  const box = el("div", "card fadein");
  box.appendChild(el("div", "etichetta", "Cucina con quello che hai"));
  box.appendChild(el("p", "ricetta-sub",
    "Scrivi cosa hai davvero in cucina e ti propongo le ricette più adatte — e te ne compongo una su misura."));

  const ta = el("textarea");
  ta.placeholder = "es. uova, spinaci, feta, mezza cipolla, riso avanzato…";
  ta.rows = 3;
  box.appendChild(ta);

  const b = el("button", "btn btn-primary mt", "✦  Trova e crea una ricetta");
  b.onclick = () => elaboraIngredienti(ta.value, box);
  box.appendChild(b);

  const risultati = el("div", "risultati-swap");
  box.appendChild(risultati);

  area.appendChild(box);
  ta.focus();
}

/* ---------- MATCH + GENERATORE ---------- */
function elaboraIngredienti(testo, box) {
  const risultati = box.querySelector(".risultati-swap");
  risultati.innerHTML = "";
  const ho = norm(testo).split(" ").filter((w) => w.length > 2);
  if (ho.length === 0) {
    risultati.appendChild(el("p", "errore", "Scrivi almeno un ingrediente 🙂"));
    return;
  }

  const possiede = (key) =>
    key.some((k) => {
      const kn = norm(k);
      return ho.some((h) => kn.includes(h) || h.includes(kn));
    });

  const classificate = RICETTE.map((r) => {
    let avuti = 0;
    const mancanti = new Set();
    r.ingredienti.forEach((ing) => {
      if (possiede(ing.key)) avuti++;
      else mancanti.add(ing.t);
    });
    return { r, punteggio: avuti / r.ingredienti.length, avuti, mancanti };
  }).filter((x) => x.avuti > 0)
    .sort((a, b) => b.punteggio - a.punteggio || b.avuti - a.avuti);

  const generata = generaRicetta(testo, ho);
  risultati.appendChild(el("div", "etichetta piccola mt", "Creata coi tuoi ingredienti"));
  risultati.appendChild(cardRicetta(generata, null));

  if (classificate.length) {
    risultati.appendChild(el("div", "etichetta piccola mt-big", "Dal ricettario, le più adatte"));
    classificate.slice(0, 3).forEach((x) => {
      const perc = Math.round(x.punteggio * 100);
      risultati.appendChild(cardRicetta(x.r, `Hai il ${perc}% degli ingredienti`, x.mancanti));
    });
  }
}

function generaRicetta(testoOriginale, parole) {
  const DIZ = {
    proteine: ["uova","uovo","tofu","ceci","fagioli","lenticchie","feta","mozzarella","ricotta","caprino","paneer","halloumi","edamame","piselli","parmigiano","formaggio","fiocchi","seitan"],
    carbo:    ["riso","pasta","orzo","farro","quinoa","couscous","patata","patate","pane","gnocchi","tortilla","noodles","polenta"],
    verdure:  ["spinaci","zucchina","zucchine","peperone","peperoni","pomodoro","pomodori","pomodorini","cipolla","melanzana","melanzane","funghi","broccoli","carota","carote","zucca","cavolo","mais","cetriolo","rucola","barbabietola","fagiolini","asparagi"],
    aromi:    ["aglio","zenzero","basilico","prezzemolo","peperoncino","limone","salvia","timo","origano","menta","rosmarino","coriandolo","cipollotto"],
    grassi:   ["olio","burro","panna","cocco","soia","balsamico","miele","tahini","yogurt"],
  };
  const trova = (cat) => {
    const out = [];
    parole.forEach((p) => {
      DIZ[cat].forEach((d) => {
        if ((d.includes(p) || p.includes(d)) && !out.includes(d)) out.push(d);
      });
    });
    return out;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const pro = trova("proteine"), car = trova("carbo"),
        ver = trova("verdure"), aro = trova("aromi"), gra = trova("grassi");

  let metodo, titolo;
  if (car.some((c) => ["pasta","noodles","gnocchi"].includes(c))) {
    metodo = "pasta";
    titolo = "Pasta saltata con " + (ver[0] || pro[0] || "verdure di stagione");
  } else if (car.some((c) => ["riso","orzo","farro","quinoa","couscous"].includes(c))) {
    metodo = "cereali";
    titolo = "Bowl di " + (car[0] || "cereali") + " con " + (ver[0] || pro[0] || "verdure");
  } else if (pro.includes("uova") || pro.includes("uovo")) {
    metodo = "uova";
    titolo = "Frittata di " + (ver.slice(0, 2).join(" e ") || "verdure");
  } else if (ver.length >= 2 && car.length === 0) {
    metodo = "saltato";
    titolo = "Padellata di " + ver.slice(0, 2).map(cap).join(" e ");
  } else {
    metodo = "zuppa";
    titolo = "Zuppa rustica di " + (ver[0] || pro[0] || "verdure");
  }

  const ingredienti = [];
  const aggiungi = (lista, suff) => lista.forEach((x) => ingredienti.push({ t: cap(x) + (suff || "") }));
  aggiungi(pro); aggiungi(car); aggiungi(ver); aggiungi(aro);
  if (gra.length) aggiungi(gra);
  ingredienti.push({ t: "Olio, sale e pepe (le basi)" });
  if (ingredienti.length <= 1) ingredienti.unshift({ t: cap(parole[0]) });

  const aglioCipolla = aro.includes("aglio") || ver.includes("cipolla")
    ? (ver.includes("cipolla") ? "cipolla" : "aglio") : "un filo d'olio";
  const verList = ver.length ? ver.join(", ") : "le verdure che hai";
  const proList = pro.length ? pro.join(" e ") : "";
  const passi = [];

  if (metodo === "pasta") {
    passi.push(`Metti a bollire l'acqua per ${car[0] || "la pasta"} e salala.`);
    passi.push(`In padella scalda l'olio con ${aglioCipolla} e fai insaporire.`);
    passi.push(`Aggiungi ${verList} e cuoci finché morbide${proList ? `, poi unisci ${proList}` : ""}.`);
    passi.push(`Scola ${car[0] || "la pasta"} tenendo un po' d'acqua e mantecala in padella.`);
    passi.push("Aggiusta di sale e completa con erbe o formaggio a piacere.");
  } else if (metodo === "cereali") {
    passi.push(`Cuoci ${car[0]} secondo i tempi sulla confezione e scolalo.`);
    passi.push(`Salta ${verList} in padella con ${aglioCipolla} per qualche minuto.`);
    if (proList) passi.push(`Aggiungi ${proList} e fai dorare/scaldare.`);
    passi.push(`Unisci ${car[0]} alle verdure, mescola e aggiusta di sale.`);
    passi.push("Servi nella bowl con un filo d'olio a crudo.");
  } else if (metodo === "uova") {
    passi.push(`Rosola ${verList} in padella con ${aglioCipolla} finché ammorbidite.`);
    passi.push("Sbatti le uova con sale, pepe e formaggio se ce l'hai.");
    passi.push("Versa le uova sulle verdure e cuoci a fuoco basso.");
    passi.push("Quando è rappresa sotto, gira la frittata (o finiscila sotto il grill).");
  } else if (metodo === "saltato") {
    passi.push(`Scalda l'olio con ${aglioCipolla}.`);
    passi.push(`Aggiungi ${verList}, partendo dalle più dure, e salta a fuoco vivo.`);
    if (proList) passi.push(`Unisci ${proList} e fai insaporire un paio di minuti.`);
    passi.push("Aggiusta di sale, pepe e una spruzzata di limone o salsa di soia.");
  } else {
    passi.push(`Fai appassire ${aglioCipolla} nell'olio in una pentola.`);
    passi.push(`Aggiungi ${verList}${proList ? ` e ${proList}` : ""} e copri d'acqua o brodo.`);
    passi.push("Sobbolli 20 minuti finché tutto è morbido.");
    passi.push("Frulla in parte per una consistenza cremosa e aggiusta di sale.");
  }

  return {
    titolo,
    sottotitolo: "Inventata al volo con quello che hai in casa",
    tempo: "circa 25 min",
    porzioni: 2,
    ingredienti,
    passi,
    consiglio: "È una traccia flessibile: aggiungi un'erba fresca o del formaggio per dare un tocco in più.",
  };
}

/* ---------- GRIGLIA RICETTE ---------- */
function parseTempo(t) {
  const m = (t || "").match(/\d+/);
  return m ? parseInt(m[0]) : 99;
}

function renderGrigliaRicette() {
  const cerca = norm(stato.cercaTesto);
  const filtro = stato.filtroTempo;

  const filtrate = RICETTE.filter(r => {
    if (filtro === "pref" && !stato.preferiti.has(r.titolo)) return false;
    if (filtro === "20"   && parseTempo(r.tempo) > 20)       return false;
    if (filtro === "30"   && parseTempo(r.tempo) > 30)       return false;
    // filtro per tag (TUTTI_TAG ids)
    const isTagFiltro = TUTTI_TAG.some(t => t.id === filtro);
    if (isTagFiltro && !(r.tags || []).includes(filtro))     return false;
    if (cerca) {
      const hay = norm(r.titolo + " " + (r.sottotitolo || "") + " " + r.ingredienti.map(i => i.t).join(" "));
      if (!cerca.split(" ").filter(w => w.length > 1).every(w => hay.includes(w))) return false;
    }
    return true;
  });

  const grid = $("#griglia-ricette");
  grid.innerHTML = "";

  const nEscluse = filtrate.filter(r => ricettaEsclusa(r)).length;
  const visibili  = filtrate.filter(r => !ricettaEsclusa(r));

  if (filtrate.length === 0) {
    const msg = el("p", "errore");
    msg.style.marginTop = "20px";
    msg.textContent = filtro === "pref" ? "Nessuna ricetta salvata come preferita 🙂" : "Nessuna ricetta trovata 🙂";
    grid.appendChild(msg);
    return;
  }

  if (nEscluse > 0) {
    const nota = el("p", "ricetta-sub fadein");
    nota.style.cssText = "margin-bottom:12px;font-size:13px;";
    nota.textContent = `⚠ ${nEscluse} ricett${nEscluse > 1 ? "e nascoste" : "a nascosta"} per ingredienti esclusi.`;
    grid.appendChild(nota);
  }

  if (visibili.length === 0) {
    const msg = el("p", "errore");
    msg.style.marginTop = "8px";
    msg.textContent = "Nessuna ricetta disponibile con i filtri attuali 🙂";
    grid.appendChild(msg);
    return;
  }

  filtrate.forEach(r => {
    if (ricettaEsclusa(r)) return;
    const card = el("div", "card-compact fadein");

    const header = el("div", "card-compact-header");

    const info = el("div", "card-compact-info");
    info.appendChild(el("div", "card-compact-title", r.titolo));
    info.appendChild(el("div", "card-compact-meta", `⏱ ${r.tempo} · 🍽 ${r.porzioni} porzioni`));
    if (r.tags && r.tags.length) {
      const tl = el("div", "tags-lista");
      r.tags.forEach(t => { const tEl = elTag(t); if (tEl) tl.appendChild(tEl); });
      info.appendChild(tl);
    }
    header.appendChild(info);

    const actions = el("div", "card-compact-actions");
    const isFav = stato.preferiti.has(r.titolo);
    const heartBtn = el("button", "btn-heart" + (isFav ? " attivo" : ""), isFav ? "♥" : "♡");
    heartBtn.title = "Salva tra i preferiti";
    heartBtn.onclick = (e) => { e.stopPropagation(); togglePreferito(r.titolo, heartBtn); };
    actions.appendChild(heartBtn);
    header.appendChild(actions);

    header.onclick = () => toggleCardCompact(card, r);
    card.appendChild(header);

    const body = el("div", "card-compact-body");
    card.appendChild(body);

    grid.appendChild(card);
  });
}

function togglePreferito(titolo, btn) {
  if (stato.preferiti.has(titolo)) {
    stato.preferiti.delete(titolo);
    btn.textContent = "♡";
    btn.classList.remove("attivo");
  } else {
    stato.preferiti.add(titolo);
    btn.textContent = "♥";
    btn.classList.add("attivo");
  }
  salvaPreferiti();
  if (stato.filtroTempo === "pref") renderGrigliaRicette();
}

function toggleCardCompact(card, r) {
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
    meta.innerHTML = `<span>⏱ ${r.tempo}</span><span>🍽 ${r.porzioni} porzioni</span>`;
    body.appendChild(meta);

    body.appendChild(el("div", "etichetta piccola", "Ti servono"));
    const ul = el("ul", "ingredienti");
    r.ingredienti.forEach(ing => {
      const li = el("li");
      li.textContent = ing.t || ing;
      ul.appendChild(li);
    });
    body.appendChild(ul);

    body.appendChild(el("div", "etichetta piccola", "Procedimento"));
    const ol = el("ol", "passi");
    r.passi.forEach((p, i) => {
      const li = el("li");
      li.innerHTML = `<span class="num">${i + 1}</span><span>${p}</span>`;
      ol.appendChild(li);
    });
    body.appendChild(ol);

    if (r.consiglio) {
      const tip = el("p", "consiglio");
      tip.innerHTML = "<strong>Consiglio · </strong>" + r.consiglio;
      body.appendChild(tip);
    }

    const btns = el("div", "card-btns");
    const bSpesa = el("button", "btn-sm", "🛒 Aggiungi alla spesa");
    bSpesa.onclick = () => aggiungiRicettaAllaSpesa(r);
    btns.appendChild(bSpesa);
    body.appendChild(btns);

    setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  }
}

/* ---------- LISTA DELLA SPESA ---------- */
function aggiungiRicettaAllaSpesa(r) {
  const nuovi = r.ingredienti.filter(
    ing => !stato.spesa.some(i => i.testo === (ing.t || ing) && i.fonte === r.titolo)
  ).map(ing => ({
    id: Date.now() + Math.random(),
    testo: ing.t || ing,
    spuntato: false,
    fonte: r.titolo,
  }));

  if (nuovi.length === 0) {
    toast("Ingredienti già in lista ✓");
    return;
  }
  stato.spesa.push(...nuovi);
  salvaSpesa();
  aggiornaBadge();
  toast(`✓ "${r.titolo}" aggiunta alla spesa`);
}

function renderSpesa() {
  const area = $("#area-spesa");
  area.innerHTML = "";

  const addRow = el("div", "spesa-add");
  const addInput = el("input");
  addInput.type = "text";
  addInput.placeholder = "Aggiungi articolo manualmente…";
  addInput.onkeydown = (e) => { if (e.key === "Enter") aggiungiManuale(addInput); };
  addRow.appendChild(addInput);
  const addBtn = el("button", "btn-spesa-add", "＋");
  addBtn.onclick = () => aggiungiManuale(addInput);
  addRow.appendChild(addBtn);
  area.appendChild(addRow);

  if (stato.spesa.length === 0) {
    const vuota = el("div", "spesa-vuota fadein");
    vuota.innerHTML = '<div class="ico">🛒</div><p>La tua lista è vuota.<br>Aggiungi ingredienti dalle ricette o dal piano!</p>';
    area.appendChild(vuota);
    return;
  }

  // raggruppa per fonte
  const fonti = {};
  stato.spesa.forEach(item => {
    if (!fonti[item.fonte]) fonti[item.fonte] = [];
    fonti[item.fonte].push(item);
  });

  const ordine = Object.keys(fonti).sort(a => a === "manuale" ? 1 : -1);
  ordine.forEach(fonte => {
    const sez = el("div", "spesa-sezione fadein");
    sez.appendChild(el("div", "spesa-fonte", fonte === "manuale" ? "Aggiunto a mano" : fonte));
    fonti[fonte].forEach(item => {
      const row = el("div", "spesa-item" + (item.spuntato ? " spuntato" : ""));
      const cb = el("input");
      cb.type = "checkbox"; cb.checked = item.spuntato;
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
  const copiaBtn = el("button", "btn-sm", "📋 Copia lista");
  copiaBtn.onclick = copiaLista;
  azioni.appendChild(copiaBtn);

  const svuotaBtn = el("button", "btn-sm", "🗑 Svuota lista");
  svuotaBtn.onclick = svuotaLista;
  azioni.appendChild(svuotaBtn);

  area.appendChild(azioni);
}

function aggiungiManuale(input) {
  const testo = input.value.trim();
  if (!testo) return;
  stato.spesa.push({ id: Date.now() + Math.random(), testo, spuntato: false, fonte: "manuale" });
  input.value = "";
  salvaSpesa();
  aggiornaBadge();
  renderSpesa();
  // refocus
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

function svuotaLista() {
  stato.spesa = [];
  salvaSpesa(); aggiornaBadge(); renderSpesa();
}

function copiaLista() {
  const righe = [];
  const fonti = {};
  stato.spesa.forEach(i => { if (!fonti[i.fonte]) fonti[i.fonte] = []; fonti[i.fonte].push(i); });
  Object.entries(fonti).forEach(([fonte, items]) => {
    righe.push(`\n— ${fonte === "manuale" ? "Altro" : fonte} —`);
    items.forEach(i => righe.push((i.spuntato ? "✓ " : "• ") + i.testo));
  });
  navigator.clipboard.writeText(righe.join("\n").trim()).then(() => toast("Lista copiata negli appunti!"));
}

/* ---------- PIANO SETTIMANALE ---------- */
function renderPiano() {
  const area = $("#area-settimana");
  area.innerHTML = "";

  const hdr = el("div", "piano-header");
  const autoBtn = el("button", "btn-sm", "✦ Riempi automaticamente");
  autoBtn.onclick = riempiPianoAuto;
  hdr.appendChild(autoBtn);

  const spesaBtn = el("button", "btn-sm", "🛒 Tutta la settimana alla spesa");
  spesaBtn.onclick = aggiungiSettimanaAllaSpesa;
  hdr.appendChild(spesaBtn);

  const resetBtn = el("button", "btn-sm", "↺ Svuota piano");
  resetBtn.onclick = svuotaPiano;
  hdr.appendChild(resetBtn);

  area.appendChild(hdr);

  // pannello filtri
  const filtriBox = el("div", "piano-filtri");
  filtriBox.appendChild(el("div", "piano-filtri-titolo", "Filtra le ricette suggerite"));
  const chipsContainer = el("div", "chips");
  buildChips(chipsContainer, stato.filtriPiano, () => {
    salvaFiltri();
    renderPiano();
  });
  filtriBox.appendChild(chipsContainer);

  const nRicette = ricetteFiltratePerTag(RICETTE, stato.filtriPiano).length;
  const descFiltro = el("p", "ricetta-sub");
  descFiltro.style.cssText = "margin-top:10px;font-size:13px;";
  descFiltro.textContent = stato.filtriPiano.size === 0
    ? `Tutte le ${RICETTE.length} ricette disponibili per il piano.`
    : `${nRicette} ricett${nRicette === 1 ? "a" : "e"} corrispondono ai filtri selezionati.`;
  filtriBox.appendChild(descFiltro);

  area.appendChild(filtriBox);

  GIORNI.forEach((g, gi) => {
    const gDiv = el("div", "piano-giorno fadein");
    gDiv.appendChild(el("div", "piano-giorno-nome", GIORNI_NOMI[gi]));

    const pasti = el("div", "piano-pasti");
    PASTI.forEach((p, pi) => {
      const slot = el("div", "piano-slot");
      const ricettaTitolo = stato.piano[g][p];

      slot.appendChild(el("div", "piano-slot-pasto", PASTI_NOMI[pi]));

      if (ricettaTitolo) {
        slot.classList.add("pieno");
        slot.appendChild(el("div", "piano-slot-ricetta", ricettaTitolo));
        const del = el("button", "piano-slot-del", "×");
        del.onclick = (e) => { e.stopPropagation(); rimuoviDalPiano(g, p); };
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
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);
  shuffle(pool);
  let idx = 0;
  GIORNI.forEach(g => {
    PASTI.forEach(p => {
      stato.piano[g][p] = pool[idx % pool.length].titolo;
      idx++;
    });
  });
  salvaPiano();
  renderPiano();
  toast("Piano settimanale generato!");
}

function svuotaPiano() {
  stato.piano = initPiano();
  salvaPiano();
  renderPiano();
}

function rimuoviDalPiano(giorno, pasto) {
  stato.piano[giorno][pasto] = null;
  salvaPiano();
  renderPiano();
}

function aggiungiSettimanaAllaSpesa() {
  let aggiunti = 0;
  GIORNI.forEach(g => {
    PASTI.forEach(p => {
      const titolo = stato.piano[g][p];
      if (!titolo) return;
      const r = RICETTE.find(r => r.titolo === titolo);
      if (!r) return;
      r.ingredienti.forEach(ing => {
        const testo = ing.t || ing;
        if (!stato.spesa.some(i => i.testo === testo && i.fonte === r.titolo)) {
          stato.spesa.push({ id: Date.now() + Math.random(), testo, spuntato: false, fonte: r.titolo });
          aggiunti++;
        }
      });
    });
  });
  salvaSpesa();
  aggiornaBadge();
  toast(`✓ ${aggiunti} articoli aggiunti alla spesa`);
}

/* ---------- MODAL SELEZIONE RICETTA ---------- */
function apriModal(giorno, pasto) {
  stato.slotAperto = { giorno, pasto };
  stato.modalCerca = "";
  stato.modalFiltri = new Set([...stato.filtriPiano]); // eredita filtri piano
  $("#modal-cerca").value = "";
  buildChips($("#modal-chips"), stato.modalFiltri, renderModalLista);
  renderModalLista();
  $("#modal-overlay").classList.remove("hidden");
  setTimeout(() => $("#modal-cerca").focus(), 150);
}

function chiudiModal() {
  $("#modal-overlay").classList.add("hidden");
  stato.slotAperto = null;
}

function renderModalLista() {
  const cerca = norm(stato.modalCerca);
  const lista = $("#modal-lista");
  lista.innerHTML = "";

  if (stato.slotAperto) {
    const { giorno, pasto } = stato.slotAperto;
    if (stato.piano[giorno][pasto]) {
      const rimuovi = el("div", "modal-ricetta-item modal-rimuovi");
      rimuovi.innerHTML = '<span><div class="modal-ricetta-nome">— Rimuovi ricetta</div></span>';
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

  if (filtrate.length === 0) {
    lista.appendChild(el("p", "errore", "Nessuna ricetta trovata"));
    return;
  }

  filtrate.forEach(r => {
    const isFav = stato.preferiti.has(r.titolo);
    const item = el("div", "modal-ricetta-item");
    const tagHtml = (r.tags || []).map(t => {
      const info = TUTTI_TAG.find(x => x.id === t);
      return info ? `<span class="tag ${info.cls}">${info.label}</span>` : "";
    }).join("");
    const prob = ingredientiProblematici(r);
    if (prob.length > 0) item.classList.add("esclusa-modal");
    item.innerHTML = `
      <div>
        <div class="modal-ricetta-nome">${r.titolo}${isFav ? ' <span class="modal-fav">♥</span>' : ''}</div>
        <div class="modal-ricetta-tempo">⏱ ${r.tempo} · 🍽 ${r.porzioni} porzioni</div>
        ${prob.length > 0 ? `<div class="modal-escluso">⚠ contiene: ${prob.join(", ")}</div>` : ""}
        ${tagHtml ? `<div class="tags-lista" style="margin-top:5px">${tagHtml}</div>` : ""}
      </div>
      <span class="modal-freccia">›</span>
    `;
    item.onclick = () => {
      if (!stato.slotAperto) return;
      const { giorno, pasto } = stato.slotAperto;
      stato.piano[giorno][pasto] = r.titolo;
      salvaPiano();
      renderPiano();
      chiudiModal();
    };
    lista.appendChild(item);
  });
}

/* ---------- AVVIO ---------- */
document.addEventListener("DOMContentLoaded", () => {
  renderMenu();
  aggiornaBadge();

  $("#btn-random").addEventListener("click", ricettaCasuale);

  // tab switching
  $$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // pannello esclusi
  $("#esclusi-toggle").addEventListener("click", () => {
    $("#esclusi-panel").classList.toggle("aperto");
  });
  $("#esclusi-add-btn").addEventListener("click", () => aggiungiEscluso($("#esclusi-input")));
  $("#esclusi-input").addEventListener("keydown", e => { if (e.key === "Enter") aggiungiEscluso(e.target); });

  // filtri ricette
  $$(".chip").forEach(c => c.addEventListener("click", () => {
    stato.filtroTempo = c.dataset.filtro;
    $$(".chip").forEach(x => x.classList.toggle("active", x === c));
    renderGrigliaRicette();
  }));

  $("#cerca-ricette").addEventListener("input", e => {
    stato.cercaTesto = e.target.value;
    renderGrigliaRicette();
  });

  // modal
  $("#modal-overlay").addEventListener("click", e => {
    if (e.target === $("#modal-overlay")) chiudiModal();
  });
  $("#modal-close").addEventListener("click", chiudiModal);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") chiudiModal();
  });
  $("#modal-cerca").addEventListener("input", e => {
    stato.modalCerca = e.target.value;
    renderModalLista();
  });
});
