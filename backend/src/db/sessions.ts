import type { Db } from "mongodb";
import {
  Collections,
  type VerificationSessionDoc,
  type AccessRequestDoc,
  type AccessRequestState,
} from "./collections.js";

export class SessionRepository {
  constructor(private readonly db: Db) {}

  private get col() {
    return this.db.collection<VerificationSessionDoc>(Collections.sessions);
  }

  private get accessRequests() {
    return this.db.collection<AccessRequestDoc>(Collections.accessRequests);
  }

  /** Index: creator_state_lastActivityAt */
  findOpenForCreator(creator: string) {
    return this.col.findOne({ creator, state: "open" }, { sort: { lastActivityAt: -1 } });
  }

  /** Index: sessionId_unique. Any activity resets the session's idle clock for retention. */
  async touch(sessionId: string): Promise<boolean> {
    const res = await this.col.updateOne({ sessionId }, { $set: { lastActivityAt: new Date() } });
    return res.matchedCount === 1;
  }

  /** Index: verificationJobId */
  async markCompletedByJobId(verificationJobId: string): Promise<void> {
    await this.col.updateOne(
      { verificationJobId, state: "submitted" },
      { $set: { state: "completed", lastActivityAt: new Date() } },
    );
  }

  /**
   * Create a new access request for a user attempting an action outside their
   * current access scope. Returns the persisted document.
   * Index: requester_state_createdAt
   */
  async createAccessRequest(input: {
    requester: string;
    scope: string;
    reason?: string;
    resource?: string;
  }): Promise<AccessRequestDoc> {
    const now = new Date();
    const doc: AccessRequestDoc = {
      requestId: crypto.randomUUID(),
      requester: input.requester,
      scope: input.scope,
      reason: input.reason ?? null,
      resource: input.resource ?? null,
      state: "pending",
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
    };
    await this.accessRequests.insertOne(doc);
    return doc;
  }

  /** Index: requestId_unique */
  findAccessRequestById(requestId: string) {
    return this.accessRequests.findOne({ requestId });
  }

  /**
   * Find an existing pending request for the same requester + scope so the
   * frontend can avoid duplicate submissions and reflect current state.
   * Index: requester_scope_state
   */
  findPendingAccessRequest(requester: string, scope: string) {
    return this.accessRequests.findOne(
      { requester, scope, state: "pending" },
      { sort: { createdAt: -1 } },
    );
  }

  /** Index: requester_state_createdAt */
  listAccessRequestsForRequester(requester: string, limit = 50) {
    return this.accessRequests
      .find({ requester })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /** Index: state_createdAt */
  listAccessRequestsByState(state: AccessRequestState, limit = 100) {
    return this.accessRequests
      .find({ state })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Record the outcome of a review. Only transitions a pending request so
   * repeated reviews are idempotent. Returns the updated doc or null.
   * Index: requestId_unique
   */
  async reviewAccessRequest(
    requestId: string,
    decision: Extract<AccessRequestState, "approved" | "denied">,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<AccessRequestDoc | null> {
    const now = new Date();
    const res = await this.accessRequests.findOneAndUpdate(
      { requestId, state: "pending" },
      {
        $set: {
          state: decision,
          reviewedAt: now,
          reviewedBy,
          reviewNote: reviewNote ?? null,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    return res ?? null;
  }
}