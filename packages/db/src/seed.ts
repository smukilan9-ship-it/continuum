import { NeonRepository } from "./repo";
import { closeDatabase } from "./client";

try {
  await new NeonRepository().runDemoSeed();
  process.stdout.write("Continuum demo user, goals, project, curriculum, and learning state are seeded.\n");
} finally {
  await closeDatabase();
}
