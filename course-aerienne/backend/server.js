const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000", // Permet à React de se connecter
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 4000;

// Stockage de l'état des parties en mémoire
const rooms = {}; // { roomId: { id, players: [], boardState: {}, currentPlayer: '', gameStatus: 'waiting' | 'playing', creatorId: '', turnOrder: [], diceRollCount: {} } }

// Couleurs disponibles pour les joueurs
const availableColors = ['red', 'blue', 'green', 'yellow'];

/**
 * Initialise les pions pour un nouveau joueur.
 * Chaque joueur a 4 pions, tous dans leur hangar au début.
 * @param {string} playerId
 * @param {string} playerColor
 * @returns {Array} Liste des pions initialisés
 */
const initializePieces = (playerId, playerColor) => {
    const pieces = [];
    for (let i = 0; i < 4; i++) {
        pieces.push({
            id: `${playerId}-piece-${i}`,
            playerId: playerId,
            color: playerColor,
            position: -1, // -1 signifie dans le hangar
            status: 'hangar' // 'hangar', 'on_board', 'finished'
        });
    }
    return pieces;
};

// Logique du jeu (très simplifiée pour l'exemple)
const gameLogic = {
    applyDiceRoll: (roomId, playerId, diceValue) => {
        const room = rooms[roomId];
        if (!room) return;

        if (diceValue === 6) {
            room.diceRollCount[playerId] = (room.diceRollCount[playerId] || 0) + 1;
            if (room.diceRollCount[playerId] >= 3) {
                gameLogic.passTurn(room);
                room.diceRollCount[playerId] = 0;
            }
        } else {
            room.diceRollCount[playerId] = 0;
            gameLogic.passTurn(room);
        }
        io.to(roomId).emit('game_state_update', { roomId, gameState: room });
    },

    passTurn: (room) => {
        const currentIndex = room.turnOrder.indexOf(room.currentPlayer);
        const nextIndex = (currentIndex + 1) % room.turnOrder.length;
        room.currentPlayer = room.turnOrder[nextIndex];
        console.log(`Salle ${room.id}: Tour de ${room.currentPlayer}`);
    },
};


io.on('connection', (socket) => {
    console.log(`[CONNECT] Nouveau client connecté: ${socket.id}`);

    // Gérer la création de salle
    socket.on('create_room', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 9).toUpperCase();
        if (rooms[roomId]) {
            console.log(`[CREATE_ROOM_ERROR] Tentative de création d'une salle avec un ID existant: ${roomId}`);
            socket.emit('error', { message: 'Erreur: Veuillez réessayer de créer une salle.' });
            return;
        }

        const playerColor = availableColors[0];
        const newPlayer = { id: socket.id, name: playerName, color: playerColor, pieces: initializePieces(socket.id, playerColor) };

        rooms[roomId] = {
            id: roomId,
            players: [newPlayer],
            boardState: {},
            currentPlayer: null,
            gameStatus: 'waiting',
            creatorId: socket.id,
            turnOrder: [],
            diceRollCount: {},
        };
        socket.join(roomId);
        socket.emit('room_created', { roomId });
        // Envoie l'état initial complet de la salle au joueur qui vient de la créer
        io.to(roomId).emit('game_state_update', { roomId, gameState: rooms[roomId] });
        console.log(`[CREATE_ROOM_SUCCESS] Salle créée: ${roomId} par ${playerName} (${socket.id}).`);
        console.log(`[ROOM_STATE] État de la salle ${roomId} après création:`, JSON.stringify(rooms[roomId], null, 2));
    });

    // Gérer le fait de rejoindre une salle
    socket.on('join_room', ({ roomId, playerName }) => {
        console.log(`[JOIN_ROOM_ATTEMPT] Joueur ${playerName} (${socket.id}) tente de rejoindre la salle ${roomId}.`);
        const room = rooms[roomId];

        if (!room) {
            console.log(`[JOIN_ROOM_FAILURE] Salle ${roomId} n'existe pas.`);
            socket.emit('error', { message: 'La salle n\'existe pas.' });
            return;
        }

        console.log(`[JOIN_ROOM_INFO] État actuel de la salle ${roomId}:`, JSON.stringify(room, null, 2));

        if (room.players.length >= 4) {
            console.log(`[JOIN_ROOM_FAILURE] Salle ${roomId} est pleine (${room.players.length} joueurs).`);
            socket.emit('error', { message: 'La salle est pleine (4 joueurs max).' });
            return;
        }
        if (room.gameStatus !== 'waiting') {
            console.log(`[JOIN_ROOM_FAILURE] Partie déjà commencée dans la salle ${roomId}. Statut: ${room.gameStatus}.`);
            socket.emit('error', { message: 'La partie a déjà commencé dans cette salle.' });
            return;
        }

        // Vérifier si le joueur est déjà dans la salle (reconnexion)
        const existingPlayer = room.players.find(p => p.id === socket.id);
        if (existingPlayer) {
            console.log(`[JOIN_ROOM_RECONNECT] ${playerName} (${socket.id}) est déjà dans la salle ${roomId}. Reconnexion.`);
            socket.join(roomId); // S'assurer qu'il est bien reconnecté à la socket room
            socket.emit('room_joined', { success: true, roomId, players: room.players });
            io.to(roomId).emit('game_state_update', { roomId, gameState: room });
            return;
        }

        const playerColor = availableColors[room.players.length];
        const newPlayer = { id: socket.id, name: playerName, color: playerColor, pieces: initializePieces(socket.id, playerColor) };

        room.players.push(newPlayer);
        socket.join(roomId);

        socket.emit('room_joined', { success: true, roomId, players: room.players });
        io.to(roomId).emit('player_joined', { playerName, playerId: socket.id, playerColor });
        io.to(roomId).emit('game_state_update', { roomId, gameState: room }); // Met à jour l'état de la salle pour tous
        console.log(`[JOIN_ROOM_SUCCESS] ${playerName} (${socket.id}) a rejoint la salle ${roomId}.`);
        console.log(`[ROOM_STATE] État de la salle ${roomId} après ajout du joueur:`, JSON.stringify(room, null, 2));
    });

    // Gérer le lancement du jeu
    socket.on('start_game', ({ roomId }) => {
        console.log(`[START_GAME_ATTEMPT] Tentative de démarrage de la partie dans la salle ${roomId} par ${socket.id}.`);
        const room = rooms[roomId];
        if (!room) {
            console.log(`[START_GAME_FAILURE] Salle ${roomId} n'existe pas lors du démarrage.`);
            socket.emit('error', { message: 'La salle n\'existe pas.' });
            return;
        }
        if (room.creatorId !== socket.id) {
            console.log(`[START_GAME_FAILURE] ${socket.id} n'est pas le créateur de la salle ${roomId}. Créateur: ${room.creatorId}.`);
            socket.emit('error', { message: 'Seul le créateur de la salle peut démarrer la partie.' });
            return;
        }
        if (room.players.length < 2) {
            console.log(`[START_GAME_FAILURE] Salle ${roomId} nécessite au moins 2 joueurs. Actuel: ${room.players.length}.`);
            socket.emit('error', { message: 'Il faut au moins 2 joueurs pour démarrer la partie.' });
            return;
        }
        if (room.gameStatus === 'playing') {
            console.log(`[START_GAME_FAILURE] Partie déjà en cours dans la salle ${roomId}.`);
            socket.emit('error', { message: 'La partie a déjà commencé.' });
            return;
        }

        room.gameStatus = 'playing';
        room.turnOrder = room.players.map(p => p.id).sort(() => Math.random() - 0.5);
        room.currentPlayer = room.turnOrder[0];

        // Initialiser l'état du plateau avec tous les pions dans les hangars
        room.boardState = {};

        io.to(roomId).emit('game_started', {
            roomId,
            firstPlayerId: room.currentPlayer,
            turnOrder: room.turnOrder
        });
        io.to(roomId).emit('game_state_update', { roomId, gameState: room });
        console.log(`[START_GAME_SUCCESS] Partie démarrée dans la salle ${roomId}. Premier joueur: ${room.currentPlayer}. Ordre: ${room.turnOrder.join(', ')}`);
        console.log(`[ROOM_STATE] État de la salle ${roomId} après démarrage:`, JSON.stringify(room, null, 2));
    });

    // Gérer le lancement du dé
    socket.on('roll_dice', ({ roomId }) => {
        console.log(`[ROLL_DICE_ATTEMPT] Joueur ${socket.id} tente de lancer le dé dans la salle ${roomId}.`);
        const room = rooms[roomId];
        if (!room) {
            console.log(`[ROLL_DICE_FAILURE] Salle ${roomId} n'existe pas.`);
            socket.emit('error', { message: 'La salle n\'existe pas.' });
            return;
        }
        if (room.gameStatus !== 'playing') {
            console.log(`[ROLL_DICE_FAILURE] Partie non démarrée dans la salle ${roomId}.`);
            socket.emit('error', { message: 'La partie n\'a pas encore commencé.' });
            return;
        }
        if (room.currentPlayer !== socket.id) {
            console.log(`[ROLL_DICE_FAILURE] Ce n'est pas le tour de ${socket.id} dans la salle ${roomId}. Tour actuel: ${room.currentPlayer}.`);
            socket.emit('error', { message: 'Ce n\'est pas votre tour.' });
            return;
        }

        const diceValue = Math.floor(Math.random() * 6) + 1;
        io.to(roomId).emit('dice_rolled', { playerId: socket.id, diceValue });
        console.log(`[ROLL_DICE_SUCCESS] Salle ${roomId}: ${socket.id} a lancé le dé et a obtenu ${diceValue}.`);

        gameLogic.applyDiceRoll(roomId, socket.id, diceValue);
    });

    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] Client déconnecté: ${socket.id}`);
        for (const roomId in rooms) {
            let room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                console.log(`[PLAYER_LEFT] ${disconnectedPlayer.name} (${socket.id}) a quitté la salle ${roomId}.`);

                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`[ROOM_DELETED] Salle ${roomId} supprimée (vide).`);
                } else {
                    if (room.creatorId === socket.id && room.players.length > 0) {
                        room.creatorId = room.players[0].id;
                        console.log(`[NEW_CREATOR] Nouveau créateur pour la salle ${roomId}: ${room.creatorId} (${room.players[0].name}).`);
                    }

                    if (room.gameStatus === 'playing' && room.currentPlayer === socket.id) {
                        console.log(`[TURN_CHANGE_DISCONNECT] C'était le tour de ${socket.id}. Passage au joueur suivant.`);
                        gameLogic.passTurn(room);
                    }

                    io.to(roomId).emit('player_left', { playerId: socket.id, playerName: disconnectedPlayer.name });
                    io.to(roomId).emit('game_state_update', { roomId, gameState: room });
                    console.log(`[ROOM_STATE] État de la salle ${roomId} après déconnexion de ${socket.id}:`, JSON.stringify(room, null, 2));
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Serveur Socket.IO écoutant sur le port ${PORT}`);
});