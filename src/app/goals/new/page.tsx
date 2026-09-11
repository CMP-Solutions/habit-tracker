import { GoalForm } from "@/components/GoalForm";

export default function NewGoalPage() {
  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Neues Ziel</h1>
      <GoalForm />
    </main>
  );
}
