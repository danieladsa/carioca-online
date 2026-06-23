const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── Constantes del juego ──────────────────────────────────────────────────────
const PALOS = ['♠','♥','♦','♣'];
const VALORES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const COMODIN = '🃏';

const ETAPAS = [
  { desc: '2 tríos',                   partes: ['trio','trio'] },
  { desc: '1 trío + 1 escalera',       partes: ['trio','escalera'] },
  { desc: '2 escaleras',               partes: ['escalera','escalera'] },
  { desc: '3 tríos',                   partes: ['trio','trio','trio'] },
  { desc: '2 tríos + 1 escalera',      partes: ['trio','trio','escalera'] },
  { desc: '1 trío + 2 escaleras',      partes: ['trio','escalera','escalera'] },
  { desc: '3 escaleras',               partes: ['escalera','escalera','escalera'] },
  { desc: '4 tríos',                   partes: ['trio','trio','trio','trio'] },
  { desc: '3 tríos + 1 escalera',      partes: ['trio','trio','trio','escalera'] },
  { desc: '2 tríos + 2 escaleras',     partes: ['trio','trio','escalera','escalera'] },
  { desc: '1 trío + 3 escaleras',      partes: ['trio','escalera','escalera','escalera'] },
  { desc: '4 escaleras',               partes: ['escalera','escalera','escalera','escalera'] },
];

// ── Helpers de cartas ─────────────────────────────────────────────────────────
function crearMazo() {
  const mazo = [];
  for (let d = 0; d < 2; d++) {
    for (const palo of PALOS) {
      for (const val of VALORES) {
        mazo.push({ val, palo, id: `${val}${palo}-${d}` });
      }
    }
    mazo.push({ val: COMODIN, palo: '', id: `comodin-${d}` });
  }
  return mazo;
}

function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function valorCarta(carta) {
  if (carta.val === COMODIN) return 20;
  if (carta.val === 'A') return 15;
  if (['J','Q','K'].includes(carta.val)) return 10;
  return parseInt(carta.val) || 10;
}

function puntosMano(mano) {
  return mano.reduce((s, c) => s + valorCarta(c), 0);
}

// ── Validación ────────────────────────────────────────────────────────────────
function esComodin(c) { return c.val === COMODIN; }

function validarTrio(cartas) {
  if (cartas.length < 3) return false;
  const reales = cartas.filter(c => !esComodin(c));
  if (reales.length === 0) return false;
  const valRef = reales[0].val;
  return reales.every(c => c.val === valRef);
}

// Escalera CIRCULAR: la secuencia es cíclica (…J Q K A 2 3…), el As hace de puente
function validarEscalera(cartas) {
  const N = VALORES.length; // 13
  if (cartas.length < 4 || cartas.length > N) return false;
  const reales = cartas.filter(c => !esComodin(c));
  if (reales.length === 0) return false;
  // Todas del mismo palo
  const paloRef = reales[0].palo;
  if (!reales.every(c => c.palo === paloRef)) return false;
  const idx = c => VALORES.indexOf(c.val);
  const pos = reales.map(idx).sort((a, b) => a - b);
  // Sin valores repetidos (una escalera no repite valor)
  for (let i = 1; i < pos.length; i++) if (pos[i] === pos[i - 1]) return false;
  // Mayor hueco cíclico (cuenta el salto K→A)
  let maxGap = -1;
  for (let i = 0; i < pos.length; i++) {
    const next = pos[(i + 1) % pos.length];
    const gap = (next - pos[i] - 1 + N) % N;
    if (gap > maxGap) maxGap = gap;
  }
  const span = N - maxGap; // ventana mínima (cíclica) que cubre todos los reales
  // Los comodines rellenan huecos internos y/o extienden los extremos
  return span <= cartas.length;
}

function validarCombinacion(tipo, cartas) {
  return tipo === 'trio' ? validarTrio(cartas) : validarEscalera(cartas);
}

// Ordena una escalera (cíclica) para mostrar: empieza tras el mayor hueco y avanza,
// colocando los comodines en sus huecos. Soporta el wrap …K A 2…
function ordenarEscalera(cartas) {
  const N = VALORES.length;
  const idx = c => VALORES.indexOf(c.val);
  const reales = cartas.filter(c => !esComodin(c));
  const jokers = cartas.filter(c => esComodin(c));
  if (reales.length === 0) return [...cartas];
  const byPos = [...reales].sort((a, b) => idx(a) - idx(b));
  const pos = byPos.map(idx);
  // El run empieza en el real que está justo después del mayor hueco cíclico
  let maxGap = -1, startI = 0;
  for (let i = 0; i < pos.length; i++) {
    const next = pos[(i + 1) % pos.length];
    const gap = (next - pos[i] - 1 + N) % N;
    if (gap > maxGap) { maxGap = gap; startI = (i + 1) % pos.length; }
  }
  const realEnPos = {};
  byPos.forEach(c => { realEnPos[idx(c)] = c; });
  const startPos = pos[startI];
  const total = cartas.length;
  const jk = [...jokers];
  const out = [];
  for (let k = 0; k < total; k++) {
    const p = (startPos + k) % N;
    if (realEnPos[p] !== undefined) out.push(realEnPos[p]);
    else if (jk.length) out.push(jk.shift());
  }
  while (jk.length) out.push(jk.shift()); // por seguridad
  return out;
}

// Mantiene el orden correcto para mostrar (las escaleras de izquierda a derecha)
function ordenarCombo(tipo, cartas) {
  return tipo === 'escalera' ? ordenarEscalera(cartas) : cartas;
}

// Extiende una escalera (ya ordenada) por un extremo. 'izquierda' = true → extremo bajo.
// Devuelve la nueva combinación o null si no es legal. El comodín entra en cualquier extremo.
function pegarEnEscalera(combo, carta, izquierda) {
  const N = VALORES.length;
  const idx = c => VALORES.indexOf(c.val);
  if (combo.length + 1 > N) return null; // ya es la escalera máxima
  const r = combo.findIndex(c => !esComodin(c));
  if (r === -1) return null;
  const low = ((idx(combo[r]) - r) % N + N) % N;       // valor del extremo izquierdo
  const high = (low + combo.length - 1) % N;            // valor del extremo derecho
  const requerido = izquierda ? ((low - 1 + N) % N) : ((high + 1) % N);
  const palo = combo[r].palo;
  if (!esComodin(carta)) {
    if (carta.palo !== palo) return null;               // mismo palo
    if (idx(carta) !== requerido) return null;          // debe encajar en ese extremo
  }
  return izquierda ? [carta, ...combo] : [...combo, carta];
}

function validarEtapa(etapaIdx, combinaciones) {
  const partes = ETAPAS[etapaIdx].partes;
  if (combinaciones.length !== partes.length) return false;
  return partes.every((tipo, i) => validarCombinacion(tipo, combinaciones[i]));
}

// ── Estado de partidas ────────────────────────────────────────────────────────
const salas = {};

function nuevaPartida(jugadores, opciones = {}) {
  const mazo = barajar(crearMazo());
  const manos = {};
  jugadores.forEach(id => {
    manos[id] = mazo.splice(0, 12);
  });
  const descarte = [mazo.splice(0, 1)[0]];
  // Modo libre: una sola partida de la etapa elegida; si no, partida completa (12 etapas)
  const modoLibre = opciones.modo === 'libre';
  const etapaInicial = modoLibre
    ? Math.max(0, Math.min(11, parseInt(opciones.etapaInicial, 10) || 0))
    : 0;
  return {
    jugadores,
    manos,
    mazo,
    descarte,
    turno: jugadores[0],
    etapas: Object.fromEntries(jugadores.map(id => [id, etapaInicial])),
    bajadasEtapa: Object.fromEntries(jugadores.map(id => [id, null])),
    puntos: Object.fromEntries(jugadores.map(id => [id, 0])),
    ronda: 1,
    fase: 'robar', // robar | jugar
    nombres: {},
    modoLibre,
  };
}

function estadoPublico(sala, pov) {
  const g = sala.game;
  if (!g) return null;
  const otros = g.jugadores.filter(id => id !== pov);
  return {
    miMano: g.manos[pov] || [],
    mazoSize: g.mazo.length,
    descarte: g.descarte,
    turno: g.turno,
    soyYo: g.turno === pov,
    fase: g.fase,
    etapas: g.etapas,
    bajadasEtapa: g.bajadasEtapa,
    puntos: g.puntos,
    ronda: g.ronda,
    nombres: g.nombres,
    jugadores: g.jugadores,
    modoLibre: !!g.modoLibre,
    manosAjenas: Object.fromEntries(otros.map(id => [id, g.manos[id]?.length ?? 0])),
  };
}

function emitirEstado(codigoSala) {
  const sala = salas[codigoSala];
  if (!sala) return;
  sala.jugadores.forEach(id => {
    const socket = io.sockets.sockets.get(id);
    if (socket) socket.emit('estado', estadoPublico(sala, id));
  });
}

function siguienteTurno(codigoSala) {
  const sala = salas[codigoSala];
  const g = sala.game;
  const idx = g.jugadores.indexOf(g.turno);
  g.turno = g.jugadores[(idx + 1) % g.jugadores.length];
  g.fase = 'robar';
}

function verificarRondaTerminada(codigoSala) {
  const sala = salas[codigoSala];
  const g = sala.game;
  // ¿Alguien vació la mano?
  const ganador = g.jugadores.find(id => g.manos[id].length === 0);
  if (!ganador) return false;

  // Sumar puntos a los perdedores
  g.jugadores.forEach(id => {
    if (id !== ganador) {
      g.puntos[id] += puntosMano(g.manos[id]);
    }
  });

  const nombre = g.nombres[ganador] || 'Jugador';
  io.to(codigoSala).emit('finRonda', {
    ganador,
    nombreGanador: nombre,
    puntos: g.puntos,
    ronda: g.ronda,
  });

  // Nueva ronda después de 4 segundos
  setTimeout(() => {
    if (!salas[codigoSala]) return;

    // La etapa que se acaba de jugar (todos juegan la misma etapa en cada ronda)
    const etapaJugada = g.etapas[ganador];

    // Modo libre = una sola etapa → o partida completa terminó (etapa 12) → fin del juego
    if (g.modoLibre || etapaJugada >= 11) {
      // Gana quien tenga MENOS puntos acumulados
      const ranking = [...g.jugadores].sort((a, b) => g.puntos[a] - g.puntos[b]);
      const campeon = ranking[0];
      io.to(codigoSala).emit('finJuego', { ganador: campeon, nombre: g.nombres[campeon], puntos: g.puntos });
      return;
    }

    // Avanzar de etapa a TODOS los jugadores (no solo al ganador)
    g.jugadores.forEach(id => { g.etapas[id]++; });

    // Reiniciar ronda
    const nuevoMazo = barajar(crearMazo());
    g.jugadores.forEach(id => { g.manos[id] = nuevoMazo.splice(0, 12); });
    g.mazo = nuevoMazo;
    g.descarte = [g.mazo.splice(0, 1)[0]];
    g.bajadasEtapa = Object.fromEntries(g.jugadores.map(id => [id, null]));
    g.turno = g.jugadores[g.ronda % g.jugadores.length];
    g.fase = 'robar';
    g.ronda++;
    emitirEstado(codigoSala);
  }, 4000);

  return true;
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('conectado:', socket.id);

  socket.on('crearSala', ({ nombre }) => {
    const codigo = Math.random().toString(36).slice(2, 6).toUpperCase();
    salas[codigo] = { jugadores: [socket.id], nombres: { [socket.id]: nombre }, game: null };
    socket.join(codigo);
    socket.salaActual = codigo;
    socket.emit('salaCreada', { codigo, jugadores: [{ id: socket.id, nombre }] });
    console.log(`Sala ${codigo} creada por ${nombre}`);
  });

  socket.on('unirSala', ({ codigo, nombre }) => {
    const sala = salas[codigo];
    if (!sala) return socket.emit('error', 'Sala no encontrada');
    if (sala.jugadores.length >= 4) return socket.emit('error', 'Sala llena (máx 4)');
    if (sala.game) return socket.emit('error', 'Partida en curso');

    sala.jugadores.push(socket.id);
    sala.nombres[socket.id] = nombre;
    socket.join(codigo);
    socket.salaActual = codigo;

    const jugadoresInfo = sala.jugadores.map(id => ({ id, nombre: sala.nombres[id] }));
    io.to(codigo).emit('jugadorUnido', { jugadores: jugadoresInfo });
    socket.emit('salaUnida', { codigo, jugadores: jugadoresInfo });
    console.log(`${nombre} se unió a sala ${codigo}`);
  });

  socket.on('iniciarJuego', (opciones) => {
    const codigo = socket.salaActual;
    const sala = salas[codigo];
    if (!sala || sala.jugadores[0] !== socket.id) return;
    if (sala.jugadores.length < 2) return socket.emit('error', 'Se necesitan al menos 2 jugadores');

    sala.game = nuevaPartida(sala.jugadores, opciones || {});
    sala.game.nombres = sala.nombres;
    emitirEstado(codigo);
    io.to(codigo).emit('juegoIniciado');
  });

  socket.on('robarMazo', () => {
    const codigo = socket.salaActual;
    const sala = salas[codigo];
    const g = sala?.game;
    if (!g || g.turno !== socket.id || g.fase !== 'robar') return;
    if (g.mazo.length === 0) {
      // Reciclar descarte
      const top = g.descarte.pop();
      g.mazo = barajar(g.descarte);
      g.descarte = [top];
    }
    const carta = g.mazo.shift();
    g.manos[socket.id].push(carta);
    g.fase = 'jugar';
    emitirEstado(codigo);
  });

  socket.on('robarDescarte', () => {
    const codigo = socket.salaActual;
    const sala = salas[codigo];
    const g = sala?.game;
    if (!g || g.turno !== socket.id || g.fase !== 'robar') return;
    if (g.descarte.length === 0) return;
    const carta = g.descarte.pop();
    g.manos[socket.id].push(carta);
    g.fase = 'jugar';
    emitirEstado(codigo);
  });

  socket.on('tirarCarta', ({ cartaId }) => {
    const codigo = socket.salaActual;
    const sala = salas[codigo];
    const g = sala?.game;
    if (!g || g.turno !== socket.id || g.fase !== 'jugar') return;

    const mano = g.manos[socket.id];
    const idx = mano.findIndex(c => c.id === cartaId);
    if (idx === -1) return;

    const [carta] = mano.splice(idx, 1);
    g.descarte.push(carta);

    if (verificarRondaTerminada(codigo)) return;
    siguienteTurno(codigo);
    emitirEstado(codigo);
  });

  socket.on('bajarEtapa', ({ combinaciones }) => {
    const codigo = socket.salaActual;
    const sala = salas[codigo];
    const g = sala?.game;
    if (!g || g.turno !== socket.id || g.fase !== 'jugar') return;
    if (g.bajadasEtapa[socket.id]) return socket.emit('error', 'Ya bajaste en esta ronda');

    const etapaIdx = g.etapas[socket.id];
    if (!validarEtapa(etapaIdx, combinaciones)) {
      return socket.emit('error', 'Combinación inválida para tu etapa');
    }

    // Quitar cartas de la mano
    const cartasUsadas = combinaciones.flat();
    const mano = [...g.manos[socket.id]];
    for (const carta of cartasUsadas) {
      const i = mano.findIndex(c => c.id === carta.id);
      if (i === -1) return socket.emit('error', 'Carta no encontrada en tu mano');
      mano.splice(i, 1);
    }
    g.manos[socket.id] = mano;
    const partes = ETAPAS[etapaIdx].partes;
    g.bajadasEtapa[socket.id] = combinaciones.map((combo, i) => ordenarCombo(partes[i], combo));

    emitirEstado(codigo);
  });

  socket.on('pegarCarta', ({ cartaId, jugadorId, comboIdx, posicion }) => {
    const codigo = socket.salaActual;
    const sala = salas[codigo];
    const g = sala?.game;
    if (!g || g.turno !== socket.id || g.fase !== 'jugar') return;
    if (!g.bajadasEtapa[socket.id]) return socket.emit('error', 'Debes bajar tu etapa primero');
    if (!g.bajadasEtapa[jugadorId]) return socket.emit('error', 'Ese jugador aún no bajó');

    const mano = g.manos[socket.id];
    const idx = mano.findIndex(c => c.id === cartaId);
    if (idx === -1) return;

    const combo = g.bajadasEtapa[jugadorId][comboIdx];
    const tipo = ETAPAS[g.etapas[jugadorId]].partes[comboIdx];
    const carta = mano[idx];

    let nuevaCombo;
    if (tipo === 'trio') {
      nuevaCombo = [...combo, carta];
      if (!validarTrio(nuevaCombo)) return socket.emit('error', 'No se puede pegar ahí');
    } else {
      // Escalera: extender por el extremo elegido (posicion 0 = izquierda, si no derecha)
      const izquierda = posicion <= 0;
      nuevaCombo = pegarEnEscalera(combo, carta, izquierda);
      if (!nuevaCombo) {
        return socket.emit('error', izquierda ? 'Esa carta no va a la izquierda' : 'Esa carta no va a la derecha');
      }
    }

    g.bajadasEtapa[jugadorId][comboIdx] = nuevaCombo;
    mano.splice(idx, 1);

    if (verificarRondaTerminada(codigo)) return;
    emitirEstado(codigo);
  });

  socket.on('disconnect', () => {
    const codigo = socket.salaActual;
    if (codigo && salas[codigo]) {
      io.to(codigo).emit('jugadorDesconectado', { id: socket.id, nombre: salas[codigo].nombres[socket.id] });
      // Limpiar sala si todos se van
      salas[codigo].jugadores = salas[codigo].jugadores.filter(id => id !== socket.id);
      if (salas[codigo].jugadores.length === 0) delete salas[codigo];
    }
    console.log('desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Carioca corriendo en http://localhost:${PORT}`));
