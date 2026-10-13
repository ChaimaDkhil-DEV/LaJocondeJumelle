/**
 * Réparation des comptes créés avant le rattachement aux catégories à la création.
 *
 * Un compte n'est proposé à l'affectation (approbation en circuit B, réaffectation) et comme
 * destinataire (circuit A) que s'il est destinataire de la catégorie de la demande. Les comptes
 * créés sans catégorie n'apparaissaient donc nulle part. La catégorie à rattacher est un choix
 * métier : le script ne devine rien, il liste puis applique ce qu'on lui indique.
 *
 * Usage (depuis backend/) :
 *   npx tsx scripts/repair-employee-recipients.ts
 *     → liste les employés actifs rattachés à aucune catégorie (aucune écriture)
 *   npx tsx scripts/repair-employee-recipients.ts --assign "technicien=Intervention technique (démo circuit B)"
 *     → affiche ce qui serait fait (simulation)
 *   npx tsx scripts/repair-employee-recipients.ts --assign "technicien=Catégorie 1,Catégorie 2" --apply
 *     → rattache le compte aux catégories, en une transaction, avec une entrée d'audit par compte
 *
 * Idempotent : un rattachement déjà présent est ignoré.
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFile } from '../src/config/load-env-file';

loadEnvFile();

const prisma = new PrismaClient();

interface Assignment {
  username: string;
  categoryNames: string[];
}

function parseArgs(argv: string[]): { assignments: Assignment[]; apply: boolean } {
  const assignments: Assignment[] = [];
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true;
    else if (argv[i] === '--assign') {
      const value = argv[++i] ?? '';
      const separator = value.indexOf('=');
      if (separator <= 0) throw new Error(`--assign attend « identifiant=Catégorie[,Catégorie] », reçu : « ${value} »`);
      const categoryNames = value
        .slice(separator + 1)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      if (categoryNames.length === 0) throw new Error(`Aucune catégorie indiquée pour « ${value.slice(0, separator)} »`);
      assignments.push({ username: value.slice(0, separator).trim().toLowerCase(), categoryNames });
    } else throw new Error(`Argument inconnu : ${argv[i]}`);
  }
  return { assignments, apply };
}

async function report(): Promise<void> {
  const orphans = await prisma.user.findMany({
    where: { active: true, role: 'EMPLOYEE', recipientOf: { none: {} } },
    select: { username: true, displayName: true, jobTitle: true, createdAt: true, _count: { select: { requestsCreated: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (orphans.length === 0) {
    console.log('Aucun employé actif sans catégorie : rien à réparer.');
    return;
  }
  console.log('Employés actifs destinataires d’aucune catégorie (jamais proposés à l’affectation) :');
  console.table(
    orphans.map((u) => ({
      identifiant: u.username,
      nom: u.displayName,
      fonction: u.jobTitle ?? '',
      créé: u.createdAt.toISOString().slice(0, 10),
      demandesCréées: u._count.requestsCreated,
    })),
  );
  console.log('Un compte qui ne fait que créer des demandes (ex. enseignant) n’a pas besoin de catégorie.');
  const categories = await prisma.category.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } });
  console.log(`Catégories actives : ${categories.map((c) => `« ${c.name} »`).join(', ')}`);
  console.log('Relancez avec --assign "identifiant=Catégorie" [--apply] pour les rattacher.');
}

async function assign(assignments: Assignment[], apply: boolean): Promise<void> {
  const plan: Array<{ userId: string; username: string; added: Array<{ id: string; name: string }>; before: string[] }> = [];
  for (const { username, categoryNames } of assignments) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, active: true, recipientOf: { select: { categoryId: true } } },
    });
    if (!user) throw new Error(`Compte introuvable : ${username}`);
    if (!user.active) throw new Error(`Compte désactivé, non rattaché : ${username}`);
    const categories = await prisma.category.findMany({ where: { name: { in: categoryNames } }, select: { id: true, name: true } });
    const missing = categoryNames.filter((name) => !categories.some((c) => c.name === name));
    if (missing.length > 0) throw new Error(`Catégorie(s) introuvable(s) : ${missing.join(', ')}`);
    const before = user.recipientOf.map((r) => r.categoryId).sort();
    plan.push({ userId: user.id, username, before, added: categories.filter((c) => !before.includes(c.id)) });
  }

  for (const { username, added } of plan) {
    console.log(
      added.length === 0
        ? `${username} : déjà destinataire de ces catégories.`
        : `${username} : + ${added.map((c) => `« ${c.name} »`).join(', ')}`,
    );
  }
  if (!apply) {
    console.log('Simulation uniquement : ajoutez --apply pour enregistrer.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { userId, added, before } of plan) {
      if (added.length === 0) continue;
      await tx.categoryRecipient.createMany({ data: added.map((c) => ({ categoryId: c.id, userId })), skipDuplicates: true });
      await tx.auditLog.create({
        data: {
          action: 'USER_UPDATED',
          actorId: null,
          targetType: 'User',
          targetId: userId,
          details: {
            reason: 'REPAIR_RECIPIENT_CATEGORIES',
            before: { recipientCategoryIds: before },
            after: { recipientCategoryIds: [...before, ...added.map((c) => c.id)].sort() },
          },
        },
      });
    }
  });
  console.log('Rattachements enregistrés.');
}

async function main(): Promise<void> {
  const { assignments, apply } = parseArgs(process.argv.slice(2));
  if (assignments.length === 0) await report();
  else await assign(assignments, apply);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
