const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');

// Configuración para producción
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const CLIENT_URL = isProduction 
  ? 'https://arbitraje-taekwondo.onrender.com' 
  : 'http://localhost:3000';

// Configuración simplificada de CORS
const corsOptions = {
  origin: CLIENT_URL,
  methods: ["GET", "POST"],
  credentials: true
};
app.use(cors(corsOptions));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Configuración Socket.IO
const io = new Server(server, {
  cors: corsOptions,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutos
    skipMiddlewares: true
  }
});

// Variables de estado del juego
let gameState = {
  blueScore: 0,
  redScore: 0,
  gameActive: true
};

let kamgeonState = {
  blueScore: 0,
  redScore: 0
};

// Almacenar temporalmente las anotaciones
let anotacionesTemporales = {
  azul: [],
  rojo: []
};

let timeoutId = null;

// Función para verificar diferencia de puntuación
function checkScoreDifference() {
  if (!gameState.gameActive) return;

  const blueScore = gameState.blueScore;
  const redScore = gameState.redScore;
  const difference = Math.abs(blueScore - redScore);
  
  if (difference >= 12) {
    gameState.gameActive = false;
    const winner = blueScore > redScore ? 'azul' : 'rojo';
    
    const victoryData = {
      winner: winner,
      blueScore: blueScore,
      redScore: redScore,
      difference: difference,
      timestamp: Date.now()
    };
    
    try {
      io.emit('victoriaPorDiferencia', victoryData);
      console.log(`¡El equipo ${winner} gana por diferencia de ${difference} puntos!`);
    } catch (error) {
      console.error("Error al emitir victoria:", error);
      gameState.gameActive = true;
    }
  }
}

// Conexiones Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Enviar estado inicial
  socket.emit('actualizarPuntaje', {
    blueScore: gameState.blueScore,
    redScore: gameState.redScore
  });

  socket.emit('actualizarKamgeon', {
    blueKamgeon: kamgeonState.blueScore,
    redKamgeon: kamgeonState.redScore
  });

  // Manejador genérico de puntuación
 const createPointHandler = (eventName, points) => {
    socket.on(eventName, (data) => {
      if (!gameState.gameActive) return;

      const { equipo, timestamp } = data;
      const now = Date.now();

      if (now - timestamp > 5000) return;

      anotacionesTemporales[equipo].push({ timestamp, clienteId: socket.id });

      clearTimeout(timeoutId);

      if (anotacionesTemporales[equipo].length >= 2) {
        const [first, last] = [
          anotacionesTemporales[equipo][0], 
          anotacionesTemporales[equipo].slice(-1)[0]
        ];

        if (first.clienteId !== last.clienteId && 
            (last.timestamp - first.timestamp) <= 5000) {
          
          gameState[`${equipo}Score`] += points;
          anotacionesTemporales[equipo] = [];
          
          io.emit('actualizarPuntaje', gameState);
          checkScoreDifference();
        } else {
          anotacionesTemporales[equipo].shift();
        }
      } else {
        timeoutId = setTimeout(() => {
          anotacionesTemporales[equipo] = [];
        }, 5000);
      }
    });
  };

  // Registrar handlers
  createPointHandler('puntuacionCabeza', 3);
  createPointHandler('puntuacionPeto', 2);
  createPointHandler('puntuacionGiroPeto', 4);
  createPointHandler('puntuacionGiroCabeza', 5);
  createPointHandler('puntuacionPuño', 1);

  // Eventos adicionales
  socket.on('puntuacionRestar', (data) => {
    if (!gameState.gameActive) return;
    const { equipo } = data;
    gameState[`${equipo}Score`] = Math.max(gameState[`${equipo}Score`] - 1, 0);
    io.emit('actualizarPuntaje', gameState);
    checkScoreDifference();
  });

  socket.on('puntuacionSumar', (data) => {
    if (!gameState.gameActive) return;
    const { equipo } = data;
    gameState[`${equipo}Score`] += 1;
    io.emit('actualizarPuntaje', gameState);
    checkScoreDifference();
  });

  socket.on('puntuacionKamgeon', (data) => {
    if (!gameState.gameActive) return;
    const { equipo } = data;
    kamgeonState[`${equipo}Score`] += 1;
    io.emit('actualizarKamgeon', kamgeonState);
  });

  socket.on('resetGame', () => {
    gameState = {
      blueScore: 0,
      redScore: 0,
      gameActive: true
    };
    kamgeonState = {
      blueScore: 0,
      redScore: 0
    };
    anotacionesTemporales = { azul: [], rojo: [] };
    clearTimeout(timeoutId);
    timeoutId = null;
    
    io.emit('actualizarPuntaje', gameState);
    io.emit('actualizarKamgeon', kamgeonState);
    io.emit('gameReset');
    
    console.log('Juego reiniciado');
  });

  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Algo salió mal!');
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  console.log(`Modo: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log(`URL del cliente: ${CLIENT_URL}`);
});
