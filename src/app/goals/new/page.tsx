import { GoalForm } from "@/components/GoalForm";

export default function NewGoalPage() {
  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Neues Ziel</h1>
      <GoalForm />
    </main>
  );
}
