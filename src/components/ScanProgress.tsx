import { useCubeStore } from '../stores/useCubeStore.ts';
import { useScannerStore } from '../stores/useScannerStore.ts';
import { KOCIEMBA_FACE_ORDER, FACE_NAMES, COLOR_HEX, DEFAULT_CENTER_MAP } from '../lib/constants.ts';
import type { CubeColor } from '../types/cube.ts';

/**
 * Shows 6 mini face grids at the bottom of the scanner.
 * Scanned faces show their actual colors; unscanned show gray.
 */
export default function ScanProgress() {
  const faces = useCubeStore((s) => s.faces);
  const scannedCount = useCubeStore((s) => s.scannedCount);
  const currentColors = useScannerStore((s) => s.currentColors);

  // Figure out which face the current detection would map to
  const currentCenter = currentColors?.[4]?.color ?? null;

  return (
    <div className="scan-progress">
      <div className="face-indicators">
        {KOCIEMBA_FACE_ORDER.map((faceName) => {
          const face = faces[faceName];
          const isScanned = !!face;
          // Find which center color maps to this face
          const expectedCenter = Object.entries(DEFAULT_CENTER_MAP).find(
            ([, fn]) => fn === faceName
          )?.[0] as CubeColor | undefined;
          const isActive = currentCenter !== null && expectedCenter === currentCenter && !isScanned;
          const needsScanning = !isScanned && scannedCount > 0;

          return (
            <div key={faceName} className="face-indicator">
              <div className={`face-grid ${isScanned ? 'scanned' : ''} ${isActive ? 'active' : ''} ${needsScanning ? 'pending' : ''}`}>
                {Array.from({ length: 9 }).map((_, i) => {
                  const color = face?.stickers[i]?.color;
                  return (
                    <div
                      key={i}
                      className="face-sticker"
                      style={color ? { background: COLOR_HEX[color] } : undefined}
                    />
                  );
                })}
              </div>
              <span className="face-label">
                {FACE_NAMES[faceName]}
                {needsScanning && ' ⏳'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
