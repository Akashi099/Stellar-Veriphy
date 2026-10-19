import { JobList } from "@/components/JobList";

export default function VerificationJobs() {
  return (
    <main>
      <h1>My verification jobs</h1>
      <p>Submissions from this browser and where each one is in the verification queue.</p>
      <JobList />
    </main>
  );
}
