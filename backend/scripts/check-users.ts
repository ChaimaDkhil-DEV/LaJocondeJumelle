import { PrismaClient } from "@prisma/client";
import { loadEnvFile } from "../src/config/load-env-file";

loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      username: true,
      role: true,
      active: true,
      mustChangePassword: true
    },
    orderBy: { username: "asc" }
  });

  console.table(users);
  console.log("Nombre de comptes :", users.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
