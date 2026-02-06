import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCubeStore } from '../stores/useCubeStore';
import { KOCIEMBA_FACE_ORDER, FACE_NAMES, COLOR_HEX, DEFAULT_CENTER_MAP } from '../lib/constants';
import RubiksCube from './RubiksCube';
import { generateCubies, assignColorsFromFaces } from '../lib/cubeModel';
import type { CubeColor, FaceName, StickerColor } from '../types/cube';

const COLORS: CubeColor[] = ['R', 'O', 'Y', 'G', 'B', 'W'];

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export default function ManualEditor({ onComplete, onBack }: Props) {
  const faces = useCubeStore((s) => s.faces);
  const scannedCount = useCubeStore((s) => s.scannedCount);
  const addScannedFace = useCubeStore((s) => s.addScannedFace);
  const removeFace = useCubeStore((s) => s.removeFace);
  const isComplete = useCubeStore((s) => s.isComplete);
  const isValid = useCubeStore((s) => s.isValid);
  const errors = useCubeStore((s) => s.errors);
  
  // Get first unscanned face
  const getNextFace = (): FaceName => {
    for (const faceName of KOCIEMBA_FACE_ORDER) {
      if (!faces[faceName]) return faceName;
    }
    return 'U'; // fallback
  };

  const [currentFace, setCurrentFace] = useState<FaceName>(getNextFace());
  const [stickers, setStickers] = useState<CubeColor[]>(() => {
    const face = faces[currentFace];
    if (face) {
      return face.stickers.map(s => s.color);
    }
    // Default: center is the expected color for this face
    const expectedCenter = Object.entries(DEFAULT_CENTER_MAP).find(
      ([, fn]) => fn === currentFace
    )?.[0] as CubeColor || 'W';
    return Array(9).fill(expectedCenter);
  });

  const cycleColor = (index: number) => {
    setStickers(prev => {
      const newStickers = [...prev];
      const currentColorIndex = COLORS.indexOf(prev[index]);
      newStickers[index] = COLORS[(currentColorIndex + 1) % COLORS.length];
      return newStickers;
    });
  };

  const saveFace = () => {
    const stickerData: StickerColor[] = stickers.map(color => ({
      color,
      rgb: [0, 0, 0],
      hsv: [0, 0, 0],
    }));

    // Remove existing face first if editing
    if (faces[currentFace]) {
      removeFace(currentFace);
    }

    addScannedFace(stickerData);

    // Move to next unscanned face or complete
    const nextFace = getNextFace();
    if (nextFace !== currentFace) {
      setCurrentFace(nextFace);
      // Set default colors for next face
      const expectedCenter = Object.entries(DEFAULT_CENTER_MAP).find(
        ([, fn]) => fn === nextFace
      )?.[0] as CubeColor || 'W';
      setStickers(Array(9).fill(expectedCenter));
    }
  };

  const switchToFace = (faceName: FaceName) => {
    setCurrentFace(faceName);
    const face = faces[faceName];
    if (face) {
      setStickers(face.stickers.map(s => s.color));
    } else {
      const expectedCenter = Object.entries(DEFAULT_CENTER_MAP).find(
        ([, fn]) => fn === faceName
      )?.[0] as CubeColor || 'W';
      setStickers(Array(9).fill(expectedCenter));
    }
  };

  const canSave = () => {
    // Check if center color is not already used by another face
    const centerColor = stickers[4];
    const scannedCenters = Object.values(faces)
      .filter(f => f.name !== currentFace)
      .map(f => f.stickers[4].color);
    return !scannedCenters.includes(centerColor);
  };

  return (
    <div className="manual-editor">
      <div className="manual-header">
        <button onClick={onBack} className="back-btn">← Back</button>
        <h2>Manual Color Entry</h2>
        <div className="face-count">{scannedCount}/6</div>
      </div>

      <div className="manual-content">
        <div className="face-selector">
          {KOCIEMBA_FACE_ORDER.map((faceName) => (
            <button
              key={faceName}
              className={`face-tab ${currentFace === faceName ? 'active' : ''} ${faces[faceName] ? 'complete' : ''}`}
              onClick={() => switchToFace(faceName)}
            >
              {FACE_NAMES[faceName]}
              {faces[faceName] && ' ✓'}
            </button>
          ))}
        </div>

        <div className="editor-3d-preview">
          <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 8, 5]} intensity={0.8} />
            <directionalLight position={[-3, -4, -5]} intensity={0.3} />
            <RubiksCube 
              cubies={(() => {
                const base = generateCubies();
                return assignColorsFromFaces(base, faces);
              })()}
            />
            <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
          </Canvas>
        </div>

        <div className="editor-grid-container">
          <div className="current-face-label">
            {FACE_NAMES[currentFace]} Face
          </div>
          <div className="editor-grid">
            {stickers.map((color, i) => (
              <button
                key={i}
                className="editor-sticker"
                style={{ backgroundColor: COLOR_HEX[color] }}
                onClick={() => cycleColor(i)}
                title={`Click to change (${color})`}
              >
                {i === 4 && <span className="center-marker">●</span>}
              </button>
            ))}
          </div>
          <div className="editor-hint">
            💡 Click any sticker to cycle through colors
          </div>
        </div>

        <div className="editor-actions">
          {!canSave() && (
            <div className="error-message">
              ⚠️ Center color {stickers[4]} is already used
            </div>
          )}
          <button
            onClick={saveFace}
            disabled={!canSave()}
            className="save-btn"
          >
            {faces[currentFace] ? '💾 Update Face' : '✓ Save Face'}
          </button>
          {isComplete && !isValid && errors.length > 0 && (
            <div className="error-message">
              ⚠️ Invalid cube: {errors[0]}
            </div>
          )}
          {isComplete && (
            <button 
              onClick={onComplete} 
              className="complete-btn"
              disabled={!isValid}
            >
              🎯 Continue to Solver →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
