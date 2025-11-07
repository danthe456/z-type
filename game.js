// --- 1. CONFIGURACIÓN INICIAL ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const inputDisplay = document.getElementById('inputDisplay');

// ¡IMPORTANTE! Asegúrate de que esta URL de Ngrok sea la correcta.
const SOCKET_URL = "wss://ade10e579112.ngrok-free.app"; // "wss://tu-url-ngrok.io"

// --- 2. ESTADO DEL JUEGO (CLIENTE) ---

let myAmmo = ["KAIZEN", "MUDA", "KANBAN"];
let myShields = ["ESCUDO"];
let currentInput = ""; // Lo que el usuario está escribiendo

// Bancos de palabras (sin cambios)
const LEAN_WORDS_BANK = ["JIT", "POKA-YOKE", "LEAN", "VALOR", "FLUJO", "MEJORA", "TOYOTA", "OHNO"];
const SHIELD_WORDS_BANK = ["ESCUDO", "MURO", "DEFENSA", "STOP"];

// ¡NUEVO! Aquí guardaremos nuestro ID y el estado que nos envía el servidor.
let myPlayerId = null;
let serverGameState = null; // Esta será la "verdad absoluta"

// --- 3. CONEXIÓN WEBSOCKET ---
const ws = new WebSocket(SOCKET_URL);

ws.onopen = () => {
    console.log("¡Conectado al servidor autoritativo!");
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // 1. Mensaje de Bienvenida: El servidor nos asigna un ID.
    if (data.type === 'welcome') {
        myPlayerId = data.yourId;
        serverGameState = data.state; // Guarda el estado inicial
        console.log(`¡Bienvenido! Eres el Jugador ${myPlayerId}`);
    }

    // 2. Actualización de Estado: El servidor nos envía la "foto" del juego.
    if (data.type === 'state_update') {
        // Simplemente sobrescribimos nuestro estado local con la verdad del servidor.
        serverGameState = data.state;
    }
    
    // 3. ¡CORREGIDO! Manejar mensajes de error del servidor (ej. "Servidor lleno")
    if (data.type === 'error') {
        console.error("Error del servidor:", data.message);
        // Podríamos mostrar este error en pantalla
        // Por ahora, lo dejamos en la consola.
    }
};

// --- 4. MANEJO DE TECLADO ---
window.addEventListener('keydown', (e) => {
    // No hacer nada si aún no estamos conectados
    if (!myPlayerId || !serverGameState) return;

    if (e.key === 'Enter') {
        // 1. INTENTAR ACTIVAR ESCUDO
        if (tryActivateShield(currentInput)) {
            ws.send(JSON.stringify({ type: 'input_shield' }));
        } 
        // 2. INTENTAR ATACAR
        else if (tryAttack(currentInput)) {
            ws.send(JSON.stringify({ type: 'input_fire', word: currentInput }));
        }
        currentInput = ""; // Limpiar el input
    
    } else if (e.key === 'Backspace') {
        currentInput = currentInput.slice(0, -1);
    } else if (e.key.length === 1 && e.key.match(/[a-zA-Z0-9-]/)) { // Aceptar letras, números y guiones
        currentInput += e.key.toUpperCase();
    }
    
    inputDisplay.textContent = currentInput;
});

// --- 5. LÓGICA DEL JUEGO (SOLO CLIENTE) ---
// (Esta sección estaba perfecta, sin cambios)

function tryAttack(word) {
    const ammoIndex = myAmmo.indexOf(word);
    if (ammoIndex > -1) {
        myAmmo.splice(ammoIndex, 1); // Quita la munición
        getNewAmmoWord();             // Recarga
        return true; // ¡Permiso concedido para disparar!
    }
    return false;
}

function tryActivateShield(word) {
    const shieldIndex = myShields.indexOf(word);
    if (shieldIndex > -1) {
        myShields.splice(shieldIndex, 1);
        getNewShieldWord();
        return true; // ¡Permiso concedido para poner escudo!
    }
    return false;
}

function getNewAmmoWord() {
    const newWord = LEAN_WORDS_BANK[Math.floor(Math.random() * LEAN_WORDS_BANK.length)];
    myAmmo.push(newWord);
}

function getNewShieldWord() {
    const newWord = SHIELD_WORDS_BANK[Math.floor(Math.random() * SHIELD_WORDS_BANK.length)];
    myShields.push(newWord);
}

// --- 6. BUCLE PRINCIPAL DEL JUEGO (GAME LOOP) ---

function gameLoop() {
    // 1. Limpiar la pantalla
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 2. Esperar a que el servidor nos dé el estado
    if (!serverGameState || !myPlayerId) {
        ctx.fillStyle = 'white';
        ctx.font = '20px Consolas';
        ctx.fillText("Conectando con el servidor...", 50, 50);
        requestAnimationFrame(gameLoop);
        return;
    }

    // 3. Dibujar todo basándonos en la "verdad" del servidor
    const state = serverGameState; // Un alias más corto
    
    drawPlayers(state.players);
    drawProjectiles(state.projectiles);
    drawShields(state.players);
    drawScore(state.players);
    
    // La munición y el input son locales, así que los dibujamos por separado
    drawAmmo();
    
    // 4. Comprobar condición de victoria (leída desde el servidor)
    const myId = myPlayerId;
    const rivalId = (myId === 1) ? 2 : 1;

    // ¡CORREGIDO! Añadimos comprobaciones para evitar un 'crash'
    // si el rival (o yo) aún no existe en el estado.
    const myPlayer = state.players[myId];
    const rivalPlayer = state.players[rivalId];

    if (rivalPlayer && rivalPlayer.score >= 3) {
        drawWinScreen("¡PERDISTE! (Rival 3 Puntos)");
        return; // Detener el bucle
    }
    if (myPlayer && myPlayer.score >= 3) {
        drawWinScreen("¡GANASTE! (Tú 3 Puntos)");
        return; // Detener el bucle
    }

    // 5. Volver a llamar al bucle en el siguiente frame
    requestAnimationFrame(gameLoop);
}

// --- 7. FUNCIONES DE DIBUJADO ---

function drawPlayers(playersState) {
    // ¡CORREGIDO! Comprobar si el jugador 1 existe antes de dibujarlo
    if (playersState[1]) {
        ctx.fillStyle = (myPlayerId === 1) ? '#00FF00' : '#FF0000'; // Verde si soy yo
        ctx.fillRect(playersState[1].x, playersState[1].y, 20, 20);
    }
    
    // ¡CORREGIDO! Comprobar si el jugador 2 existe antes de dibujarlo
    if (playersState[2]) {
        ctx.fillStyle = (myPlayerId === 2) ? '#00FF00' : '#FF0000'; // Rojo si es el rival
        ctx.fillRect(playersState[2].x, playersState[2].y, 20, 20);
    }
}

function drawProjectiles(projectilesState) {
    // Esta función estaba bien, un array vacío no da error.
    for (const proj of projectilesState) {
        // Cian si es mío, Magenta si es del rival
        ctx.fillStyle = (proj.owner === myPlayerId) ? '#00FFFF' : '#FF00FF';
        ctx.font = '16px Consolas';
        ctx.fillText(proj.word, proj.x, proj.y);
    }
}

function drawShields(playersState) {
    // ¡CORREGIDO! Comprobar si el jugador 1 existe ANTES de leer su escudo
    if (playersState[1] && playersState[1].shield) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.7)';
        ctx.strokeStyle = '#00FFFF';
        ctx.fillRect(playersState[1].x + 30, playersState[1].y - 40, 10, 100);
        ctx.strokeRect(playersState[1].x + 30, playersState[1].y - 40, 10, 100);
    }
    // ¡CORREGIDO! Comprobar si el jugador 2 existe ANTES de leer su escudo
    if (playersState[2] && playersState[2].shield) {
        ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
        ctx.strokeStyle = '#FF8C00';
        ctx.fillRect(playersState[2].x - 40, playersState[2].y - 40, 10, 100);
        ctx.strokeRect(playersState[2].x - 40, playersState[2].y - 40, 10, 100);
    }
}

// Esta función estaba perfecta
function drawAmmo() {
    ctx.fillStyle = 'white';
    ctx.font = '18px Consolas';
    ctx.fillText("Munición (Enter para disparar):", 10, 30);
    
    let lastY = 30;
    for (let i = 0; i < myAmmo.length; i++) {
        lastY = 60 + (i * 30);
        ctx.fillStyle = '#FFFF00'; // Amarillo
        ctx.fillText(myAmmo[i], 10, lastY);
    }
    
    lastY += 50; // Añadir espacio
    ctx.fillStyle = 'white';
    ctx.fillText("Escudo (Enter para activar):", 10, lastY);
    
    for (let i = 0; i < myShields.length; i++) {
        ctx.fillStyle = '#00CCFF'; // Azul claro
        ctx.fillText(myShields[i], 10, lastY + 30 + (i * 30));
    }
}

// Esta función también estaba perfecta (ya tenía las comprobaciones)
function drawScore(playersState) {
    const myId = myPlayerId;
    const rivalId = (myId === 1) ? 2 : 1;
    
    // Asegurarse de que el estado exista antes de intentar leerlo
    const myScore = playersState[myId] ? playersState[myId].score : 0;
    const rivalScore = playersState[rivalId] ? playersState[rivalId].score : 0;

    ctx.fillStyle = 'white';
    ctx.font = '20px Consolas';
    ctx.fillText(`TÚ: ${myScore}`, canvas.width / 2 - 100, 30);
    ctx.fillText(`RIVAL: ${rivalScore}`, canvas.width / 2 + 30, 30);
}

// Esta función estaba perfecta
function drawWinScreen(message) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '40px Consolas';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

// ¡Empezar el juego!
gameLoop();