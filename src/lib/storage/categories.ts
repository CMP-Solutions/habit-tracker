import { db, type CategoryRecord } from "./db";
import { generateId } from "./id";

export async function listCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy("name").toArray();
}

export async function createCategory(input: {
  name: string;
  color: string;
  icon: string;
}): Promise<CategoryRecord> {
  if (!input.name || !input.color || !input.icon) {
    throw new Error("name, color and icon are required.");
  }
  const category: CategoryRecord = {
    id: generateId(),
    name: input.name,
    color: input.color,
    icon: input.icon,
  };
  await db.categories.add(category);
  return category;
}
