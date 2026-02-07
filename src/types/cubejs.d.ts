declare module 'cubejs' {
  class Cube {
    static initSolver(): void;
    static fromString(str: string): Cube;
    static random(): Cube;
    solve(maxDepth?: number): string;
    move(moves: string): void;
    asString(): string;
  }
  export default Cube;
}
