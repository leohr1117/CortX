export class AppFehler extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppFehler';
    this.statusCode = statusCode;
  }
}
