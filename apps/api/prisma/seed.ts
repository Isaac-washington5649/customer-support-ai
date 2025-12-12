import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed initial tenants, API keys, or demo data here.
  await prisma.workspace.create({
    data: {
      id: "seed-workspace",
      name: "Seed Workspace",
      slug: "seed",
      plan: "FREE",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
