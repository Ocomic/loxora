export class LoxoraError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends LoxoraError {}

export class NotFoundError extends LoxoraError {}

export class ProposalNotReviewableError extends LoxoraError {}

export class IntegrityError extends LoxoraError {}
