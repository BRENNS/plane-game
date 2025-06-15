import React from 'react';

const Gameboard = ({ gameState, possibleMoves, onPieceClick }) => {
    if (!gameState || !gameState.players) return null;

    // Configuration du plateau
    const BOARD_SIZE = 500;
    const CENTER_SIZE = 200;
    const CELL_SIZE = 25;
    const HANGAR_SIZE = 80;

    // Positions des cases sur le plateau principal (52 cases en cercle)
    const getMainPathPosition = (index) => {
        const centerX = BOARD_SIZE / 2;
        const centerY = BOARD_SIZE / 2;
        const radius = (BOARD_SIZE - CENTER_SIZE) / 2 - CELL_SIZE;
        const angle = (index / 52) * 2 * Math.PI - Math.PI / 2; // Commence en haut

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        };
    };

    // Positions des hangars pour chaque couleur
    const getHangarPosition = (color, pieceIndex) => {
        const positions = {
            red: { x: 50, y: 50 },
            blue: { x: BOARD_SIZE - 130, y: 50 },
            green: { x: BOARD_SIZE - 130, y: BOARD_SIZE - 130 },
            yellow: { x: 50, y: BOARD_SIZE - 130 }
        };

        const base = positions[color];
        const row = Math.floor(pieceIndex / 2);
        const col = pieceIndex % 2;

        return {
            x: base.x + col * 30,
            y: base.y + row * 30
        };
    };

    // Positions des pistes finales
    const getFinalPathPosition = (color, position) => {
        const centerX = BOARD_SIZE / 2;
        const centerY = BOARD_SIZE / 2;
        const finalIndex = position - 100; // 100-105 devient 0-5

        const directions = {
            red: { dx: 0, dy: -1, startAngle: -Math.PI / 2 },
            blue: { dx: 1, dy: 0, startAngle: 0 },
            green: { dx: 0, dy: 1, startAngle: Math.PI / 2 },
            yellow: { dx: -1, dy: 0, startAngle: Math.PI }
        };

        const dir = directions[color];
        const distance = 30 + finalIndex * 25;

        return {
            x: centerX + dir.dx * distance,
            y: centerY + dir.dy * distance
        };
    };

    // Obtenir la position d'un pion
    const getPiecePosition = (piece, pieceIndex) => {
        if (piece.status === 'hangar') {
            return getHangarPosition(piece.color, pieceIndex);
        } else if (piece.status === 'on_board') {
            return getMainPathPosition(piece.position);
        } else if (piece.status === 'final_path') {
            return getFinalPathPosition(piece.color, piece.position);
        } else if (piece.status === 'finished') {
            // Position finale au centre
            const centerX = BOARD_SIZE / 2;
            const centerY = BOARD_SIZE / 2;
            return {
                x: centerX + (pieceIndex - 1.5) * 15,
                y: centerY + (piece.color === 'red' ? -20 : piece.color === 'blue' ? 0 : piece.color === 'green' ? 20 : -40)
            };
        }
    };

    // Vérifier si un pion peut être cliqué
    const isPieceClickable = (pieceId) => {
        return possibleMoves.some(move => move.pieceId === pieceId);
    };

    // Rendu des cases du plateau principal
    const renderMainPath = () => {
        const cells = [];
        for (let i = 0; i < 52; i++) {
            const pos = getMainPathPosition(i);
            const isStartingCell = [0, 13, 26, 39].includes(i);

            cells.push(
                <circle
                    key={`cell-${i}`}
                    cx={pos.x}
                    cy={pos.y}
                    r={CELL_SIZE / 2}
                    fill={isStartingCell ? '#ffeb3b' : '#e0e0e0'}
                    stroke={isStartingCell ? '#f57f17' : '#bdbdbd'}
                    strokeWidth="2"
                />
            );

            // Numéro de la case
            cells.push(
                <text
                    key={`cell-text-${i}`}
                    x={pos.x}
                    y={pos.y + 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#333"
                    fontWeight="bold"
                >
                    {i}
                </text>
            );
        }
        return cells;
    };

    // Rendu des hangars
    const renderHangars = () => {
        const hangars = [];
        const colors = ['red', 'blue', 'green', 'yellow'];

        colors.forEach(color => {
            const pos = getHangarPosition(color, 0);
            hangars.push(
                <g key={`hangar-${color}`}>
                    <rect
                        x={pos.x - 10}
                        y={pos.y - 10}
                        width={HANGAR_SIZE}
                        height={HANGAR_SIZE}
                        fill={color}
                        fillOpacity="0.2"
                        stroke={color}
                        strokeWidth="3"
                        rx="10"
                    />
                    <text
                        x={pos.x + HANGAR_SIZE / 2 - 10}
                        y={pos.y - 15}
                        textAnchor="middle"
                        fontSize="12"
                        fill={color}
                        fontWeight="bold"
                    >
                        HANGAR
                    </text>
                </g>
            );
        });

        return hangars;
    };

    // Rendu des pistes finales
    const renderFinalPaths = () => {
        const paths = [];
        const colors = ['red', 'blue', 'green', 'yellow'];

        colors.forEach(color => {
            for (let i = 0; i < 6; i++) {
                const pos = getFinalPathPosition(color, 100 + i);
                paths.push(
                    <circle
                        key={`final-${color}-${i}`}
                        cx={pos.x}
                        cy={pos.y}
                        r={CELL_SIZE / 2 - 2}
                        fill={i === 5 ? color : '#fff'}
                        stroke={color}
                        strokeWidth="2"
                        fillOpacity={i === 5 ? "0.8" : "0.3"}
                    />
                );

                if (i === 5) {
                    paths.push(
                        <text
                            key={`final-text-${color}-${i}`}
                            x={pos.x}
                            y={pos.y + 4}
                            textAnchor="middle"
                            fontSize="10"
                            fill="white"
                            fontWeight="bold"
                        >
                            ★
                        </text>
                    );
                }
            }
        });

        return paths;
    };

    // Rendu des pions
    const renderPieces = () => {
        const pieces = [];

        gameState.players.forEach(player => {
            player.pieces.forEach((piece, pieceIndex) => {
                const pos = getPiecePosition(piece, pieceIndex);
                if (!pos) return;

                const isClickable = isPieceClickable(piece.id);
                const isFinished = piece.status === 'finished';

                pieces.push(
                    <g key={piece.id}>
                        {/* Halo pour les pions sélectionnables */}
                        {isClickable && (
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={15}
                                fill="gold"
                                fillOpacity="0.3"
                                stroke="gold"
                                strokeWidth="2"
                                className="piece-glow"
                            >
                                <animate
                                    attributeName="r"
                                    values="15;18;15"
                                    dur="1s"
                                    repeatCount="indefinite"
                                />
                            </circle>
                        )}

                        {/* Pion */}
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={8}
                            fill={piece.color}
                            stroke="#000"
                            strokeWidth="1"
                            opacity={isFinished ? 0.7 : 1}
                            style={{
                                cursor: isClickable ? 'pointer' : 'default',
                                filter: isClickable ? 'drop-shadow(0 0 3px gold)' : 'none'
                            }}
                            onClick={() => isClickable && onPieceClick && onPieceClick(piece.id)}
                        />

                        {/* Numéro du pion */}
                        <text
                            x={pos.x}
                            y={pos.y + 3}
                            textAnchor="middle"
                            fontSize="8"
                            fill="white"
                            fontWeight="bold"
                            style={{ pointerEvents: 'none' }}
                        >
                            {piece.id.split('-').pop()}
                        </text>

                        {/* Couronne pour les pions arrivés */}
                        {isFinished && (
                            <text
                                x={pos.x}
                                y={pos.y - 15}
                                textAnchor="middle"
                                fontSize="12"
                                fill="gold"
                            >
                                👑
                            </text>
                        )}
                    </g>
                );
            });
        });

        return pieces;
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
            backgroundColor: '#f5f5f5',
            borderRadius: '10px',
            margin: '20px 0'
        }}>
            <svg
                width={BOARD_SIZE}
                height={BOARD_SIZE}
                style={{
                    border: '3px solid #333',
                    borderRadius: '10px',
                    backgroundColor: '#fff'
                }}
            >
                {/* Zone centrale */}
                <rect
                    x={(BOARD_SIZE - CENTER_SIZE) / 2}
                    y={(BOARD_SIZE - CENTER_SIZE) / 2}
                    width={CENTER_SIZE}
                    height={CENTER_SIZE}
                    fill="#e8f5e8"
                    stroke="#4caf50"
                    strokeWidth="2"
                    rx="20"
                />

                <text
                    x={BOARD_SIZE / 2}
                    y={BOARD_SIZE / 2}
                    textAnchor="middle"
                    fontSize="16"
                    fill="#2e7d32"
                    fontWeight="bold"
                >
                    ARRIVÉE
                </text>

                {/* Plateau principal */}
                {renderMainPath()}

                {/* Hangars */}
                {renderHangars()}

                {/* Pistes finales */}
                {renderFinalPaths()}

                {/* Pions */}
                {renderPieces()}
            </svg>
        </div>
    );
};

export default Gameboard;