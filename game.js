// --- 1. CONFIGURACIÓN INICIAL ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const inputDisplay = document.getElementById('inputDisplay');
// ¡NUEVO! Contenedores de botones
const ammoButtonsDiv = document.getElementById('ammoButtons');
const shieldButtonsDiv = document.getElementById('shieldButtons');


// ¡IMPORTANTE! URL de Ngrok
const SOCKET_URL = "wss://ade10e579112.ngrok-free.app"; // "wss://tu-url-ngrok.io"

// --- 2. ESTADO DEL JUEGO (CLIENTE) ---

let myAmmo = ["KAIZEN", "MUDA", "KANBAN"];
let myShields = ["ESCUDO"];
let currentInput = ""; 

const LEAN_WORDS_BANK = ["JIT", "POKA-YOKE", "LEAN", "VALOR", "FLUJO", "MEJORA", "TOYOTA", "OHNO"];
const SHIELD_WORDS_BANK = ["ESCUDO", "MURO", "DEFENSA", "STOP"];

let myPlayerId = null;
let serverGameState = null; 
let lastRenderTime = Date.now(); 

// ¡NUEVO! Bandera de detección de dispositivo
let isMobileDevice = false;

// --- ¡NUEVO! FUNCIÓN DE DETECCIÓN ---
function detectDevice() {
    if (/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        isMobileDevice = true;
        document.body.classList.add('mobile'); // Añade la clase 'mobile' al body
    }
}

// --- 3. CONEXIÓN WEBSOCKET ---
const ws = new WebSocket(SOCKET_URL);

ws.onopen = () => {
    console.log("¡Conectado al servidor autoritativo!");
    
    // ¡NUEVO! Configurar los listeners correctos
    setupInputListeners();
    
    // ¡NUEVO! Dibujar los botones si es móvil
    if (isMobileDevice) {
        updateMobileControls();
    }
};

ws.onmessage = (event) => {
    // ... (Sin cambios aquí) ...
    const data = JSON.parse(event.data);
    if (data.type === 'welcome') {
        myPlayerId = data.yourId;
        serverGameState = data.state; 
        console.log(`¡Bienvenido! Eres el Jugador ${myPlayerId}`);
    }
    if (data.type === 'state_update') {
        serverGameState = data.state;
    }
    if (data.type === 'error') {
        console.error("Error del servidor:", data.message);
    }
};

// --- 4. MANEJO DE TECLADO ---

// ¡NUEVO! Esta función decide qué listeners activar
function setupInputListeners() {
    if (isMobileDevice) {
        // En móvil, no hacemos nada aquí.
        // Los listeners están en los botones.
        console.log("Modo móvil activado. Usando botones.");
    } else {
        // En PC, activamos el listener de teclado
        console.log("Modo PC activado. Usando teclado.");
        window.addEventListener('keydown', handlePCKeyboard);
    }
}

// ¡CAMBIO! La lógica del teclado ahora está en su propia función
function handlePCKeyboard(e) {
    if (!myPlayerId || !serverGameState) return;

    if (e.key === 'Enter') {
        if (tryActivateShield(currentInput)) {
            ws.send(JSON.stringify({ type: 'input_shield' }));
        } 
        else if (tryAttack(currentInput)) {
            ws.send(JSON.stringify({ type: 'input_fire', word: currentInput }));
        }
        currentInput = ""; 
    } else if (e.key === 'Backspace') {
        currentInput = currentInput.slice(0, -1);
    } else if (e.key.length === 1 && e.key.match(/[a-zA-Z0-9-]/)) {
        currentInput += e.key.toUpperCase();
    }
    
    inputDisplay.textContent = currentInput;
}

// --- 5. LÓGICA DEL JUEGO (SOLO CLIENTE) ---
// (¡Sin cambios aquí! Esta lógica se reutiliza)

function tryAttack(word) {
    const ammoIndex = myAmmo.indexOf(word);
    if (ammoIndex > -1) {
        myAmmo.splice(ammoIndex, 1); 
        getNewAmmoWord();             
        return true; 
    }
    return false;
}

function tryActivateShield(word) {
    const shieldIndex = myShields.indexOf(word);
    if (shieldIndex > -1) {
        myShields.splice(shieldIndex, 1);
        getNewShieldWord();
        return true; 
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
    // ... (Limpieza, Delta Time, y 'Conectando...') ...
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();
    const deltaTime = (now - lastRenderTime) / 1000; 
    lastRenderTime = now;
    if (!serverGameState || !myPlayerId) {
        ctx.fillStyle = 'white';
        ctx.font = '20px Consolas';
        ctx.fillText("Conectando con el servidor...", 50, 50);
        requestAnimationFrame(gameLoop);
        return;
    }

    // Dibujar estado del servidor
    const state = serverGameState; 
    extrapolateProjectiles(state.projectiles, deltaTime);
    drawPlayers(state.players);
    drawProjectiles(state.projectiles);
    drawShields(state.players);
    drawScore(state.players);
    
    // ¡CAMBIO! Dibujar la munición local
    // Solo dibujamos en el canvas si NO estamos en móvil
    if (!isMobileDevice) {
        drawAmmo();
    }
    
    // ... (Comprobación de victoria, sin cambios) ...
    const myId = myPlayerId;
    const rivalId = (myId === 1) ? 2 : 1;
    const myPlayer = state.players[myId];
    const rivalPlayer = state.players[rivalId];
    if (rivalPlayer && rivalPlayer.score >= 3) {
        drawWinScreen("¡PERDISTE! (Rival 3 Puntos)");
        return; 
    }
    if (myPlayer && myPlayer.score >= 3) {
        drawWinScreen("¡GANASTE! (Tú 3 Puntos)");
        return; 
    }

    requestAnimationFrame(gameLoop);
}

// --- 7. FUNCIONES DE DIBUJADO ---

// ... (extrapolateProjectiles, drawPlayers, drawProjectiles, drawShields ... sin cambios)
function extrapolateProjectiles(projectilesState, deltaTime) {
    const SERVER_TICK_RATE = 30; 
    if (!projectilesState) return;
    for (const proj of projectilesState) {
        const speedPerSecond = proj.speed * SERVER_TICK_RATE;
        proj.x += speedPerSecond * deltaTime;
    }
}
function drawPlayers(playersState) {
    if (playersState[1]) {
        ctx.fillStyle = (myPlayerId === 1) ? '#00FF00' : '#FF0000'; 
        ctx.fillRect(playersState[1].x, playersState[1].y, 20, 20);
    }
    if (playersState[2]) {
        ctx.fillStyle = (myPlayerId === 2) ? '#00FF00' : '#FF0000'; 
        ctx.fillRect(playersState[2].x, playersState[2].y, 20, 20);
    }
}
function drawProjectiles(projectilesState) {
    if (!projectilesState) return;
    for (const proj of projectilesState) {
        ctx.fillStyle = (proj.owner === myPlayerId) ? '#00FFFF' : '#FF00FF';
        ctx.font = '16px Consolas';
        ctx.fillText(proj.word, proj.x, proj.y);
    }
}
function drawShields(playersState) {
    if (playersState[1] && playersState[1].shield) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.7)';
        ctx.strokeStyle = '#00FFFF';
        ctx.fillRect(playersState[1].x + 30, playersState[1].y - 40, 10, 100);
        ctx.strokeRect(playersState[1].x + 30, playersState[1].y - 40, 10, 100);
    }
    if (playersState[2] && playersState[2].shield) {
        ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
        ctx.strokeStyle = '#FF8C00';
        ctx.fillRect(playersState[2].x - 40, playersState[2].y - 40, 10, 100);
        ctx.strokeRect(playersState[2].x - 40, playersState[2].y - 40, 10, 100);
    }
}
// ... (drawScore, drawWinScreen ... sin cambios)
function drawScore(playersState) {
    const myId = myPlayerId;
    const rivalId = (myId === 1) ? 2 : 1;
    const myScore = playersState[myId] ? playersState[myId].score : 0;
    const rivalScore = playersState[rivalId] ? playersState[rivalId].score : 0;
    ctx.fillStyle = 'white';
    ctx.font = '20px Consolas';
    ctx.fillText(`TÚ: ${myScore}`, canvas.width / 2 - 100, 30);
    ctx.fillText(`RIVAL: ${rivalScore}`, canvas.width / 2 + 30, 30);
}
function drawWinScreen(message) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '40px Consolas';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

// --- ¡CAMBIO! drawAmmo() se queda, pero solo se llama en PC ---
function drawAmmo() {
    ctx.fillStyle = 'white';
    ctx.font = '18px Consolas';
    ctx.fillText("Munición (Enter para disparar):", 10, 30);
    // ... (resto de la función sin cambios) ...
    let lastY = 30;
    for (let i = 0; i < myAmmo.length; i++) {
        lastY = 60 + (i * 30);
        ctx.fillStyle = '#FFFF00'; 
        ctx.fillText(myAmmo[i], 10, lastY);
    }
    lastY += 50; 
    ctx.fillStyle = 'white';
    ctx.fillText("Escudo (Enter para activar):", 10, lastY);
    for (let i = 0; i < myShields.length; i++) {
        ctx.fillStyle = '#00CCFF'; 
        ctx.fillText(myShields[i], 10, lastY + 30 + (i * 30));
    }
}


// --- ¡NUEVO! Función para dibujar los botones de móvil ---
function updateMobileControls() {
    // 1. Limpiar botones antiguos
    ammoButtonsDiv.innerHTML = "";
    shieldButtonsDiv.innerHTML = "";

    // 2. Crear botones de Munición
    for (const word of myAmmo) {
        const btn = document.createElement('button');
        btn.textContent = word;
        
        // Al tocar un botón:
        btn.onclick = () => {
            // Usamos la MISMA lógica de 'tryAttack'
            if (tryAttack(word)) {
                // Si la palabra es válida, enviamos al servidor
                ws.send(JSON.stringify({ type: 'input_fire', word: word }));
                // Y actualizamos los botones
                updateMobileControls();
            }
        };
        ammoButtonsDiv.appendChild(btn);
    }

    // 3. Crear botones de Escudo
    for (const word of myShields) {
        const btn = document.createElement('button');
        btn.textContent = word;
        
        btn.onclick = () => {
            if (tryActivateShield(word)) {
                ws.send(JSON.stringify({ type: 'input_shield' }));
                updateMobileControls(); // Actualizar botones
            }
        };
        shieldButtonsDiv.appendChild(btn);
    }
}


// --- ¡CAMBIO! Iniciar el juego ---
detectDevice(); // 1. Detectar dispositivo PRIMERO
gameLoop();     // 2. Iniciar el bucle del juego
