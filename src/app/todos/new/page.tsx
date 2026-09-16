import { TodoForm } from "@/components/TodoForm";

export default function NewTodoPage() {
  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Neues ToDo</h1>
      <TodoForm />
    </main>
  );
}
