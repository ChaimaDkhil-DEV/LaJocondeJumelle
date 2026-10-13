import { PrismaClient } from "@prisma/client";
import { argon2id, hash } from "argon2";
import { randomBytes } from "node:crypto";
import { loadEnvFile } from "../src/config/load-env-file";

loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const username = "superadmin";

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    throw new Error("Compte superadmin introuvable ou rôle inattendu. Aucune modification effectuée.");
  }

  const temporaryPassword = randomBytes(18).toString("base64url");
  const passwordHash = await hash(temporaryPassword, { type: argon2id });

  await prisma.user.update({
    where: { username },
    data: {
      passwordHash,
      mustChangePassword: true
    }
  });

  console.log("Mot de passe provisoire pour superadmin :");
  console.log(temporaryPassword);
  console.log("Conserve ce mot de passe en lieu sûr. Il ne sera pas affiché une deuxième fois.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
