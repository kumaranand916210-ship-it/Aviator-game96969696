const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ DATA STORE (JSON file instead of MongoDB) ============
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) { console.error('Data load error:', e); }
  return { users: {}, deposits: [], withdraws: [], gameHistory: [], admin: { phone: '7903368331', password: 'admin79911' } };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

// ============ GENERATE USER ID ============
function generateUserId() {
  return 'U' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ============ API ROUTES ============

// User login/signup
app.post('/api/login', (req, res) => {
  const { phone } = req.body;
  let user = Object.values(data.users).find(u => u.phone === phone);
  if (!user) {
    const userId = generateUserId();
    user = { userId, phone, balance: 0, name: '' };
    data.users[userId] = user;
    saveData();
  }
  res.json({ success: true, user });
});

// Get user data
app.get('/api/user/:userId', (req, res) => {
  const user = data.users[req.params.userId];
  if (!user) return res.json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});

// Deposit request (user submits UTR)
app.post('/api/deposit', (req, res) => {
  const { userId, utr, amount, upiId } = req.body;
  const deposit = {
    id: 'DEP' + Date.now(),
    userId,
    utr,
    amount: parseFloat(amount),
    upiId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.deposits.push(deposit);
  saveData();
  res.json({ success: true, deposit });
});

// Withdraw request
app.post('/api/withdraw', (req, res) => {
  const { userId, amount, upiId } = req.body;
  const user = data.users[userId];
  if (!user) return res.json({ success: false, message: 'User not found' });
  if (user.balance < amount) return res.json({ success: false, message: 'Insufficient balance' });
  
  const withdraw = {
    id: 'WD' + Date.now(),
    userId,
    amount: parseFloat(amount),
    upiId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.withdraws.push(withdraw);
  user.balance -= parseFloat(amount);
  saveData();
  res.json({ success: true, withdraw });
});

// Admin: Get all deposits
app.get('/api/admin/deposits', (req, res) => {
  const { phone, password } = req.query;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  res.json({ success: true, deposits: data.deposits });
});

// Admin: Get all withdraws
app.get('/api/admin/withdraws', (req, res) => {
  const { phone, password } = req.query;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  res.json({ success: true, withdraws: data.withdraws });
});

// Admin: Approve deposit
app.post('/api/admin/approve-deposit', (req, res) => {
  const { phone, password, depositId } = req.body;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  const deposit = data.deposits.find(d => d.id === depositId);
  if (!deposit) return res.json({ success: false, message: 'Deposit not found' });
  
  deposit.status = 'approved';
  const user = data.users[deposit.userId];
  if (user) user.balance += deposit.amount;
  saveData();
  res.json({ success: true, message: 'Deposit approved!' });
});

// Admin: Reject deposit
app.post('/api/admin/reject-deposit', (req, res) => {
  const { phone, password, depositId } = req.body;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  const deposit = data.deposits.find(d => d.id === depositId);
  if (!deposit) return res.json({ success: false, message: 'Deposit not found' });
  deposit.status = 'rejected';
  saveData();
  res.json({ success: true, message: 'Deposit rejected!' });
});

// Admin: Approve withdraw (pay)
app.post('/api/admin/pay-withdraw', (req, res) => {
  const { phone, password, withdrawId } = req.body;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  const withdraw = data.withdraws.find(w => w.id === withdrawId);
  if (!withdraw) return res.json({ success: false, message: 'Withdraw not found' });
  withdraw.status = 'paid';
  saveData();
  res.json({ success: true, message: 'Withdraw paid!' });
});

// Admin: Reject withdraw
app.post('/api/admin/reject-withdraw', (req, res) => {
  const { phone, password, withdrawId } = req.body;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  const withdraw = data.withdraws.find(w => w.id === withdrawId);
  if (!withdraw) return res.json({ success: false, message: 'Withdraw not found' });
  withdraw.status = 'rejected';
  // Refund balance
  const user = data.users[withdraw.userId];
  if (user) user.balance += withdraw.amount;
  saveData();
  res.json({ success: true, message: 'Withdraw rejected & refunded!' });
});

// Admin: Get all users
app.get('/api/admin/users', (req, res) => {
  const { phone, password } = req.query;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  res.json({ success: true, users: Object.values(data.users) });
});

// Admin: Update user balance
app.post('/api/admin/update-balance', (req, res) => {
  const { phone, password, userId, amount } = req.body;
  if (phone !== data.admin.phone || password !== data.admin.password) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  const user = data.users[userId];
  if (!user) return res.json({ success: false, message: 'User not found' });
  user.balance = parseFloat(amount);
  saveData();
  res.json({ success: true, message: 'Balance updated!' });
});

// ============ AVIATOR GAME ENGINE ============
let gameState = {
  status: 'waiting', // waiting, flying, crashed
  multiplier: 1.00,
  crashPoint: 0,
  history: [],
  round: 0,
  totalBet: 0,
  timer: 15
};

function generateCrashPoint() {
  // Random crash between 1.01x and 50x (weighted lower)
  const r = Math.random();
  let crash;
  if (r < 0.3) crash = 1.01 + Math.random() * 0.49;      // 1.01 - 1.50
  else if (r < 0.55) crash = 1.50 + Math.random() * 1.0; // 1.50 - 2.50
  else if (r < 0.75) crash = 2.50 + Math.random() * 2.5; // 2.50 - 5.00
  else if (r < 0.88) crash = 5.00 + Math.random() * 5.0; // 5.00 - 10.00
  else if (r < 0.95) crash = 10.00 + Math.random() * 15.0; // 10.00 - 25.00
  else crash = 25.00 + Math.random() * 25.0;             // 25.00 - 50.00
  return Math.round(crash * 100) / 100;
}

function startGame() {
  gameState.status = 'flying';
  gameState.multiplier = 1.00;
  gameState.crashPoint = generateCrashPoint();
  gameState.round++;
  gameState.totalBet = 0;
  
  // Clear all player bets for new round
  Object.keys(data.users).forEach(uid => {
    data.users[uid].currentBet = 0;
    data.users[uid].hasCashedOut = false;
    data.users[uid].isPlaying = false;
  });
  
  io.emit('gameStart', { round: gameState.round });
  
  // Fly the plane
  const flyInterval = setInterval(() => {
    if (gameState.status !== 'flying') {
      clearInterval(flyInterval);
      return;
    }
    
    gameState.multiplier = Math.round((gameState.multiplier + 0.01 + Math.random() * 0.02) * 100) / 100;
    
    // Check crash
    if (gameState.multiplier >= gameState.crashPoint) {
      clearInterval(flyInterval);
      gameState.status = 'crashed';
      gameState.multiplier = gameState.crashPoint;
      
      // Lose bets for players who didn't cash out
      Object.keys(data.users).forEach(uid => {
        const user = data.users[uid];
        if (user.isPlaying && !user.hasCashedOut && user.currentBet > 0) {
          // Bet is lost
          user.isPlaying = false;
          user.currentBet = 0;
        }
      });
      
      saveData();
      
      // Add to history
      gameState.history.unshift(gameState.crashPoint);
      if (gameState.history.length > 20) gameState.history.pop();
      
      io.emit('gameCrashed', { multiplier: gameState.crashPoint, round: gameState.round });
      
      // Start waiting period
      gameState.status = 'waiting';
      gameState.timer = 12;
      const waitInterval = setInterval(() => {
        gameState.timer--;
        io.emit('timer', { timer: gameState.timer });
        if (gameState.timer <= 0) {
          clearInterval(waitInterval);
          startGame();
        }
      }, 1000);
    } else {
      io.emit('multiplierUpdate', { multiplier: gameState.multiplier, round: gameState.round });
    }
  }, 100);
}

// Player place bet
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('joinGame', (data) => {
    socket.userId = data.userId;
    socket.join('players');
    
    // Send current game state
    socket.emit('gameState', {
      status: gameState.status,
      multiplier: gameState.multiplier,
      timer: gameState.timer,
      round: gameState.round,
      history: gameState.history,
      balance: data.users[socket.userId]?.balance || 0,
      currentBet: data.users[socket.userId]?.currentBet || 0,
      isPlaying: data.users[socket.userId]?.isPlaying || false
    });
  });
  
  socket.on('placeBet', (betData) => {
    const user = data.users[socket.userId];
    if (!user) return;
    const betAmount = parseFloat(betData.amount);
    if (betAmount > user.balance || betAmount <= 0) return;
    if (gameState.status !== 'waiting') return;
    
    user.balance -= betAmount;
    user.currentBet = betAmount;
    user.isPlaying = true;
    user.hasCashedOut = false;
    gameState.totalBet += betAmount;
    saveData();
    
    io.emit('betPlaced', { userId: socket.userId, amount: betAmount, balance: user.balance });
  });
  
  socket.on('cashOut', () => {
    const user = data.users[socket.userId];
    if (!user || !user.isPlaying || user.hasCashedOut) return;
    if (gameState.status !== 'flying') return;
    
    const winAmount = Math.round(user.currentBet * gameState.multiplier * 100) / 100;
    user.balance += winAmount;
    user.hasCashedOut = true;
    user.isPlaying = false;
    user.currentBet = 0;
    saveData();
    
    io.emit('cashOutSuccess', { 
      userId: socket.userId, 
      winAmount, 
      multiplier: gameState.multiplier,
      balance: user.balance 
    });
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start first game after server starts
setTimeout(() => {
  gameState.status = 'waiting';
  gameState.timer = 12;
  io.emit('timer', { timer: gameState.timer });
  setTimeout(() => startGame(), 12000);
}, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Aviator Server running on port ${PORT}`);
});
