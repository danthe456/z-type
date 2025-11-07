// --- 1. IMPORTACIONES Y CONFIGURACIÓN ---
import { WebSocketServer } from 'ws'; 
import http from 'http';

const server = http.createServer();
const wss = new WebSocketServer({ server });

const PORT = 8080; 
const TICK_RATE = 1000 / 30;

// --- 2. CONSTANTES DEL JUEGO ---
const CANVAS_WIDTH = 1200;
const PLAYER_1_POS = { x: 50, y: 280, width: 20, height: 20 };
const PLAYER_2_POS = { x: 1130, y: 280, width: 20, height: 20 };
const PROJECTILE_SPEED = 8;
const SHIELD_DURATION_MS = 2500;

// --- 3. ESTADO GLOBAL DEL SERVIDOR (LA "VERDAD ABSOLUTA") ---
let gameState = {
    players: {
        // Se llenará con los jugadores 1 y 2
    },
    projectiles: [], // Lista de todos los disparos
};

// ¡CAMBIO! Objeto separado para guardar los Timers.
// Esto NO se enviará a los clientes.
let playerTimers = {}; 

let nextPlayerId = 1; 

// --- 4. LÓGICA DE CONEXIÓN DE JUGADORES ---
wss.on('connection', (ws) => {

    // A. Rechazar si el servidor está lleno
    if (nextPlayerId > 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Servidor lleno. Intenta más tarde.' }));
        ws.close();
        return;
    }

    // B. Asignar ID al jugador y guardarlo
    const playerId = nextPlayerId;
    ws.playerId = playerId; 
    nextPlayerId++;

    console.log(`[Servidor] Jugador ${playerId} conectado.`);

    // C. Crear el estado inicial para este jugador
    gameState.players[playerId] = {
        id: playerId,
        x: (playerId === 1) ? PLAYER_1_POS.x : PLAYER_2_POS.x,
        y: PLAYER_1_POS.y, 
        width: PLAYER_1_POS.width,
        height: PLAYER_1_POS.height,
        score: 0,
        shield: false,
        // ¡CAMBIO! Se eliminó 'shieldTimer: null' de aquí.
    };

    // D. Enviar mensaje de bienvenida
    ws.send(JSON.stringify({
        type: 'welcome',
        yourId: playerId,
        state: gameState 
    }));

    // --- 5. MANEJAR MENSAJES DEL CLIENTE ---
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const player = gameState.players[playerId]; 

        if (!player) return;

        // A. Cliente quiere DISPARAR
        if (data.type === 'input_fire') {
            console.log(`[Servidor] Jugador ${playerId} disparó: ${data.word}`);
            
            const newProjectile = {
                id: `${Date.now()}-${Math.random()}`,
                word: data.word,
                owner: playerId,
                x: (playerId === 1) ? player.x + player.width : player.x - 10,
                y: player.y + 15,
                speed: (playerId === 1) ? PROJECTILE_SPEED : -PROJECTILE_SPEED
            };
            gameState.projectiles.push(newProjectile);
        }

        // B. Cliente quiere ACTIVAR ESCUDO
        if (data.type === 'input_shield' && !player.shield) { 
            console.log(`[Servidor] Jugador ${playerId} activó escudo.`);
            player.shield = true;

            // ¡CAMBIO! Limpiar temporizador viejo del objeto 'playerTimers'
            if (playerTimers[playerId]) clearTimeout(playerTimers[playerId]);

            // ¡CAMBIO! Guardar el nuevo temporizador en 'playerTimers'
            playerTimers[playerId] = setTimeout(() => {
                if (gameState.players[playerId]) { 
                    gameState.players[playerId].shield = false;
                    console.log(`[Servidor] Escudo de Jugador ${playerId} expiró.`);
                }
                delete playerTimers[playerId]; // Limpiamos la referencia
            }, SHIELD_DURATION_MS);
        }
    });

    // --- 6. MANEJAR DESCONEXIÓN ---
    ws.on('close', () => {
        const playerId = ws.playerId; 
        console.log(`[Servidor] Jugador ${playerId} desconectado.`);

        // ¡CAMBIO! Limpiar el temporizador desde 'playerTimers'
        if (playerTimers[playerId]) {
            clearTimeout(playerTimers[playerId]); 
            delete playerTimers[playerId]; 
        }

        // Limpiar estado del jugador
        if (gameState.players[playerId]) {
            delete gameState.players[playerId]; // Eliminar del estado
        }

        // Si no queda nadie, reiniciar el servidor
        if (Object.keys(gameState.players).length === 0) {
            console.log("[Servidor] Todos los jugadores se fueron. Reiniciando estado.");
            gameState.projectiles = [];
            nextPlayerId = 1;
        }
    });
});

// --- 7. BUCLE PRINCIPAL DEL SERVIDOR (GAME LOOP) ---
function gameTick() {
    
    // A. Mover todos los proyectiles
    gameState.projectiles.forEach(proj => {
        proj.x += proj.speed;
    });

    // B. Detectar colisiones
    let projectilesToRemove = new Set(); 
    
    for (const proj of gameState.projectiles) {
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            
            if (proj.owner == playerId) continue;

            const hit = proj.x >= player.x &&
                        proj.x <= player.x + player.width &&
                        proj.y >= player.y &&
                        proj.y <= player.y + player.height;

            if (hit) {
                projectilesToRemove.add(proj.id); 
                
                if (player.shield) {
                    player.shield = false; // El escudo se rompe
                    console.log(`[Servidor] ¡Escudo de ${playerId} bloqueó ${proj.word}!`);

                    // ¡CAMBIO! Limpiar también el temporizador si el escudo se rompe
                    if (playerTimers[playerId]) {
                        clearTimeout(playerTimers[playerId]);
                        delete playerTimers[playerId];
                    }
                
                } else {
                    // ¡Es un golpe!
                    console.log(`[Servidor] ¡${proj.word} golpeó a ${playerId}!`);
                    const owner = gameState.players[proj.owner];
                    if (owner) {
                        owner.score++; 
                 }
                }
            }
        }
    
        if (proj.x < 0 || proj.x > CANVAS_WIDTH) {
            projectilesToRemove.add(proj.id);
        }
    }

    // C. Limpiar los proyectiles marcados
    gameState.projectiles = gameState.projectiles.filter(proj => !projectilesToRemove.has(proj.id));

    // D. Enviar el estado actualizado a TODOS los clientes
    const updateMessage = JSON.stringify({
        type: 'state_update',
        state: gameState // Ahora 'gameState' está limpio de objetos circulares
   });

    wss.clients.forEach((client) => {
        if (client.readyState === 1) { // 1 = OPEN
            client.send(updateMessage);
        }
    });
}

// --- 8. INICIAR EL SERVIDOR Y EL BUCLE DEL JUEGO ---
server.listen(PORT, () => {
    console.log(`[Servidor] ¡Servidor de Guerra de Tecleo iniciado en el puerto ${PORT}!`);
    console.log("[Servidor] Esperando jugadores...");
});

// Iniciar el Game Loop
setInterval(gameTick, TICK_RATE);