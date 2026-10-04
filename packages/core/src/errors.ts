export class LoxoraError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends LoxoraError {}

/** A Mission changed after the caller read it (stale `expectedSequence` or a concurrent write). */
export class StaleMissionError extends ValidationError {}

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
