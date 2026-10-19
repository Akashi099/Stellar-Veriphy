/**
 * Tests for the polling TransactionTracker (#808).
 * The polling call is mocked so each status and the retry path can be driven deterministically.
 */

import "@testing-library/jest-dom";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { pollTransactionStatus, type TransactionStatus } from "@/utils/transaction";

import { TransactionTracker } from "../TransactionTracker";

jest.mock("@/utils/transaction", () => {
  const actual = jest.requireActual("@/utils/transaction");
  return { ...actual, pollTransactionStatus: jest.fn() };
});

const mockPoll = pollTransactionStatus as jest.MockedFunction<typeof pollTransactionStatus>;
const HASH = "abc123def456";

/** Makes the mocked poll report `status` and resolve, like the real poller does. */
function pollResolvesWith(status: TransactionStatus) {
  mockPoll.mockImplementation(async (_hash, options) => {
    options?.onStatus?.(status);
    return status;
  });
}

beforeEach(() => {
  mockPoll.mockReset();
});

describe("TransactionTracker", () => {
  it("shows a pending state with the submitted step and what to expect", async () => {
    mockPoll.mockImplementation(async (_hash, options) => {
      options?.onStatus?.("PENDING");
      return new Promise<TransactionStatus>(() => {});
    });

    render(<TransactionTracker txHash={HASH} />);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(/updates automatically/i)).toBeInTheDocument();
    expect(screen.getByText("1. Submitted")).toBeInTheDocument();
    expect(screen.getByText("2. Waiting for ledger")).toBeInTheDocument();
  });

  it("marks the ledger step complete when the transaction is confirmed", async () => {
    pollResolvesWith("CONFIRMED");

    render(<TransactionTracker txHash={HASH} />);

    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("2. Confirmed on ledger")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("reports a failed transaction without offering a retry", async () => {
    pollResolvesWith("FAILED");

    render(<TransactionTracker txHash={HASH} />);

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("2. Did not succeed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("explains a timeout and offers a retry that restarts polling", async () => {
    pollResolvesWith("TIMEOUT");

    render(<TransactionTracker txHash={HASH} />);

    expect(await screen.findByText("Still pending")).toBeInTheDocument();
    expect(screen.getByText(/do not submit the transaction again/i)).toBeInTheDocument();
    expect(mockPoll).toHaveBeenCalledTimes(1);

    pollResolvesWith("CONFIRMED");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry status check/i }));
    });

    expect(mockPoll).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
  });

  it("does not poll when there is no transaction hash", () => {
    render(<TransactionTracker txHash="" />);

    expect(mockPoll).not.toHaveBeenCalled();
    expect(screen.getByText(/no transaction yet/i)).toBeInTheDocument();
  });

  it("announces status changes to assistive technology", async () => {
    pollResolvesWith("CONFIRMED");

    render(<TransactionTracker txHash={HASH} />);

    const region = await screen.findByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Confirmed");
  });
});
