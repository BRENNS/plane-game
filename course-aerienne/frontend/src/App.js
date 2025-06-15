import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// Connexion au serveur Socket.IO réel
const socket = io('http://localhost:4000');

function App() {
  const [currentRoomId, setCurrentRoomId] = useState(''); // Room ID actuelle (une fois connecté)
  const [roomInputValue, setRoomInputValue] = useState(''); // Valeur de l'input pour rejoindre
  const [playerName, setPlayerName] = useState('');
  const [messages, setMessages] = useState([]);
  const [diceValue, setDiceValue] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Gestion de la connexion
    socket.on('connect', () => {
      console.log('Connecté au serveur Socket.IO avec l\'ID:', socket.id);
      setIsConnected(true);
      setMessages(prev => [...prev, 'Connecté au serveur.']);
    });

    socket.on('disconnect', () => {
      console.log('Déconnecté du serveur Socket.IO');
      setIsConnected(false);
      setMessages(prev => [...prev, 'Déconnecté du serveur.']);
    });

    // Gestion de la création de salle
    socket.on('room_created', ({ roomId }) => {
      console.log('Salle créée:', roomId);
      setCurrentRoomId(roomId);
      setIsCreator(true);
      setMessages(prev => [...prev, `Salle créée : ${roomId}. Partagez ce code avec vos amis.`]);
    });

    // Gestion du join de salle
    socket.on('room_joined', ({ success, message, roomId, players }) => {
      console.log('Réponse join_room:', { success, message, roomId, players });
      if (success) {
        setCurrentRoomId(roomId);
        setMessages(prev => [...prev, `Vous avez rejoint la salle ${roomId}.`]);
        // Le gameState sera mis à jour via game_state_update
      } else {
        setMessages(prev => [...prev, `Erreur lors du join: ${message}`]);
      }
    });

    // Notification quand un joueur rejoint
    socket.on('player_joined', ({ playerName, playerId, playerColor }) => {
      setMessages(prev => [...prev, `${playerName} (${playerColor}) a rejoint la salle.`]);
    });

    // Notification quand un joueur quitte
    socket.on('player_left', ({ playerName, playerId }) => {
      setMessages(prev => [...prev, `${playerName} a quitté la salle.`]);
    });

    // Début de partie
    socket.on('game_started', ({ firstPlayerId, turnOrder }) => {
      const firstPlayerName = gameState?.players?.find(p => p.id === firstPlayerId)?.name || firstPlayerId;
      setMessages(prev => [...prev, `La partie a commencé ! C'est le tour de ${firstPlayerId === socket.id ? 'VOUS' : firstPlayerName}.`]);
    });

    // Mise à jour de l'état du jeu
    socket.on('game_state_update', ({ roomId, gameState }) => {
      console.log('Mise à jour de l\'état du jeu:', gameState);
      setGameState(gameState);
      setIsCreator(gameState.creatorId === socket.id);
    });

    // Résultat du lancer de dé
    socket.on('dice_rolled', ({ playerId, diceValue }) => {
      const playerName = gameState?.players?.find(p => p.id === playerId)?.name || playerId;
      setMessages(prev => [...prev, `${playerId === socket.id ? 'Vous avez' : `${playerName} a`} lancé le dé : ${diceValue}`]);
      setDiceValue(diceValue);
    });

    // Gestion des erreurs
    socket.on('error', ({ message }) => {
      console.error('Erreur du serveur:', message);
      setMessages(prev => [...prev, `Erreur du serveur: ${message}`]);
    });

    // Nettoyage lors du démontage du composant
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('game_started');
      socket.off('game_state_update');
      socket.off('dice_rolled');
      socket.off('error');
    };
  }, [gameState]); // Ajout de gameState comme dépendance pour les noms des joueurs

  const handleCreateRoom = () => {
    if (!isConnected) {
      setMessages(prev => [...prev, "Connexion au serveur en cours..."]);
      return;
    }

    if (playerName.trim()) {
      console.log('Création de salle pour:', playerName);
      socket.emit('create_room', { playerName: playerName.trim() });
    } else {
      setMessages(prev => [...prev, "Veuillez entrer votre nom."]);
    }
  };

  const handleJoinRoom = () => {
    if (!isConnected) {
      setMessages(prev => [...prev, "Connexion au serveur en cours..."]);
      return;
    }

    const roomCode = roomInputValue.trim().toUpperCase();
    const name = playerName.trim();

    console.log('Tentative de rejoindre avec:', { roomId: roomCode, playerName: name });

    if (roomCode && name) {
      console.log("Envoi de join_room au serveur:", { roomId: roomCode, playerName: name });
      socket.emit('join_room', { roomId: roomCode, playerName: name });
    } else {
      setMessages(prev => [...prev, "Veuillez entrer le code de la salle et votre nom."]);
    }
  };

  const handleStartGame = () => {
    if (gameState && gameState.creatorId === socket.id) {
      console.log('Démarrage de la partie pour la salle:', gameState.id);
      socket.emit('start_game', { roomId: gameState.id });
    } else {
      setMessages(prev => [...prev, "Vous n'êtes pas le créateur de la salle ou la partie ne peut pas être démarrée."]);
    }
  };

  const handleRollDice = () => {
    if (gameState && gameState.gameStatus === 'playing' && gameState.currentPlayer === socket.id) {
      console.log('Lancer de dé pour la salle:', gameState.id);
      socket.emit('roll_dice', { roomId: gameState.id });
    } else {
      setMessages(prev => [...prev, "Ce n'est pas votre tour ou la partie n'a pas commencé."]);
    }
  };

  const handleLeaveRoom = () => {
    // Réinitialiser l'état local
    setCurrentRoomId('');
    setRoomInputValue('');
    setGameState(null);
    setIsCreator(false);
    setDiceValue(null);
    setMessages(prev => [...prev, "Vous avez quitté la salle."]);

    // Le serveur gérera automatiquement la déconnexion via l'événement disconnect
    // Si vous voulez implémenter un leave explicite, vous pouvez ajouter un événement 'leave_room'
  };

  const renderPlayerList = () => {
    if (!gameState || !gameState.players) return null;

    return (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {gameState.players.map(player => (
              <li key={player.id} style={{
                color: player.color,
                padding: '5px 0',
                fontWeight: player.id === socket.id ? 'bold' : 'normal'
              }}>
                {player.name} {player.id === socket.id ? '(Moi)' : ''}
                {player.id === gameState.creatorId ? ' (Créateur)' : ''}
                {gameState.gameStatus === 'playing' && player.id === gameState.currentPlayer ? ' (Tour actuel)' : ''}
                <br />
                <small>
                  ({player.pieces.filter(p => p.status === 'hangar').length} en hangar, {' '}
                  {player.pieces.filter(p => p.status === 'on_board').length} sur plateau, {' '}
                  {player.pieces.filter(p => p.status === 'finished').length} arrivés)
                </small>
              </li>
          ))}
        </ul>
    );
  };

  const renderConnectionStatus = () => {
    return (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          padding: '5px 10px',
          borderRadius: '5px',
          backgroundColor: isConnected ? '#4CAF50' : '#f44336',
          color: 'white',
          fontSize: '0.8em'
        }}>
          {isConnected ? 'Connecté' : 'Déconnecté'}
        </div>
    );
  };

  return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        {renderConnectionStatus()}

        <h1>Course Aérienne</h1>

        {!currentRoomId && (
            <div style={{ marginBottom: '20px', border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
              <h3>Rejoindre ou Créer une Salle</h3>

              <div style={{ marginBottom: '15px' }}>
                <input
                    type="text"
                    placeholder="Votre nom"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    style={{
                      marginRight: '10px',
                      padding: '8px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      minWidth: '200px'
                    }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <button
                    onClick={handleCreateRoom}
                    disabled={!playerName.trim() || !isConnected}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: (!playerName.trim() || !isConnected) ? '#ccc' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: (!playerName.trim() || !isConnected) ? 'not-allowed' : 'pointer'
                    }}
                >
                  Créer une salle
                </button>
              </div>

              <p style={{ margin: '10px 0 5px 0', textAlign: 'center', fontWeight: 'bold' }}>OU</p>

              <div>
                <input
                    type="text"
                    placeholder="Code de la salle (ex: ABC123)"
                    value={roomInputValue}
                    onChange={(e) => setRoomInputValue(e.target.value.toUpperCase())}
                    style={{
                      marginRight: '10px',
                      padding: '8px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      minWidth: '200px'
                    }}
                />
                <button
                    onClick={handleJoinRoom}
                    disabled={!roomInputValue.trim() || !playerName.trim() || !isConnected}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: (!roomInputValue.trim() || !playerName.trim() || !isConnected) ? '#ccc' : '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: (!roomInputValue.trim() || !playerName.trim() || !isConnected) ? 'not-allowed' : 'pointer'
                    }}
                >
                  Rejoindre une salle
                </button>
              </div>
            </div>
        )}

        {currentRoomId && gameState && (
            <div style={{ marginBottom: '20px', border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Salle : <span style={{ color: '#007bff' }}>{gameState.id}</span></h2>
                <button
                    onClick={handleLeaveRoom}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8em'
                    }}
                >
                  Quitter la salle
                </button>
              </div>

              <h3>Statut: {gameState.gameStatus === 'waiting' ? 'En attente de joueurs...' : 'En jeu'}</h3>

              {renderPlayerList()}

              {gameState.gameStatus === 'waiting' && isCreator && gameState.players.length >= 2 && (
                  <button
                      onClick={handleStartGame}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#FF9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginTop: '15px'
                      }}
                  >
                    Démarrer la partie ({gameState.players.length}/4 joueurs)
                  </button>
              )}

              {gameState.gameStatus === 'waiting' && !isCreator && (
                  <p style={{ fontStyle: 'italic', color: '#666' }}>
                    En attente du créateur de la salle pour démarrer la partie...
                  </p>
              )}

              {gameState.gameStatus === 'waiting' && gameState.players.length < 2 && (
                  <p style={{ fontStyle: 'italic', color: '#666' }}>
                    En attente d'au moins 2 joueurs pour démarrer la partie...
                  </p>
              )}

              {gameState.gameStatus === 'playing' && (
                  <div style={{ marginTop: '20px' }}>
                    <button
                        onClick={handleRollDice}
                        disabled={gameState.currentPlayer !== socket.id}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: gameState.currentPlayer === socket.id ? '#673AB7' : '#9E9E9E',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: gameState.currentPlayer === socket.id ? 'pointer' : 'not-allowed'
                        }}
                    >
                      {gameState.currentPlayer === socket.id ? 'Lancer le dé' : 'Pas votre tour'}
                    </button>

                    {diceValue && (
                        <p style={{ marginTop: '10px' }}>
                          Dernier jet de dé : <strong style={{ fontSize: '1.2em', color: '#673AB7' }}>{diceValue}</strong>
                        </p>
                    )}

                    <div style={{
                      marginTop: '20px',
                      border: '2px dashed #ccc',
                      minHeight: '200px',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      padding: '10px',
                      color: '#666'
                    }}>
                      <p style={{ width: '100%', textAlign: 'center', margin: '0 0 20px 0' }}>
                        Plateau de jeu à implémenter ici
                      </p>

                      {gameState.players.map(player => (
                          <div key={player.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            margin: '0 10px 10px 0',
                            border: `1px solid ${player.color}`,
                            borderRadius: '5px',
                            padding: '10px',
                            backgroundColor: '#f9f9f9'
                          }}>
                            <h4 style={{ color: player.color, margin: '0 0 10px 0' }}>
                              Pions de {player.name}
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                              {player.pieces.map(piece => (
                                  <span key={piece.id} style={{
                                    display: 'inline-block',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    backgroundColor: piece.color,
                                    border: piece.status === 'on_board' ? '2px solid black' : '1px dashed grey',
                                    opacity: piece.status === 'finished' ? 0.5 : 1,
                                    margin: '2px',
                                    textAlign: 'center',
                                    lineHeight: '20px',
                                    fontSize: '0.7em',
                                    color: 'white',
                                    fontWeight: 'bold'
                                  }}>
                                    {piece.status === 'hangar' ? 'H' : (piece.status === 'finished' ? 'F' : piece.position)}
                                  </span>
                              ))}
                            </div>
                          </div>
                      ))}
                    </div>
                  </div>
              )}
            </div>
        )}

        <h3>Messages système :</h3>
        <div style={{
          border: '1px solid #ccc',
          height: '150px',
          overflowY: 'scroll',
          padding: '10px',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px'
        }}>
          {messages.length === 0 ? (
              <p style={{ margin: 0, color: '#666', fontStyle: 'italic' }}>Aucun message pour le moment...</p>
          ) : (
              messages.map((msg, index) => (
                  <p key={index} style={{ margin: '3px 0', fontSize: '0.9em' }}>{msg}</p>
              ))
          )}
        </div>
      </div>
  );
}

export default App;