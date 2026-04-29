// ============ CONFIG ============
const SERVER_URL = window.location.origin; // Change this to your Railway URL after deploy
const UPI_ID = '7903368331@fam';

// ============ STATE ============
let socket;
let currentUser = null;
let gameState = {
    status: 'waiting',
    multiplier: 1.00,
    timer: 12,
    round: 0,
    history: []
};

// ============ AUTH ============
function login() {
    const phone = document.getElementById('phoneInput').value.trim();
    if (phone.length < 10) {
        showError('Please enter valid 10-digit phone number');
        return;
    }

    fetch(`${SERVER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
    })
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            currentUser = res.user;
            document.getElementById('authPage').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';
            document.getElementById('userIdDisplay').textContent = 'ID: ' + currentUser.userId;
            document.getElementById('balanceDisplay').textContent = currentUser.balance;
            connectSocket();
            loadTransactions();
        } else {
            showError(res.message || 'Login failed');
        }
    })
    .catch(e => showError('Connection error. Server may be offline.'));
}

function showError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
}

// ============ SOCKET.IO ============
function connectSocket() {
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('joinGame', { userId: currentUser.userId });
    });

    socket.on('gameState', (state) => {
        gameState.status = state.status;
        gameState.multiplier = state.multiplier;
        gameState.timer = state.timer;
        gameState.round = state.round;
        gameState.history = state.history;
        updateUI();
    });

    socket.on('timer', (data) => {
        gameState.timer = data.timer;
        updateTimer();
    });

    socket.on('multiplierUpdate', (data) => {
        gameState.multiplier = data.multiplier;
        gameState.round = data.round;
        updateMultiplier();
    });

    socket.on('gameStart', (data) => {
        gameState.status = 'flying';
        gameState.multiplier = 1.00;
        gameState.round = data.round;
        updateUI();
    });

    socket.on('gameCrashed', (data) => {
        gameState.status = 'crashed';
        gameState.multiplier = data.multiplier;
        gameState.history.unshift(data.multiplier);
        if (gameState.history.length > 20) gameState.h
