import { useState, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useCubeStore } from '../stores/useCubeStore.ts';
import { useSolverStore } from '../stores/useSolverStore.ts';
import { KOCIEMBA_FACE_ORDER, FACE_NAMES, COLOR_HEX, DEFAULT_CENTER_MAP } from '../lib/constants.ts';
import { generateCubies, assignColorsFromFaces } from '../lib/cubeModel.ts';
import type { CubeColor, FaceName, StickerColor, Cubie } from '../types/cube.ts';

const ALL_COLORS: CubeColor[] = ['R', 'O', 'Y', 'G', 'B', 'W'];
const COLOR_LABELS: Record<CubeColor, string> = {
  R: 'Red', O: 'Orange', Y: 'Yellow', G: 'Green', B: 'Blue', W: 'White',
};

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

function boxFaceIndexToName(faceIndex: number): 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back' {
  switch (faceIndex) {
    case 0: return 'right';
    case 1: return 'left';
    case 2: return 'top';
    case 3: return 'bottom';
    case 4: return 'front';
    case 5: return 'back';
    default: return 'front';
  }
}

function cubieFaceToFaceName(face: string): FaceName {
  switch (face) {
    case 'top': return 'U';
    case 'bottom': return 'D';
    case 'front': return 'F';
    case 'back': return 'B';
    case 'right': return 'R';
    case 'left': return 'L';
    default: return 'U';
  }
}

function cubiePositionToStickerIndex(
  faceName: FaceName,
  pos: { x: number; y: number; z: number }
): number {
  let row: number, col: number;
  switch (faceName) {
    case 'U':
      row = pos.z === -1 ? 0 : pos.z === 0 ? 1 : 2;
      col = pos.x === -1 ? 0 : pos.x === 0 ? 1 : 2;
      break;
    case 'D':
      row = pos.z === 1 ? 0 : pos.z === 0 ? 1 : 2;
      col = pos.x === -1 ? 0 : pos.x === 0 ? 1 : 2;
      break;
    case 'F':
      row = pos.y === 1 ? 0 : pos.y === 0 ? 1 : 2;
      col = pos.x === -1 ? 0 : pos.x === 0 ? 1 : 2;
      break;
    case 'B':
      row = pos.y === 1 ? 0 : pos.y === 0 ? 1 : 2;
      col = pos.x === 1 ? 0 : pos.x === 0 ? 1 : 2;
      break;
    case 'R':
      row = pos.y === 1 ? 0 : pos.y === 0 ? 1 : 2;
      col = pos.z === 1 ? 0 : pos.z === 0 ? 1 : 2;
      break;
    case 'L':
      row = pos.y === 1 ? 0 : pos.y === 0 ? 1 : 2;
      col = pos.z === -1 ? 0 : pos.z === 0 ? 1 : 2;
      break;
    default:
      return 0;
  }
  return row * 3 + col;
}

// ── Interactive Cubie ────────────────────────────────────────────────

const GAP = 1.05;
const BLACK = '#111111';

interface EditableCubieProps {
  cubie: Cubie;
  onFaceClick: (faceName: FaceName, stickerIndex: number) => void;
  highlightFace: FaceName | null;
}

function EditableCubie({ cubie, onFaceClick, highlightFace }: EditableCubieProps) {
  const materials = useMemo(() => {
    const colorEntries: (string | undefined)[] = [
      cubie.colors.right ? COLOR_HEX[cubie.colors.right] : undefined,
      cubie.colors.left ? COLOR_HEX[cubie.colors.left] : undefined,
      cubie.colors.top ? COLOR_HEX[cubie.colors.top] : undefined,
      cubie.colors.bottom ? COLOR_HEX[cubie.colors.bottom] : undefined,
      cubie.colors.front ? COLOR_HEX[cubie.colors.front] : undefined,
      cubie.colors.back ? COLOR_HEX[cubie.colors.back] : undefined,
    ];

    const cubieDirections = ['right', 'left', 'top', 'bottom', 'front', 'back'];

    return colorEntries.map((hex, i) => {
      const color = hex || BLACK;
      const dir = cubieDirections[i];
      const fn = cubieFaceToFaceName(dir);
      const axis = fn === 'R' || fn === 'L' ? 'x' : fn === 'U' || fn === 'D' ? 'y' : 'z';
      const layer = fn === 'R' || fn === 'U' || fn === 'F' ? 1 : -1;
      const isOuter = cubie.position[axis] === layer;

      // Dim highlight for the selected face tab
      let emissive = '#000000';
      let emissiveIntensity = 0;
      if (highlightFace && isOuter && highlightFace === fn) {
        emissive = '#444488';
        emissiveIntensity = 0.2;
      }

      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.05,
        emissive,
        emissiveIntensity,
      });
    });
  }, [cubie.colors, cubie.position, highlightFace]);

  const handleClick = useCallback((e: { stopPropagation: () => void; faceIndex?: number }) => {
    e.stopPropagation();
    if (e.faceIndex === undefined) return;

    const boxFaceIdx = Math.floor(e.faceIndex / 2);
    const cubieFace = boxFaceIndexToName(boxFaceIdx);
    const fn = cubieFaceToFaceName(cubieFace);

    const axis = fn === 'R' || fn === 'L' ? 'x' : fn === 'U' || fn === 'D' ? 'y' : 'z';
    const layer = fn === 'R' || fn === 'U' || fn === 'F' ? 1 : -1;
    if (cubie.position[axis] !== layer) return;

    const stickerIdx = cubiePositionToStickerIndex(fn, cubie.position);
    onFaceClick(fn, stickerIdx);
  }, [cubie.position, onFaceClick]);

  return (
    <mesh
      position={[cubie.position.x * GAP, cubie.position.y * GAP, cubie.position.z * GAP]}
      material={materials}
      onClick={handleClick}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

// ── Main Editor ─────────────────────────────────────────────────────

export default function ManualEditor({ onComplete, onBack }: Props) {
  const faces = useCubeStore((s) => s.faces);
  const scannedCount = useCubeStore((s) => s.scannedCount);
  const setAllFaces = useCubeStore((s) => s.setAllFaces);
  const isValid = useCubeStore((s) => s.isValid);
  const errors = useCubeStore((s) => s.errors);

  const [editingFace, setEditingFace] = useState<FaceName>('U');
  const [editingSticker, setEditingSticker] = useState<number | null>(null);

  // Local face colors for editing
  const [localFaces, setLocalFaces] = useState<Record<FaceName, CubeColor[]>>(() => {
    const result: Partial<Record<FaceName, CubeColor[]>> = {};
    for (const fn of KOCIEMBA_FACE_ORDER) {
      const face = faces[fn];
      if (face) {
        result[fn] = face.stickers.map(s => s.color);
      } else {
        const expectedCenter = Object.entries(DEFAULT_CENTER_MAP).find(
          ([, f]) => f === fn
        )?.[0] as CubeColor || 'W';
        result[fn] = Array(9).fill(expectedCenter);
      }
    }
    return result as Record<FaceName, CubeColor[]>;
  });

  // Build cubies from local face state
  const cubies = useMemo(() => {
    const base = generateCubies();
    const faceData: Partial<Record<FaceName, { name: FaceName; stickers: StickerColor[]; timestamp: number }>> = {};
    for (const fn of KOCIEMBA_FACE_ORDER) {
      faceData[fn] = {
        name: fn,
        stickers: localFaces[fn].map((color: CubeColor) => ({
          color,
          rgb: [0, 0, 0] as [number, number, number],
          hsv: [0, 0, 0] as [number, number, number],
        })),
        timestamp: 0,
      };
    }
    return assignColorsFromFaces(base, faceData);
  }, [localFaces]);

  const handleFaceClick = useCallback((faceName: FaceName, stickerIndex: number) => {
    setEditingFace(faceName);
    setEditingSticker(stickerIndex);
  }, []);

  const handleColorSelect = useCallback((color: CubeColor) => {
    if (editingSticker === null) return;
    setLocalFaces(prev => {
      const updated = { ...prev };
      const arr = [...updated[editingFace]];
      arr[editingSticker] = color;
      updated[editingFace] = arr;
      return updated;
    });
    setEditingSticker(null);
  }, [editingFace, editingSticker]);

  const saveAllAndSolve = useCallback(() => {
    // Atomically set all 6 faces — no race condition
    setAllFaces(localFaces);
    useSolverStore.getState().reset();
    // Check after state update
    setTimeout(() => {
      const state = useCubeStore.getState();
      if (state.isValid) {
        onComplete();
      }
    }, 50);
  }, [localFaces, setAllFaces, onComplete]);

  // Color counts
  const colorCounts = useMemo((): Record<CubeColor, number> => {
    const counts: Record<CubeColor, number> = { R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0 };
    for (const fn of KOCIEMBA_FACE_ORDER) {
      for (const c of localFaces[fn]) counts[c]++;
    }
    return counts;
  }, [localFaces]);

  const allValid = ALL_COLORS.every(c => colorCounts[c] === 9);
  const currentFaceColors = localFaces[editingFace];

  return (
    <div className="manual-editor">
      <div className="manual-header">
        <button onClick={onBack} className="back-btn">Rescan</button>
        <h2>Edit Cube</h2>
        <div className="face-count">{scannedCount}/6</div>
      </div>

      <div className="editor-split">
        {/* Left: 3D cube */}
        <div className="editor-3d-panel">
          <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 8, 5]} intensity={0.8} />
            <directionalLight position={[-3, -4, -5]} intensity={0.3} />
            <group>
              {cubies.map((cubie) => (
                <EditableCubie
                  key={cubie.id}
                  cubie={cubie}
                  onFaceClick={handleFaceClick}
                  highlightFace={editingFace}
                />
              ))}
            </group>
            <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
          </Canvas>
        </div>

        {/* Right: 2D face editor panel */}
        <div className="editor-2d-panel">
          {/* Face tabs */}
          <div className="face-selector">
            {KOCIEMBA_FACE_ORDER.map((fn) => (
              <button
                key={fn}
                className={`face-tab ${editingFace === fn ? 'active' : ''}`}
                onClick={() => { setEditingFace(fn); setEditingSticker(null); }}
              >
                {FACE_NAMES[fn]}
              </button>
            ))}
          </div>

          {/* 2D sticker grid */}
          <div className="current-face-label">{FACE_NAMES[editingFace]} Face</div>
          <div className="editor-grid">
            {currentFaceColors.map((color, i) => (
              <button
                key={i}
                className={`editor-sticker ${editingSticker === i ? 'selected' : ''}`}
                style={{ backgroundColor: COLOR_HEX[color] }}
                onClick={() => setEditingSticker(editingSticker === i ? null : i)}
              >
                {i === 4 && <span className="center-marker">{'\u25cf'}</span>}
              </button>
            ))}
          </div>

          {/* Color picker — shown when a sticker is selected */}
          {editingSticker !== null && (
            <div className="color-picker">
              {ALL_COLORS.map(c => (
                <button
                  key={c}
                  className={`color-pick-btn ${currentFaceColors[editingSticker] === c ? 'active' : ''}`}
                  style={{ backgroundColor: COLOR_HEX[c] }}
                  onClick={() => handleColorSelect(c)}
                  title={COLOR_LABELS[c]}
                >
                  {COLOR_LABELS[c][0]}
                </button>
              ))}
            </div>
          )}

          {/* Color counts */}
          <div className="color-counts">
            {ALL_COLORS.map(c => (
              <span key={c} className={`color-count ${colorCounts[c] !== 9 ? 'bad' : 'good'}`}>
                <span className="color-dot" style={{ backgroundColor: COLOR_HEX[c] }} />
                {colorCounts[c]}/9
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Validation + actions */}
      <div className="editor-bottom">
        {isValid === false && errors.length > 0 && (
          <div className="validation-banner">
            <strong>Errors:</strong>
            <ul>{errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
          </div>
        )}
        {!allValid && (
          <div className="error-message">Each color must appear exactly 9 times</div>
        )}
        <button
          onClick={saveAllAndSolve}
          className="complete-btn"
          disabled={!allValid}
        >
          {allValid ? 'Solve Cube \u2192' : 'Fix color counts to continue'}
        </button>
      </div>
    </div>
  );
}
