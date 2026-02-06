import { useMemo } from 'react';
import * as THREE from 'three';
import type { Cubie as CubieType } from '../types/cube.ts';
import { COLOR_HEX } from '../lib/constants.ts';

const BLACK = '#111111';
const GAP = 1.05; // spacing between cubies

// Material cache to avoid re-creating on every render
const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function getMaterial(hex: string, emissive?: string): THREE.MeshStandardMaterial {
  const key = `${hex}-${emissive || 'none'}`;
  if (!materialCache.has(key)) {
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.35,
        metalness: 0.05,
        emissive: emissive || '#000000',
        emissiveIntensity: emissive ? 0.3 : 0,
      })
    );
  }
  return materialCache.get(key)!;
}

interface CubieProps {
  cubie: CubieType;
  highlight?: boolean;
}

export default function Cubie({ cubie, highlight }: CubieProps) {
  const materials = useMemo(() => {
    // Three.js box face order: +X, -X, +Y, -Y, +Z, -Z
    const faceMap: [string | undefined, string][] = [
      [cubie.colors.right ? COLOR_HEX[cubie.colors.right] : undefined, 'right'],
      [cubie.colors.left ? COLOR_HEX[cubie.colors.left] : undefined, 'left'],
      [cubie.colors.top ? COLOR_HEX[cubie.colors.top] : undefined, 'top'],
      [cubie.colors.bottom ? COLOR_HEX[cubie.colors.bottom] : undefined, 'bottom'],
      [cubie.colors.front ? COLOR_HEX[cubie.colors.front] : undefined, 'front'],
      [cubie.colors.back ? COLOR_HEX[cubie.colors.back] : undefined, 'back'],
    ];

    return faceMap.map(([hex]) => {
      const color = hex || BLACK;
      return getMaterial(color, highlight ? '#333366' : undefined);
    });
  }, [cubie.colors, highlight]);

  const position: [number, number, number] = [
    cubie.position.x * GAP,
    cubie.position.y * GAP,
    cubie.position.z * GAP,
  ];

  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}
