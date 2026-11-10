import { resetDemoWorld } from "./demo";

// Каждый прогон e2e начинается со свежего демо-мира (как после ночного сброса в 04:00 МСК).
export default function globalSetup(): void {
  resetDemoWorld();
}
