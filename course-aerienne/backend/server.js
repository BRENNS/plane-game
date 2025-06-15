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

// Couleurs disponibles pour les joueurs et leurs configurations de plateau
const playerConfigs = {
    red: {
        color: 'red',
        startIndex: 0, // Case de départ sur la piste principale (0-51)
        safeZoneStart: 46, // Dernière case avant sa zone d'arrivée
        finalPathStart: 100 // Début de la piste d'arrivée (utilisée pour le statut des pions)
    },
    blue: {
        color: 'blue',
        startIndex: 13,
        safeZoneStart: 9,
        finalPathStart: 100 // Pour simplifier, nous utilisons le même range 100-105 pour toutes les couleurs
    },
    green: {
        color: 'green',
        startIndex: 26,
        safeZoneStart: 22,
        finalPathStart: 100
    },
    yellow: {
        color: 'yellow',
        startIndex: 39,
        safeZoneStart: 35,
        finalPathStart: 100
    }
};

const availableColors = Object.keys(playerConfigs); // ['red', 'blue', 'green', 'yellow']

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
            status: 'hangar' // 'hangar', 'on_board', 'final_path', 'finished'
        });
    }
    return pieces;
};

// Logique du jeu détaillée
const gameLogic = {
    // Determine the next player's turn
    passTurn: (room) => {
        const currentIndex = room.turnOrder.indexOf(room.currentPlayer);
        const nextIndex = (currentIndex + 1) % room.turnOrder.length;
        room.currentPlayer = room.turnOrder[nextIndex];
        console.log(`Salle ${room.id}: Tour de ${room.currentPlayer}`);
    },

    /**
     * Calcule toutes les actions possibles pour un joueur après un jet de dé.
     * @param {Object} room L'objet de la salle.
     * @param {string} playerId L'ID du joueur.
     * @param {number} diceValue La valeur du dé.
     * @returns {Array} Liste des mouvements possibles [{ pieceId: '...', newPosition: '...', type: 'move' | 'exit_hangar' | 'win' }]
     */
    getPossibleMoves: (room, playerId, diceValue) => {
        const player = room.players.find(p => p.id === playerId);
        if (!player) return [];

        const playerConfig = playerConfigs[player.color];
        const possibleMoves = [];

        player.pieces.forEach(piece => {
            // Règle 1: Sortir un avion du hangar
            if (piece.status === 'hangar') {
                if (diceValue === 6) {
                    // Check if the starting position is free or occupied by own piece
                    const isStartOccupiedBySelf = room.players.some(p =>
                            p.id !== playerId && p.pieces.some(otherPiece =>
                                otherPiece.status === 'on_board' && otherPiece.position === playerConfig.startIndex && otherPiece.color === player.color
                            )
                    );
                    if (!isStartOccupiedBySelf) {
                        // Only allow exiting if the starting spot isn't blocked by an opponent
                        const occupiedByOpponent = room.players.some(p =>
                                p.id !== playerId && p.pieces.some(otherPiece =>
                                    otherPiece.status === 'on_board' && otherPiece.position === playerConfig.startIndex
                                )
                        );
                        if (!occupiedByOpponent) {
                            possibleMoves.push({
                                pieceId: piece.id,
                                newPosition: playerConfig.startIndex,
                                type: 'exit_hangar'
                            });
                        }
                    }
                }
            }
            // Règle 2: Déplacer un avion sur le plateau ou dans la zone finale
            else if (piece.status === 'on_board' || piece.status === 'final_path') {
                let currentPos = piece.position;
                let potentialNewPos = currentPos + diceValue;

                if (piece.status === 'on_board') {
                    // Calcul pour entrer dans la zone finale
                    // Total de cases sur le plateau principal avant sa zone d'arrivée
                    const totalMainPathCases = 52; // Ex: 0-51
                    const playerStartToSafeZone = (playerConfig.safeZoneStart - playerConfig.startIndex + totalMainPathCases) % totalMainPathCases;
                    const traveledOnMainPath = (currentPos - playerConfig.startIndex + totalMainPathCases) % totalMainPathCases;

                    if (traveledOnMainPath < playerStartToSafeZone && potentialNewPos >= playerConfig.safeZoneStart) {
                        // The piece is entering its final path
                        // Calculate position on the final path (100-105)
                        const remainingMove = potentialNewPos - playerConfig.safeZoneStart;
                        potentialNewPos = playerConfig.finalPathStart + remainingMove; // e.g., 100 + X
                        piece.status = 'final_path'; // Temporarily set status for calculation
                    } else if (traveledOnMainPath >= playerStartToSafeZone && piece.color === 'red') { // Simplified for red
                        // If already past or at safeZoneStart, they are definitely on their way to final path
                        // Or need to re-calculate their position relative to the main path's end and then into the final path
                        const relativePos = (currentPos - playerConfig.startIndex + totalMainPathCases) % totalMainPathCases;
                        if (relativePos >= 0 && relativePos < 52) { // Still on main path after their start index
                            potentialNewPos = currentPos + diceValue; // Still on main path
                            if (potentialNewPos >= 52) { // Past the main board for red
                                const finalPathIndex = potentialNewPos - 52; // 52 is the end of main board
                                potentialNewPos = playerConfig.finalPathStart + finalPathIndex;
                                piece.status = 'final_path';
                            }
                        }
                    } else if (piece.color !== 'red') { // For other colors, we need to handle their wraps
                        const mainPathEnd = playerConfig.startIndex - 1; // The cell just before their start on the circle
                        // Check if moving past the main path end for other colors
                        if (currentPos + diceValue > 51 && playerConfig.startIndex < currentPos) { // Crossed 51->0 boundary
                            potentialNewPos = (currentPos + diceValue) % 52;
                        }
                        if (potentialNewPos >= playerConfig.safeZoneStart && piece.status === 'on_board') {
                            const remainingMove = potentialNewPos - playerConfig.safeZoneStart;
                            potentialNewPos = playerConfig.finalPathStart + remainingMove;
                            piece.status = 'final_path';
                        }
                    }
                }

                // If piece is on final path, check for exact landing on final spot (105)
                if (piece.status === 'final_path') {
                    if (potentialNewPos === playerConfig.finalPathStart + 5) { // Exact landing on the last final path cell (105)
                        possibleMoves.push({ pieceId: piece.id, newPosition: 200, type: 'win_piece' }); // 200 signifies finished
                    } else if (potentialNewPos < playerConfig.finalPathStart + 5) { // Still on final path, not overshooting
                        possibleMoves.push({ pieceId: piece.id, newPosition: potentialNewPos, type: 'move' });
                    }
                    // If overshot, no move possible for this piece
                } else if (piece.status === 'on_board') {
                    // Check for general moves on the main board (0-51)
                    if (potentialNewPos < 52) {
                        possibleMoves.push({ pieceId: piece.id, newPosition: potentialNewPos, type: 'move' });
                    } else { // Wraps around the board
                        possibleMoves.push({ pieceId: piece.id, newPosition: potentialNewPos % 52, type: 'move' });
                    }
                }
            }
        });

        return possibleMoves;
    },

    /**
     * Applique le mouvement choisi par le joueur.
     * @param {Object} room L'objet de la salle.
     * @param {string} playerId L'ID du joueur.
     * @param {string} pieceId L'ID du pion à déplacer.
     * @param {number} newPosition La nouvelle position du pion.
     * @param {string} moveType Le type de mouvement ('exit_hangar', 'move', 'win_piece').
     */
    applyMove: (room, playerId, pieceId, newPosition, moveType) => {
        const player = room.players.find(p => p.id === playerId);
        const piece = player.pieces.find(p => p.id === pieceId);
        if (!piece) return;

        // Gérer les collisions si le pion arrive sur une case occupée par un adversaire
        if (newPosition >= 0 && newPosition < 52 || (newPosition >= 100 && newPosition < 105)) { // Check only main board and final path
            room.players.forEach(otherPlayer => {
                if (otherPlayer.id !== playerId) {
                    otherPlayer.pieces.forEach(otherPiece => {
                        if (otherPiece.status === 'on_board' && otherPiece.position === newPosition) {
                            // Si ce n'est pas une case "sûre" (si on implémente des cases sûres plus tard)
                            otherPiece.position = -1;
                            otherPiece.status = 'hangar';
                            console.log(`Pion ${otherPiece.id} (${otherPiece.color}) renvoyé au hangar par ${piece.id} (${piece.color})!`);
                        }
                    });
                }
            });
        }

        // Mettre à jour la position et le statut du pion
        piece.position = newPosition;
        if (moveType === 'exit_hangar') {
            piece.status = 'on_board';
        } else if (moveType === 'win_piece') {
            piece.status = 'finished';
            piece.position = 200; // Marque comme arrivé
            console.log(`Pion ${piece.id} (${piece.color}) a atteint l'arrivée !`);
        } else if (piece.position >= playerConfigs[player.color].finalPathStart) {
            piece.status = 'final_path';
        } else if (piece.position !== -1) {
            piece.status = 'on_board';
        }

        // Mettre à jour boardState (mapping position -> pieces)
        // Ceci est une simplification. Dans un vrai jeu, boardState serait une structure plus complexe
        // représentant toutes les cases du plateau.
        room.boardState = {};
        room.players.forEach(p => {
            p.pieces.forEach(pc => {
                if (pc.status === 'on_board' || pc.status === 'final_path') {
                    if (!room.boardState[pc.position]) {
                        room.boardState[pc.position] = [];
                    }
                    room.boardState[pc.position].push(pc.id);
                }
            });
        });

        // Vérifier si le joueur a gagné (4 pions à l'arrivée)
        const hasWon = player.pieces.every(p => p.status === 'finished');
        if (hasWon) {
            room.gameStatus = 'finished';
            room.winner = playerId;
            console.log(`Joueur ${player.name} (${player.id}) a gagné la partie dans la salle ${room.id}!`);
            io.to(room.id).emit('game_over', { winnerId: playerId, winnerName: player.name });
        }
    },

    // Cette fonction sera appelée après un jet de dé
    // Elle ne déplace plus les pions directement, mais détermine les mouvements possibles
    // et attend une 'make_move' du client.
    applyDiceRoll: (roomId, playerId, diceValue) => {
        const room = rooms[roomId];
        if (!room) return;

        // Réinitialiser le compteur de 6 si ce n'est pas un 6
        if (diceValue !== 6) {
            room.diceRollCount[playerId] = 0;
        } else {
            room.diceRollCount[playerId] = (room.diceRollCount[playerId] || 0) + 1;
        }

        const possibleMoves = gameLogic.getPossibleMoves(room, playerId, diceValue);
        console.log(`Joueur ${playerId} a lancé ${diceValue}. Mouvements possibles:`, possibleMoves);

        if (possibleMoves.length > 0) {
            // Envoyer les mouvements possibles au client pour qu'il choisisse
            io.to(playerId).emit('possible_moves', { diceValue, possibleMoves });
        } else {
            // Pas de mouvement possible, passer le tour
            console.log(`Pas de mouvements possibles pour ${playerId} avec ${diceValue}. Passage du tour.`);
            room.diceRollCount[playerId] = 0; // Reset 6-count if no moves
            gameLogic.passTurn(room);
        }
        io.to(roomId).emit('game_state_update', { roomId, gameState: room });
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

        // Attribue la première couleur disponible
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
            socket.join(roomId);
            socket.emit('room_joined', { success: true, roomId, players: room.players });
            io.to(roomId).emit('game_state_update', { roomId, gameState: room });
            return;
        }

        // Attribue la prochaine couleur disponible
        const playerColor = availableColors[room.players.length];
        const newPlayer = { id: socket.id, name: playerName, color: playerColor, pieces: initializePieces(socket.id, playerColor) };

        room.players.push(newPlayer);
        socket.join(roomId);

        socket.emit('room_joined', { success: true, roomId, players: room.players });
        io.to(roomId).emit('player_joined', { playerName, playerId: socket.id, playerColor });
        io.to(roomId).emit('game_state_update', { roomId, gameState: room });
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

        // Initialiser l'état du plateau avec tous les pions dans les hangars et mettre à jour boardState
        room.boardState = {}; // Réinitialise pour les pions qui ne sont pas sur le plateau
        room.players.forEach(player => {
            player.pieces.forEach(piece => {
                if (piece.status === 'on_board' || piece.status === 'final_path') {
                    if (!room.boardState[piece.position]) {
                        room.boardState[piece.position] = [];
                    }
                    room.boardState[piece.position].push(piece.id);
                }
            });
        });


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
            socket.emit('error', { message: 'La salle n\'existe pas.' });
            return;
        }
        if (room.gameStatus !== 'playing') {
            socket.emit('error', { message: 'La partie n\'a pas encore commencé.' });
            return;
        }
        if (room.currentPlayer !== socket.id) {
            socket.emit('error', { message: 'Ce n\'est pas votre tour.' });
            return;
        }

        const diceValue = 6;
        io.to(roomId).emit('dice_rolled', { playerId: socket.id, diceValue });
        console.log(`[ROLL_DICE_SUCCESS] Salle ${roomId}: ${socket.id} a lancé le dé et a obtenu ${diceValue}.`);

        // La fonction `applyDiceRoll` détermine maintenant les mouvements possibles
        // et émet 'possible_moves' au client si nécessaire.
        gameLogic.applyDiceRoll(roomId, socket.id, diceValue);
    });

    // Gérer le mouvement d'un pion choisi par le joueur
    socket.on('make_move', ({ roomId, pieceId, newPosition, moveType }) => {
        console.log(`[MAKE_MOVE_ATTEMPT] Joueur ${socket.id} tente de déplacer le pion ${pieceId} vers ${newPosition} dans la salle ${roomId}.`);
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', { message: 'La salle n\'existe pas.' });
            return;
        }
        if (room.gameStatus !== 'playing' || room.currentPlayer !== socket.id) {
            socket.emit('error', { message: 'Impossible de faire un mouvement maintenant.' });
            return;
        }

        // Appliquer le mouvement
        gameLogic.applyMove(room, socket.id, pieceId, newPosition, moveType);

        // Si le joueur a fait un 6, il rejoue (sauf 3x 6 consécutifs, géré dans applyDiceRoll)
        const lastDiceRoll = room.lastDiceRoll; // Supposez que vous stockez le dernier jet de dé dans la salle
        // Pour l'instant, on va simplement passer le tour après chaque mouvement
        if (lastDiceRoll !== 6 || (room.diceRollCount[socket.id] >= 3 && lastDiceRoll === 6)) {
            gameLogic.passTurn(room);
        } else {
            console.log(`Joueur ${socket.id} a fait un 6 et peut rejouer.`);
        }


        // Émettre la mise à jour de l'état du jeu à tous les clients de la salle
        io.to(roomId).emit('game_state_update', { roomId, gameState: room });
        console.log(`[MAKE_MOVE_SUCCESS] Mouvement effectué dans la salle ${roomId}.`);
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