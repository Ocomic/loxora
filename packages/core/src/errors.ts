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

export class CurrentRevisionMismatchError extends LoxoraError {
  public constructor(
    public readonly expectedRevisionId: RevisionId,
    public readonly actualRevisionId: RevisionId | null,
  ) {
    super(`Expected Current Revision ${expectedRevisionId}, found ${actualRevisionId ?? "none"}`);
  }
}

export class InvalidLineageError extends IntegrityError {}

export class InvalidRestorationError extends IntegrityError {}
import type { RevisionId } from "./types.js";
