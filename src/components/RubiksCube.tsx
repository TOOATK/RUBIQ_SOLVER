import { useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { useSolverStore } from '../stores/useSolverStore.ts';
import CubieComponent from './Cubie.tsx';
import type { Move } from '../types/cube.ts';
import gsap from 'gsap';

export interface RubiksCubeHandle {
  animateMove: (move: Move) => Promise<void>;
}

interface RubiksCubeProps {
  cubies?: any[]; // Optional: override cubies from store
}

/**
 * Renders all 26 cubies and handles face rotation animation.
 *
 * Animation strategy:
 * 1. Identify cubies on the rotating face
 * 2. Move their Three.js meshes into a temporary group
 * 3. GSAP-animate the group's rotation
 * 4. Move meshes back, update logical state
 */
const RubiksCube = forwardRef<RubiksCubeHandle, RubiksCubeProps>(function RubiksCube({ cubies: propCubies }, ref) {
  const storeCubies = useSolverStore((s) => s.cubies);
  const cubies = propCubies || storeCubies;
  const highlightFace = useSolverStore((s) => s.highlightFace);
  const speed = useSolverStore((s) => s.speed);

  const groupRef = useRef<THREE.Group>(null);
  const rotationGroupRef = useRef<THREE.Group>(null);
  const isAnimatingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    animateMove: async (move: Move) => {
      if (isAnimatingRef.current || !groupRef.current || !rotationGroupRef.current) return;
      isAnimatingRef.current = true;

      const store = useSolverStore.getState();
      store.setIsAnimating(true);
      store.setHighlightFace(move.face);

      const axis = getAxis(move.face);
      const layer = getLayer(move.face);
      const angle = getAngle(move);

      const mainGroup = groupRef.current;
      const rotGroup = rotationGroupRef.current;

      // Find children on the rotating face
      const meshes: THREE.Object3D[] = [];
      mainGroup.children.forEach((child) => {
        const pos = child.position;
        const coord = axis === 'x' ? pos.x : axis === 'y' ? pos.y : pos.z;
        // Round to nearest integer for comparison
        if (Math.abs(Math.round(coord / 1.05) - layer) < 0.1) {
          meshes.push(child);
        }
      });

      // Reparent into rotation group
      meshes.forEach((m) => {
        mainGroup.remove(m);
        rotGroup.add(m);
      });

      // Animate with GSAP
      const rotProp = axis === 'x' ? 'x' : axis === 'y' ? 'y' : 'z';
      await new Promise<void>((resolve) => {
        gsap.to(rotGroup.rotation, {
          [rotProp]: angle,
          duration: speed / 1000,
          ease: 'power2.inOut',
          onComplete: () => {
            // Apply rotation to each mesh's world position, then reparent back
            meshes.forEach((m) => {
              // Get world position/quaternion
              const worldPos = new THREE.Vector3();
              const worldQuat = new THREE.Quaternion();
              m.getWorldPosition(worldPos);
              m.getWorldQuaternion(worldQuat);

              rotGroup.remove(m);
              mainGroup.add(m);

              // Snap position to grid
              m.position.set(
                Math.round(worldPos.x / 1.05) * 1.05,
                Math.round(worldPos.y / 1.05) * 1.05,
                Math.round(worldPos.z / 1.05) * 1.05
              );
              m.quaternion.copy(worldQuat);
            });

            // Reset rotation group
            rotGroup.rotation.set(0, 0, 0);

            // Update logical state
            store.applyMoveToState(move);
            store.setIsAnimating(false);
            store.setHighlightFace(null);
            isAnimatingRef.current = false;

            resolve();
          },
        });
      });
    },
  }));

  // Determine which cubies are on highlighted face
  const highlightedCubieIds = useMemo(() => {
    if (!highlightFace) return new Set<string>();
    const axis = getAxis(highlightFace);
    const layer = getLayer(highlightFace);
    return new Set(
      cubies
        .filter((c) => c.position[axis] === layer)
        .map((c) => c.id)
    );
  }, [cubies, highlightFace]);

  return (
    <>
      <group ref={rotationGroupRef} />
      <group ref={groupRef}>
        {cubies.map((cubie) => (
          <CubieComponent
            key={cubie.id}
            cubie={cubie}
            highlight={highlightedCubieIds.has(cubie.id)}
          />
        ))}
      </group>
    </>
  );
});

export default RubiksCube;

// ── Helpers ─────────────────────────────────────────────────────────

function getAxis(face: string): 'x' | 'y' | 'z' {
  if (face === 'R' || face === 'L') return 'x';
  if (face === 'U' || face === 'D') return 'y';
  return 'z';
}

function getLayer(face: string): number {
  if (face === 'R' || face === 'U' || face === 'F') return 1;
  return -1;
}

function getAngle(move: Move): number {
  const face = move.face;
  const baseAngle = Math.PI / 2; // 90 degrees

  // CW rotation as viewed from outside looking at the face
  // For +axis faces (R, U, F): CW = negative rotation
  // For -axis faces (L, D, B): CW = positive rotation
  const sign = (face === 'R' || face === 'U' || face === 'F') ? -1 : 1;
  const direction = move.direction;
  const multiplier = move.double ? 2 : 1;

  return sign * direction * baseAngle * multiplier;
}
