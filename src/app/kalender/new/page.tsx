import { EventForm } from "@/components/EventForm";

export default function NewEventPage() {
  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Neuer Termin</h1>
      <EventForm />
    </main>
  );
}
