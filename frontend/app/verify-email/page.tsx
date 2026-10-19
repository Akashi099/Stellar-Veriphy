import { Metadata } from "next";
import { EmailVerificationChallenge } from "@/components/auth/EmailVerificationChallenge";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Email Verification | StellarVeriphy",
  description: "Secure challenge-response email verification for account trust and identity verification.",
};

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-slate-950 py-16 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
      <div className="w-full max-w-md mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      <EmailVerificationChallenge />

      <div className="mt-8 text-center text-xs text-slate-500 max-w-sm">
        Email verification helps protect your digital assets and secures on-chain provenance records.
        Verification tokens expire in 10 minutes.
      </div>
    </div>
  );
}
