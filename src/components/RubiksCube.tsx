import { useRef, useImperativeHandle, forwardRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSolverStore } from '../stores/useSolverStore.ts';
import CubieComponent from './Cubie.tsx';
import type { Move } from '../types/cube.ts';

export interface RubiksCubeHandle {
  animateMove: (move: Move) => Promise<void>;
  cancelAnimation: () => void;
}

interface RubiksCubeProps {
  cubies?: any[];
}

interface RotationState {
  face: string;
  axis: 'x' | 'y' | 'z';
  layer: number;
  targetAngle: number;
  currentAngle: number;
  move: Move;
  resolve: () => void;
  cancelled: boolean;
}

/**
 * Pure-React animation approach:
 * - During animation, a rotation state describes which face is rotating and how far
 * - useFrame advances the angle each frame
 * - Cubies on the rotating face are rendered inside a rotating <group>
 * - When animation completes, logical state is updated and rotation state cleared
 * - No GSAP, no reparenting — React fully controls the scene graph
 */
const RubiksCube = forwardRef<RubiksCubeHandle, RubiksCubeProps>(function RubiksCube({ cubies: propCubies }, ref) {
  const storeCubies = useSolverStore((s) => s.cubies);
  const cubies = propCubies || storeCubies;
  const highlightFace = useSolverStore((s) => s.highlightFace);
  const speed = useSolverStore((s) => s.speed);

  const [rotation, setRotation] = useState<RotationState | null>(null);
  const rotationRef = useRef<RotationState | null>(null);
  const rotGroupRef = useRef<THREE.Group>(null);

  // Animate via useFrame — smooth interpolation each frame
  useFrame((_, delta) => {
    const rot = rotationRef.current;
    if (!rot || !rotGroupRef.current) return;

    const speed_rad_per_sec = (Math.PI / 2) / (speed / 1000); // radians per second
    const step = speed_rad_per_sec * delta;
    const remaining = rot.targetAngle - rot.currentAngle;

    if (rot.cancelled) return; // cancelled — skip everything

    if (Math.abs(remaining) <= step * 1.1) {
      // Animation complete — reset rotation group BEFORE updating state
      rotGroupRef.current.rotation.set(0, 0, 0);

      // Update logical state (causes re-render with new positions/colors)
      const store = useSolverStore.getState();
      store.applyMoveToState(rot.move);
      store.setIsAnimating(false);
      store.setHighlightFace(null);

      const resolve = rot.resolve;
      rotationRef.current = null;
      setRotation(null);
      resolve();
    } else {
      // Advance animation
      const direction = Math.sign(remaining);
      rot.currentAngle += direction * step;
      rotGroupRef.current.rotation[rot.axis] = rot.currentAngle;
    }
  });

  const animateMove = useCallback(async (move: Move) => {
    if (rotationRef.current) return;

    const store = useSolverStore.getState();
    store.setIsAnimating(true);
    store.setHighlightFace(move.face);

    const axis = getAxis(move.face);
    const layer = getLayer(move.face);
    const targetAngle = getAngle(move);

    return new Promise<void>((resolve) => {
      const state: RotationState = {
        face: move.face,
        axis,
        layer,
        targetAngle,
        currentAngle: 0,
        move,
        resolve,
        cancelled: false,
      };
      rotationRef.current = state;
      setRotation(state);
    });
  }, [speed]);

  const cancelAnimation = useCallback(() => {
    const rot = rotationRef.current;
    if (!rot) return;
    // Mark as cancelled so useFrame skips it
    rot.cancelled = true;
    // Reset visual rotation without applying the move to state
    if (rotGroupRef.current) {
      rotGroupRef.current.rotation.set(0, 0, 0);
    }
    const store = useSolverStore.getState();
    store.setIsAnimating(false);
    store.setHighlightFace(null);
    rotationRef.current = null;
    setRotation(null);
    // Do NOT resolve — let the promise hang so no .then() callbacks fire
  }, []);

  useImperativeHandle(ref, () => ({ animateMove, cancelAnimation }), [animateMove, cancelAnimation]);

  // Split cubies into static and rotating groups
  const { staticCubies, rotatingCubies } = useMemo(() => {
    if (!rotation) return { staticCubies: cubies, rotatingCubies: [] as typeof cubies };
    const axis = rotation.axis;
    const layer = rotation.layer;
    const rotating: typeof cubies = [];
    const static_: typeof cubies = [];
    for (const c of cubies) {
      if (c.position[axis] === layer) {
        rotating.push(c);
      } else {
        static_.push(c);
      }
    }
    return { staticCubies: static_, rotatingCubies: rotating };
  }, [cubies, rotation]);

  // Highlight cubies on the target face
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
      {/* Rotating group — animated via useFrame */}
      <group ref={rotGroupRef}>
        {rotatingCubies.map((cubie) => (
          <CubieComponent
            key={cubie.id}
            cubie={cubie}
            highlight={highlightedCubieIds.has(cubie.id)}
          />
        ))}
      </group>
      {/* Static cubies */}
      <group>
        {staticCubies.map((cubie) => (
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
  const baseAngle = Math.PI / 2;

  // CW rotation as viewed from outside looking at the face:
  // +axis faces (R, U, F): CW = -π/2 around their axis
  // -axis faces (L, D, B): CW = +π/2 around their axis
  const sign = (face === 'R' || face === 'U' || face === 'F') ? -1 : 1;
  const direction = move.direction;
  const multiplier = move.double ? 2 : 1;

  return sign * direction * baseAngle * multiplier;
}
