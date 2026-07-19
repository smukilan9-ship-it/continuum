import { NeonRepository } from "./repo";
import { closeDatabase } from "./client";

try {
  await new NeonRepository().ensureDemoSeed();
  process.stdout.write("Continuum demo user, goals, project, curriculum, and learning state are seeded.\n");
} finally {
  await closeDatabase();
}
