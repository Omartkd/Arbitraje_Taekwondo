const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "https://arbitraje-taekwondo.onrender.com",
    credentials: true
  }
});

app.use(express.static('public'));

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

io.on('connection', (socket) => {
  console.log('Un cliente se ha conectado:', socket.id);

  // Enviar estado inicial al cliente
  socket.emit('actualizarPuntaje', {
    blueScore: gameState.blueScore,
    redScore: gameState.redScore,
  });

  // Manejadores de eventos de puntuación
  const handlePuntuacion = (eventName, points) => {
    socket.on(eventName, (data) => {
      if (!gameState.gameActive) return;

      const { equipo, timestamp } = data;
      const now = Date.now();

      if (now - timestamp <= 5000) {
        anotacionesTemporales[equipo].push({ timestamp, clienteId: socket.id });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (anotacionesTemporales[equipo].length >= 2) {
          const anotaciones = anotacionesTemporales[equipo];
          const primeraAnotacion = anotaciones[0];
          const ultimaAnotacion = anotaciones[anotaciones.length - 1];

          if (primeraAnotacion.clienteId !== ultimaAnotacion.clienteId) {
            const diferencia = Math.abs(primeraAnotacion.timestamp - ultimaAnotacion.timestamp);

            if (diferencia <= 5000) {
              if (equipo === 'azul') {
                gameState.blueScore += points;
              } else {
                gameState.redScore += points;
              }

              io.emit('actualizarPuntaje', {
                blueScore: gameState.blueScore,
                redScore: gameState.redScore
              });

              anotacionesTemporales[equipo] = [];
              checkScoreDifference();
            } else {
              anotacionesTemporales[equipo].shift();
            }
          } else {
            anotacionesTemporales[equipo].shift();
          }
        } else {
          timeoutId = setTimeout(() => {
            anotacionesTemporales[equipo] = [];
          }, 5000);
        }
      }
    });
  };

  // Configurar handlers para cada tipo de puntuación
  handlePuntuacion('puntuacionCabeza', 3);
  handlePuntuacion('puntuacionPeto', 2);
  handlePuntuacion('puntuacionGiroPeto', 4);
  handlePuntuacion('puntuacionGiroCabeza', 5);
  handlePuntuacion('puntuacionPuño', 1);

    
    socket.on('puntuacionRestar', (data) => {
        if (!gameState.gameActive) return;
    
        const { equipo } = data;
        
        if (equipo === 'azul') {
          gameState.blueScore = Math.max(gameState.blueScore - 1, 0);
        } else {
          gameState.redScore = Math.max(gameState.redScore - 1, 0);
        }
    
        io.emit('actualizarPuntaje', {
          blueScore: gameState.blueScore,
          redScore: gameState.redScore
        });
    
        checkScoreDifference();
      });

      socket.on('puntuacionSumar', (data) => {
        if (!gameState.gameActive) return;
    
        const { equipo } = data;
        
        if (equipo === 'azul') {
          gameState.blueScore += 1;
        } else {
          gameState.redScore += 1;
        }
    
        io.emit('actualizarPuntaje', {
          blueScore: gameState.blueScore,
          redScore: gameState.redScore
        });
    
        checkScoreDifference();
      });

      socket.on('puntuacionKamgeon', (data) => {
        if (!gameState.gameActive) return;
    
        const { equipo } = data;
        
        // Sumar punto Kamgeon al equipo correspondiente
        if (equipo === 'azul') {
            kamgeonState.blueScore += 1;
        } else {
            kamgeonState.redScore += 1;
        }
    
        // Enviar actualización solo de los puntos Kamgeon
        io.emit('actualizarKamgeon', {
            blueKamgeon: kamgeonState.blueScore,
            redKamgeon: kamgeonState.redScore
        });

      });

      socket.on('resetGame', () => {
        gameState.blueScore = 0;
        gameState.redScore = 0;
        kamgeonState.blueScore = 0;
        kamgeonState.redScore = 0;
        gameState.gameActive = true;
        
        anotacionesTemporales = {
          azul: [],
          rojo: []
        };
        
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        io.emit('actualizarPuntaje', {
          blueScore: gameState.blueScore,
          redScore: gameState.redScore
        });

        io.emit('actualizarKamgeon', {
          blueKamgeon: 0,
          redKamgeon: 0
      });
        
        io.emit('gameReset');
        
        console.log('Juego reiniciado');
      });
    
    
    socket.on('disconnect', () => {
        console.log('Un cliente se ha desconectado');
    });
});

function checkScoreDifference() {
    // Verificar que el juego esté activo antes de hacer cualquier comprobación
    if (!gameState.gameActive) return;
  
    const blueScore = gameState.blueScore;
    const redScore = gameState.redScore;
    const difference = Math.abs(blueScore - redScore);
    
    // Solo declarar ganador si la diferencia es exactamente 12 o más
    if (difference >= 12) {
      // Desactivar el juego primero para evitar condiciones de carrera
      gameState.gameActive = false;
      
      // Determinar el ganador
      const winner = blueScore > redScore ? 'azul' : 'rojo';
      
      // Crear objeto de datos para el evento
      const victoryData = {
        winner: winner,
        blueScore: blueScore,
        redScore: redScore,
        difference: difference,
        timestamp: Date.now()
      };
      
      try {
        // Emitir el evento de victoria a todos los clientes
        io.emit('victoriaPorDiferencia', victoryData);
        
        console.log(`¡El equipo ${winner} gana por diferencia de ${difference} puntos!`);
        console.log('Puntuación final:', `Azul: ${blueScore} - Rojo: ${redScore}`);
        
        // Opcional: Reiniciar el juego después de un tiempo
        // setTimeout(() => resetGame(), 10000);
      } catch (error) {
        console.error('Error al emitir evento de victoria:', error);
        // Reactivar el juego si hubo un error
        gameState.gameActive = true;
      }
    }
  }

// Verificar que el servidor esté escuchando en el puerto 3000
server.listen(3000, () => {
    console.log('Servidor escuchando en http://localhost:3000');
});
