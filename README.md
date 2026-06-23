# 🃏 Carioca Online — MVP

Juego de Carioca multijugador en tiempo real usando Node.js + Socket.io.

## Instalación

```bash
npm install
npm start
```

Abre http://localhost:3000 en tu navegador.

## Cómo jugar

1. Entra con tu nombre
2. Crea una sala → comparte el código con tus amigos
3. Todos se unen con el código
4. El anfitrión presiona "Iniciar partida"

## Reglas implementadas

- ✅ 2 mazos estándar + 2 comodines
- ✅ 12 cartas iniciales por jugador
- ✅ Las 12 etapas del Carioca
- ✅ Robar del mazo o del descarte
- ✅ Bajar etapa con combinaciones válidas (tríos y escaleras)
- ✅ Pegar cartas a combinaciones en mesa
- ✅ Tirar carta para pasar turno
- ✅ Puntaje acumulativo por cartas en mano
- ✅ Múltiples rondas
- ✅ 2-4 jugadores

## Deploy en producción

### Railway / Render / Fly.io
```bash
# Solo sube los archivos, ellos detectan el package.json
# Variable de entorno: PORT (ya configurado automáticamente)
```

### Variables de entorno
- `PORT` — Puerto del servidor (default: 3000)
# carioca-online
