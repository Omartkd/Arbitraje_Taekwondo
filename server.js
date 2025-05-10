const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// Configuración mejorada de Socket.IO para producción
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://arbitraje-taekwondo.onrender.com'] 
      : ['http://localhost:3000'],
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware para archivos estáticos
app.use(express.static('public'));

// Variables de estado (mejor encapsuladas)
const gameManager = {
  state: {
    blueScore: 0,
    redScore: 0,
    gameActive: true,
    kamgeon: { blue: 0, red: 0 }
  },
  tempScores: { blue: [], red: [] },
  timeout: null,
  
  reset() {
    this.state = {
      blueScore: 0,
      redScore: 0,
      gameActive: true,
      kamgeon: { blue: 0, red: 0 }
    };
    this.tempScores = { blue: [], red: [] };
    clearTimeout(this.timeout);
    this.timeout = null;
  }
};

// Configuración del puerto dinámica
const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Enviar estado inicial
  socket.emit('game-state', {
    scores: gameManager.state,
    kamgeon: gameManager.state.kamgeon
  });

  // Manejador genérico de puntuación
  const scoreHandler = (event, points) => {
    socket.on(event, (data) => {
      if (!gameManager.state.gameActive) return;

      const now = Date.now();
      if (now - data.timestamp > 5000) return;

      const team = data.equipo;
      gameManager.tempScores[team].push({ 
        timestamp: data.timestamp, 
        clientId: socket.id 
      });

      clearTimeout(gameManager.timeout);

      if (gameManager.tempScores[team].length >= 2) {
        const [first, last] = [
          gameManager.tempScores[team][0],
          gameManager.tempScores[team].slice(-1)[0]
        ];

        if (first.clientId !== last.clientId && 
            (last.timestamp - first.timestamp) <= 5000) {
          gameManager.state[`${team}Score`] += points;
          gameManager.tempScores[team] = [];
          updateScores();
        } else {
          gameManager.tempScores[team].shift();
        }
      } else {
        gameManager.timeout = setTimeout(() => {
          gameManager.tempScores[team] = [];
        }, 5000);
      }
    });
  };

  // Registrar handlers
  [
    ['puntuacionCabeza', 3],
    ['puntuacionPeto', 2],
    // ... otros eventos
  ].forEach(([event, points]) => scoreHandler(event, points));

  // Otros eventos
  socket.on('adjust-score', (data) => {
    if (!gameManager.state.gameActive) return;
    const delta = data.action === 'sumar' ? 1 : -1;
    gameManager.state[`${data.equipo}Score`] = 
      Math.max(gameManager.state[`${data.equipo}Score`] + delta, 0);
    updateScores();
  });

  socket.on('reset-game', () => {
    gameManager.reset();
    io.emit('game-reset');
    updateScores();
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

function updateScores() {
  io.emit('score-update', {
    scores: gameManager.state,
    kamgeon: gameManager.state.kamgeon
  });
  checkVictory();
}

function checkVictory() {
  const diff = Math.abs(gameManager.state.blueScore - gameManager.state.redScore);
  if (diff >= 12) {
    gameManager.state.gameActive = false;
    io.emit('game-over', {
      winner: gameManager.state.blueScore > gameManager.state.redScore ? 'azul' : 'rojo',
      difference: diff
    });
  }
}

server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en ${process.env.NODE_ENV === 'production' 
    ? 'https://arbitraje-taekwondo.onrender.com' 
    : `http://localhost:${PORT}`}`);
});
