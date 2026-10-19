import type { Db } from "mongodb";
import { Collections, type VerificationSessionDoc } from "./collections.js";

export class SessionRepository {
  constructor(private readonly db: Db) {}

  private get col() {
    return this.db.collection<VerificationSessionDoc>(Collections.sessions);
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
}
