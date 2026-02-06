declare module 'cubejs' {
  class Cube {
    static initSolver(): void;
    static fromString(str: string): Cube;
    static random(): Cube;
    solve(): string;
    move(moves: string): void;
    asString(): string;
  }
  export default Cube;
}
