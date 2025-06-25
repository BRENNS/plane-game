# Course Aérienne - Plane Game

## Introduction

Course Aérienne is a multiplayer board game where players race their planes around a track, aiming to be the first to get all their pieces to the finish. The game is played online, with real-time interaction between players.

## How to Play

### 1. Getting Started

*   **Access the Game:** Open your web browser and go to `http://localhost:3000`. This is the default address when running the frontend locally.
*   **Create or Join a Room:**
    *   To start a new game, enter your name and click "Créer une salle". This will generate a unique room code. Share this code with your friends.
    *   To join an existing game, enter your name and the room code provided by the game's creator, then click "Rejoindre une salle".

### 2. Game Setup

*   **Waiting Lobby:** After creating or joining a room, you'll enter a waiting lobby. Here, you'll see a list of players who have joined the room.
*   **Starting the Game:** The creator of the room can start the game once at least two players have joined by clicking the "Démarrer la partie" button.

### 3. Gameplay

*   **Rolling the Dice:** When it's your turn, click the "Lancer le dé" button. A dice value of 6 is automatically rolled.
*   **Moving Pieces:**
    *   Based on the dice value, you may have possible moves. These will be highlighted on the game board.
    *   Click on a highlighted piece to make your move.
    *   If you roll a 6, you get another turn!

### 4. Game Objective

The objective is to be the first player to move all four of your pieces from their starting hangar to the finish area.

### 5. Game Pieces and Movement

*   **Starting Hangar:** Each player has a set of four pieces, initially located in their hangar.
*   **Exiting the Hangar:** A piece can only exit the hangar when a player rolls a 6.
*   **Moving Around the Board:** Pieces move around the main board according to the dice roll.
*   **Final Path:** After a certain point on the main board, pieces can enter their final path. Pieces in the final path must land exactly on the final spot to win.
*   **Capturing Opponent Pieces:** If your piece lands on a space occupied by an opponent's piece, the opponent's piece is sent back to its hangar.

### 6. Winning the Game

The first player to get all four of their pieces to the final area wins the game!

### 7. UI Information

*   Connection Status: An indicator at the top-right corner of the page displays the connection status to the server.
*   Turn Indication: The current player's name is displayed in bold within the player list.
*   Room Creator: The player who created the room is marked as the "Créateur".
*   Current Turn: During gameplay, the player whose turn it is will be identified as "(Tour actuel)".

## Getting Started (Development)

To run the game locally, you need to start both the backend server and the frontend React application.

### Prerequisites

Make sure you have Node.js and npm installed on your system.

### Backend Setup

1.  Navigate to the `course-aerienne/backend/` directory.

    ```bash
    cd course-aerienne/backend/
    ```
2.  Install the dependencies:

    ```bash
    npm install
    ```
3.  Start the server:

    ```bash
    npm start
    ```
    *   This will start the backend server using `nodemon`, which monitors for any file changes. The server listens on port 4000, as configured in [backend/server.js](https://github.com/BRENNS/plane-game/blob/main/course-aerienne/backend/server.js):

        ```javascript
        const PORT = process.env.PORT || 4000;

        server.listen(PORT, () => {
            console.log(`Serveur Socket.IO écoutant sur le port ${PORT}`);
        });
        ```

### Frontend Setup

1.  Navigate to the `course-aerienne/frontend/` directory.

    ```bash
    cd ../frontend/
    ```
2.  Install the dependencies:

    ```bash
    npm install
    ```
3.  Start the React application:

    ```bash
    npm start
    ```
    *   This starts the React development server, and the game should be accessible at `http://localhost:3000` in your web browser. The relevant script is defined in [frontend/package.json](https://github.com/BRENNS/plane-game/blob/main/course-aerienne/frontend/package.json):

        ```json
        "scripts": {
          "start": "react-scripts start",
          "build": "react-scripts build",
          "test": "react-scripts test",
          "eject": "react-scripts eject"
        },
        ```

These commands ensure that both the backend server and frontend React application are up and running, allowing players to connect and start the game.

## Architecture

The game follows a client-server architecture where the backend (Node.js with Socket.IO) manages the game state and logic, and the frontend (React) handles the user interface and interactions.

Key components include:

*   **Backend (`backend/server.js`):** Manages rooms, player turns, game state, and emits updates via Socket.IO.
*   **Frontend (`frontend/src/App.js`):** Handles user input, renders the UI, and communicates with the backend via Socket.IO.
*   **Gameboard (`frontend/src/Gameboard.js`):** Renders the game board and manages piece movements on the frontend.

The following sequence diagram illustrates the interaction flow:

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    F->>B: create_room (playerName)
    B->>F: room_created (roomId)
    F->>B: join_room (roomId, playerName)
    B->>F: room_joined (success, roomId, players)
    F->>B: start_game (roomId)
    B->>F: game_started (roomId, firstPlayerId, turnOrder)
    loop Game Turn
        F->>B: roll_dice (roomId)
        B->>F: dice_rolled (playerId, diceValue)
        B->>F: possible_moves (diceValue, possibleMoves)
        F->>B: make_move (roomId, pieceId, newPosition, moveType)
        B->>F: game_state_update (roomId, gameState)
    end
    B->>F: game_over (winnerId, winnerName)
